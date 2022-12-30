import type { Msg, NatsConnection , Subscription } from "nats";
import { connect,JSONCodec } from "nats";

import type { ActorMessage } from "./ActorMessage";
import type { ActorSystemOptions } from "./ActorSystem";
import { ActorSystem } from "./ActorSystem";

/**
 * Additional options to allow distributed message passing, e.g. between different worker threads, processes or even different machines.
 * Note that this will not create a distributed actor hierarchy, each node will use it's own DistributedActorSystem!
 * 
 * Message passing is using NATS, provide the connection info to your NATS server here.
 * Please be aware that only token-based auth is supported for now.
 */
export interface DistributedActorSystemOptions extends ActorSystemOptions {
	/** Only needed if secret token auth is used in NATS */
	natsSecret?: string; 
	/** Server uri for nats. Defaults to localhost */
	natsServer?: string; 
	/** Port the nats server is running on. */
	natsPort: string;
}

export class DistributedActorSystem extends ActorSystem {
    private natsConnection!: NatsConnection;
    private natsSubscription!: Subscription;

    /**
	 * @inheritDoc 
	 * Create a new distributed actor system. This servers a single node for the distributed system. Messages to local actors are handled normally, messages to other nodes
	 * are transported using nats.
	 * Every node needs a unique system name!
	 * @param options Distribution options.
	 */
    constructor(options: DistributedActorSystemOptions) {
        super(options);
        this.running = false;
        const port = options.natsPort;
        const token = options.natsSecret;
        const server = options.natsServer ?? "localhost";

        this.logger.debug(`Connecting to nats on localhost on port ${port}`);

        connect({
            servers: [server + ":" + port],
            token
        }).then(client => { 
            this.natsConnection = client;
            this.logger.debug("Connection to nats server established");
            this.subscribeToBus();
            this.running = true;
        }).catch(() => {
            this.logger.error("Nats server connection could not be created");
        });

        // The original message handler will be used if the message can be handled
        // locally. This is implemented in the new message handler (this.remoteSubscription)
        this.inboxSubscription.unsubscribe();
        this.inboxSubscription = this.inbox.subscribe(this.remoteSubscription);
        this.handleInboxMessage = super.handleInboxMessage.bind(this);
    }

    /**
	 * Shut down the system and the nats server connection
	 */
    public override shutdown(): void {
        super.shutdown();
        this.natsConnection.close();
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
            this.requestOverNetwork(channel, msg)
                .then((result) => ask(Promise.resolve(result)))
                .catch(() => ask(Promise.reject(`Ask from ${msg.from} timed out`)));
        } else {
            this.sendOverNetwork(channel, msg);
        }
    };

    /**
     * Make an RPC call
     * @param e event to send to the remote processor
     * @returns tuple of returned entity value(s) and transaction id
     */
    private async requestOverNetwork(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): Promise<ActorMessage<unknown, unknown>> {
        return this.natsConnection.request(channel, JSONCodec().encode(msg), { timeout: 5000}).then(m => JSONCodec<ActorMessage<unknown, unknown>>().decode(m.data));
    }

    private sendOverNetwork(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): void {
        this.natsConnection.publish(channel, JSONCodec().encode(msg));
    }

    private async subscribeToBus() {
        this.natsSubscription = this.natsConnection.subscribe(this.systemName+".>");
        for await (const msg of this.natsSubscription) {
            this.onData(msg);
        }
    }

    private onData(message: Msg): void {
        const msg = JSONCodec<ActorMessage<unknown, unknown>>().decode(message.data);
        if (msg.askTimeout) {
            msg.ask = t => message.respond(JSONCodec().encode(t));
        }
        this.inbox.next(msg);
    }
}
