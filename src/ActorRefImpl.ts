import type { Actor } from "./Actor";
import type { ActorRef } from "./ActorRef";

export class ActorRefImpl implements ActorRef {
    /**
	 * Creates an ActorRef from an actor
	 * @param actor 
	 */
    constructor(public actor: Actor<unknown, unknown>) {
    }

    /**
	 * @inheritdoc
	 */
    public send<T>(to: ActorRef, message: T): void {
        this.actor.send(to, message);
    }

    /**
	 * @inheritdoc
	 */
    public async ask<T, U>(to: ActorRef, message: T, askCallback: (message: U) => void, askTimeout: number): Promise<void> {
        this.actor.ask<T, U>(to, message, askTimeout).then(result => askCallback(result));
    }

    /**
	 * @inheritdoc
	 */
    public get name(): string {
        return this.actor.name;
    }

    /**
	 * @inheritdoc
	 */
    public get isShutdown(): boolean {
        return this.actor.isShutdown;
    }
}
