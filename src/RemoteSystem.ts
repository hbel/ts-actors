/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { ActorRefImpl } from "./ActorRefImpl";
import { ActorSystem } from "./ActorSystem";
import { Client, Payload, connect } from "ts-nats";
import { Actor } from "./Actor";
import type { ActorRef } from "./ActorRef";
import { any } from "ramda";

export interface NatsConfig {
    host: string;
    port: number;
    token?: string;
}

export interface RemoteMessage {
    command: "Msg";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
    sender: string;
}

export class RemoteActor extends Actor {
    constructor(name: string, system: ActorSystem, private nats: Client) {
        super(name, system);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async receive(from: ActorRef, payload: any): Promise<any> {
        const result: RemoteMessage = (await this.nats.request(this.name, 5000, { command: "Msg", payload, sender: from.name })).data;
        return result.payload;
    }

    public beforeStart (): void { 
        this.nats.publish(this.name, { command: "beforeStart" });
    }
    public afterStart (): void { 
        this.nats.publish(this.name, { command: "afterStart" });
    }
    public beforeShutdown (): void { 
        this.nats.publish(this.name, { command: "beforeShutdown" });
    }
    public afterShutdown (): void { 
        this.nats.publish(this.name, { command: "afterShutdown" });
    }
}

export class RemoteSystem extends ActorSystem {
    private nats!: Client;

    constructor(natsCfg: NatsConfig) {
        super();
        connect({
            url: natsCfg.host + ":" + natsCfg.port,
            token: natsCfg.token,
            payload: Payload.JSON
        }).then(client => { 
            this.nats = client; 
        });
    }
    public attachRemoteActor(name: string): ActorRefImpl {
        const actor = new RemoteActor(name, this, this.nats);    
        return actor.ref;
    }

    public shutdown(): void {
        super.shutdown();
        this.nats?.close();
    }
}