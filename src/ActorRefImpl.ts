/* eslint-disable @typescript-eslint/no-explicit-any */
import { Actor } from "./Actor";
import { ActorRef } from "./ActorRef";

export class ActorRefImpl implements ActorRef {
    constructor(public actor: Actor) {
    }
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async send(to: ActorRef, message: any): Promise<void> {
        // console.log(`Sending message from actor ${this.actor.name} to ${to.actor.name}`);
        const inbox = (to as ActorRefImpl).actor.system.inbox;
        if (inbox.isStopped) {
            throw new Error("Actor system has already been shut down!");
        }
        setTimeout(() => {
            if (!inbox.isStopped) {
                inbox.next({ from: this, to, message, askTimeout: 0 });
            }
        }, 0);
    }
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async ask(to: ActorRef, message: any, ask: (message: Promise<any>) => void, askTimeout: number): Promise<void> {
        // console.log(`Sending message from actor ${this.actor.name} to ${to.actor.name}`);
        const inbox = (to as ActorRefImpl).actor.system.inbox;
        if (inbox.isStopped) {
            throw new Error("Actor system has already been shut down!");
        }
        setTimeout(() => {
            if (!inbox.isStopped) {
                inbox.next({ from: this, to, message, ask, askTimeout });
            }
        }, 0);
    }
    public get name(): string {
        return this.actor.name;
    }

    public get isShutdown(): boolean {
        return this.actor.isShutdown;
    }
}
