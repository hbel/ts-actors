import type { NatsConnection , Subscription } from "nats";
import { connect,JSONCodec } from "nats";

import type { ActorMessage } from "./ActorMessage";
import type { Distributor } from "./Distributor.js";

/**
 * Distributed messaging using NATS
 */
export class NatsDistributor implements Distributor {
	private readonly server: string;
	private natsConnection!: NatsConnection;
    private natsSubscription!: Subscription;

    /**
	 * 
	 * @param natsPort Port the nats server is running on.
	 * @param natsServer Server uri for nats. Defaults to localhost
	 * @param natsSecret Only needed if secret token auth is used in NATS
	 */
    constructor(private readonly systemName: string, private readonly port: string, server?: string, private readonly secret?: string, ) {
	    this.server = server ?? "localhost";
    }

    /**
	 * @inheritDoc
	 */
    public async connect(): Promise<void> {
        try {
            const client = await connect({
                servers: [this.server + ":" + this.port],
                token: this.secret
            });
				
            this.natsConnection = client;
        } catch (error) {
            console.error("Nats server connection could not be created");
            throw(error);
        }
    }

    /**
	 * @inheritDoc
	 */
    public disconnect(): Promise<void> {
	    return this.natsConnection?.close();
    }

    /**
	 * @inheritDoc
	 */
    public async subscribe(callback: (message: ActorMessage<unknown, unknown>) => void): Promise<void> {
	    this.natsSubscription = this.natsConnection.subscribe(this.systemName+".>");
        for await (const message of this.natsSubscription) {
            const msg = JSONCodec<ActorMessage<unknown, unknown>>().decode(message.data);
            if (msg.askTimeout) {
                msg.ask = t => message.respond(JSONCodec().encode(t));
            }
            callback(msg);
        }
    }

    /**
	 * @inheritDoc
	 */
    public async send(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): Promise<void> {
	    this.natsConnection.publish(channel, JSONCodec().encode(msg));
    }

    /**
	 * @inheritDoc
	 */
    public async ask(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): Promise<ActorMessage<unknown, unknown>> {
	    return this.natsConnection.request(channel, JSONCodec().encode(msg), { timeout: 5000}).then(m => JSONCodec<ActorMessage<unknown, unknown>>().decode(m.data));
    }
}
