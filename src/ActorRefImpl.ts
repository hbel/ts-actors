import type { Actor } from "./Actor";
import type { ActorRef } from "./ActorRef";

/**
 * @inheritDoc
 * Implementation of ActorRef
 * Never use this class directly!
 */
export class ActorRefImpl implements ActorRef {
	/**
	 * Creates an ActorRef from an actor
	 * @param actor
	 */
	constructor(public actor: Actor<unknown, unknown>) {}

	/**
	 * @inheritDoc
	 */
	public send<T>(to: ActorRef | string, message: T): void {
		this.actor.send(to, message);
	}

	/**
	 * @inheritDoc
	 */
	public async ask<T, U>(
		to: ActorRef | string,
		message: T,
		askCallback: (message: U) => void,
		askTimeout: number
	): Promise<void> {
		this.actor.ask<T, U>(to, message, askTimeout).then(result => askCallback(result));
	}

	/**
	 * @inheritDoc
	 */
	public get name(): string {
		return this.actor.name;
	}

	/**
	 * @inheritDoc
	 */
	public get isShutdown(): boolean {
		return this.actor.isShutdown;
	}
}
