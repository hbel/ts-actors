import type { ActorMessage } from "./ActorMessage";
import type { ActorSystemOptions } from "./ActorSystem";
import { ActorSystem } from "./ActorSystem";
import type { Distributor } from "./Distributor";

/**
 * Additional options to allow distributed message passing, e.g. between different worker threads, processes or even different machines.
 * Note that this will not create a distributed actor hierarchy, each node will use it's own DistributedActorSystem!
 *
 * Message passing is using NATS, provide the connection info to your NATS server here.
 * Please be aware that only token-based auth is supported for now.
 */
export interface DistributedActorSystemOptions extends ActorSystemOptions {
	distributor: Distributor;
}

export class DistributedActorSystem extends ActorSystem {
	private readonly distributor: Distributor;

	/**
	 * Create a new distributed actor system. This servers a single node for the distributed system. Messages to local actors are handled normally, messages to other nodes
	 * are transported using nats.
	 * Every node needs a unique system name!
	 * @param options Distribution options (and general actor system options).
	 */
	protected constructor(options: DistributedActorSystemOptions) {
		super(options);
		this.running = false;
		this.distributor = options.distributor;

		// The original message handler will be used if the message can be handled
		// locally. This is implemented in the new message handler (this.remoteSubscription)
		this.inboxSubscription.unsubscribe();
		this.inboxSubscription = this.inbox.subscribe(this.remoteSubscription);
		this.handleInboxMessage = super.handleInboxMessage.bind(this);
	}

	public static override async create(options: DistributedActorSystemOptions): Promise<DistributedActorSystem> {
		const system = new DistributedActorSystem(options);
		try {
			await system.distributor.connect();
			await system.distributor.subscribe(msg => system.inbox.next(msg));
		} catch {
			throw new Error("RPC bus connection could not be created");
		}
		system.logger.debug("Connection to RPC bus established");
		system.running = true;
		return system;
	}

	/**
	 * Shut down the system and the distributed server connection
	 */
	public override async shutdown(): Promise<void> {
		await this.distributor.disconnect();
		await super.shutdown();
	}

	private remoteSubscription = async (msg: ActorMessage<unknown, unknown>) => {
		const actorName = msg.to;

		// Check if message can be handled locally. If so, use the base class' message handler
		if (actorName.startsWith(`actors://${this.systemName}/`)) {
			return this.handleInboxMessage(msg);
		}

		// Otherwise, generate channel name from actor name and send message to the remote actor system
		const channel = actorName.replace("actors://", "").replaceAll("/", ".");

		if (msg.ask) {
			const ask = msg.ask;
			this.distributor
				.ask(channel, msg)
				.then(result => ask(Promise.resolve(result)))
				.catch(() => ask(Promise.reject(`Ask from ${msg.from} to ${msg.to}  timed out`)));
		} else {
			this.distributor
				.send(channel, msg)
				.catch(error =>
					this.logger.error(
						`ACK failure on sending a message from ${msg.from} to ${
							msg.to
						}. The message was not delivered: ${error.toString()}`
					)
				);
		}
	};
}
