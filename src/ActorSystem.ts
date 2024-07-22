import type { Subscription } from "rxjs";
import { Subject } from "rxjs";
import { serializeError } from "serialize-error";
import { v1 } from "uuid";

import { Actor } from "./Actor";
import type { ActorMessage } from "./ActorMessage";
import type { ActorOptions } from "./ActorOptions";
import type { ActorRef } from "./ActorRef";
import type { ActorRefImpl } from "./ActorRefImpl";
import { ConsoleLogger } from "./ConsoleLogger";
import { ActorExistsError, ActorNotFoundError } from "./Errors";
import type { Logger } from "./Logger";

/** Actor constructor type */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActorClass<T> = new (name: string, system: ActorSystem, ...args: any[]) => T;

/** An arbitrary actor */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActor = Actor<any, any>;

/**
 * Optional options for the actor system, e.g. it's name and the winston logger to use.
 */
export interface ActorSystemOptions {
	/** optionally provided logger. System will log to console otherwise */
	logger?: Logger;
	/** optional system name. Defaults to "system" */
	systemName?: string;
}

/** Create a shallow proxy with an adaptable name (for proxyiing distributed actors) */
const createProxy = <T, U>(actor: Actor<T, U>) => {
	return {
		send: actor.send,
		ask: actor.ask,
		name: actor.name,
		get isShutdown() {
			return actor.isShutdown;
		},
	} as unknown as ActorRef;
};

/**
 * Actor system. Orchestrates all local actors.
 */
export class ActorSystem {
	protected actors = new Map<string, AnyActor>(); // All actors orchestrated by the system
	protected systemActor: Actor<unknown, void>; // Base actor for system
	protected errorActor?: Actor<unknown, unknown>; // Optional error actor

	public inbox = new Subject<ActorMessage<unknown, unknown>>(); // Message inbox

	protected inboxSubscription: Subscription; // Primary handler for inbox messages

	protected running = false; // Signals the system is running
	protected readonly logger: Logger;
	public readonly systemName: string;

	/**
	 * @param options Option object (can be omitted)
	 */
	protected constructor(options?: ActorSystemOptions) {
		this.logger = options?.logger ?? new ConsoleLogger();
		this.systemName = options?.systemName ?? "system";
		this.systemActor = new SystemActor(`actors://${this.systemName}`, this);
		this.systemActor.logger = this.logger;
		this.handleInboxMessage = this.handleInboxMessage.bind(this);
		this.inboxSubscription = this.inbox.subscribe(this.handleInboxMessage);
		this.running = true;
	}

	public static async create(options?: ActorSystemOptions): Promise<ActorSystem> {
		const system = new ActorSystem(options);
		return system;
	}

	/**
	 * Creates a new actor
	 * @param actorType Type of the Actor
	 * @param options Options for the new actor (name, shutdown strategy, parent actor)
	 * @param params Additional arbitrary constructor parameters. Will be passed to the actual actors constructor
	 * @returns Reference to the new actor
	 */
	public async createActor<X, Y, T extends Actor<X, Y> = Actor<X, Y>>(
		actorType: ActorClass<T>,
		options: ActorOptions,
		...params: unknown[]
	): Promise<ActorRefImpl> {
		const [...args] = params;
		const { name, parent, strategy, errorReceiver } = options ?? {};
		const actorName =
			(parent ? parent.actor.name + "/" : `actors://${this.systemName}/`) + (name || actorType.name + "_" + v1());
		if (this.actors.has(actorName) && !options.overwriteExisting) {
			const error = new ActorExistsError(actorName);
			if (this.errorActor) {
				this.send(this.errorActor.ref, serializeError(error));
			}
			return Promise.reject(error);
		}
		const newActor: Actor<X, Y> = new actorType(actorName, this, ...args) as unknown as Actor<X, Y>;
		newActor.options = options;
		newActor.logger = this.logger;
		newActor.parent = parent ?? this.systemActor.ref;
		await newActor.beforeStart();
		this.actors.set(newActor.name, newActor);
		if (parent) {
			parent.actor.appendChild(newActor);
		} else {
			this.systemActor.appendChild(newActor);
		}
		if (strategy) {
			newActor.strategy = strategy;
		}
		if (errorReceiver) {
			this.errorActor = newActor;
		}
		await newActor.afterStart();
		return newActor.ref;
	}

	/**
	 * Return the actor ref for the actor with the given name
	 * @param name
	 * @returns actor ref or an error object if the actor was not found
	 */
	public getActorRef(name: string): ActorRefImpl | Error {
		if (name === `actors://${this.systemName}`) {
			return this.systemActor.ref;
		}
		const ref = this.actors.get(name)?.ref;
		if (ref) {
			return ref;
		} else {
			const error = new ActorNotFoundError(name);
			if (this.errorActor) {
				this.send(this.errorActor.ref, serializeError(error));
			}
			return error;
		}
	}

	/**
	 * Send a message (from the system actor) to the target
	 * @param to target actor ref or uri
	 * @param message message to send
	 */
	public async send<T>(to: ActorRef | string, message: T) {
		this.inbox.next({
			from: this.systemActor.ref.name,
			to: typeof to === "string" ? to : to.name,
			message,
			askTimeout: 0,
		});
	}

	/**
	 * Returns the child actors of the given actor (or of the system actor if ref is omitted)
	 * @param ref actor ref
	 * @returns all children of the actor
	 */
	public childrenOf(ref?: ActorRefImpl): ActorRefImpl[] {
		if (ref) {
			return ref.actor.children;
		}

		return this.systemActor.children;
	}

	/**
	 * Shutdown the whole system
	 */
	public async shutdown(): Promise<void> {
		await this.systemActor.shutdown.bind(this.systemActor)();
		this.inbox.complete();
		this.inbox.unsubscribe();
		this.running = false;
		this.logger.debug("System shut down");
	}

	/**
	 * Remove an actor from the system
	 */
	public remove(actorRef: ActorRefImpl): void {
		this.actors.delete(actorRef.actor.name);
	}

	/**
	 * Exchange an old actor for the given new one
	 */
	public updateChildren(oldRef: ActorRef, newRef: ActorRef): void {
		this.systemActor.updateChildren(oldRef, newRef);
	}

	/**
	 * Ask another actor using a message
	 * @param to target actor
	 * @param message message
	 * @param timeout optional timeout, defaults to 5 seconds
	 * @returns result value from the target actor
	 */
	public async ask<S, V>(to: ActorRef | string, message: V, timeout = 5000): Promise<S> {
		return new Promise((resolve, reject) => {
			this.inbox.next({
				from: this.systemActor.ref.name,
				to: typeof to === "string" ? to : to.name,
				message,
				askTimeout: timeout,
				ask: (t: unknown) => (t instanceof Error ? reject(t) : resolve(t as S)),
			});
		});
	}

	/**
	 * Returns whether the actor system is currently shut down or is running
	 */
	public get isShutdown(): boolean {
		return !this.running;
	}

	/**
	 * Handles all incoming messages and relays them to the corresponding actors.
	 * @param msg message
	 */
	protected async handleInboxMessage(msg: ActorMessage<unknown, unknown>) {
		try {
			const actorName = msg.to;
			let target = this.actors.get(actorName);
			if (actorName === this.systemActor.name) {
				target = this.systemActor;
			}
			if (!target) {
				target = this.systemActor;
				msg.message = {
					info: "Received a message for a non-existent actor",
					message: msg.message,
				};
			}
			if (target?.isShutdown) {
				target = this.systemActor;
				msg.message = {
					info: "Received a message for an actor that is already shut down",
					message: msg.message,
				};
			}
			let ts: NodeJS.Timeout | undefined;
			let timedOut = false;
			if (msg.ask) {
				const ask = msg.ask;
				ts = setTimeout(() => {
					this.logger &&
						this.logger.debug(
							`Ask from ${msg.from} to ${msg.to} timed out at ${new Date().toLocaleString()}`
						);
					timedOut = true;
					const error = new Error(
						`Ask from ${msg.from} to ${msg.to} timed out at ${new Date().toLocaleString()}`
					);
					ask(error);
					if (this.errorActor) {
						this.send(this.errorActor.ref, serializeError(error));
					}
				}, msg.askTimeout);
			}
			// This is a fix for the fact that distributed actors need to set the name to the original caller, not the local one
			const targetRef = this.actors.get(msg.from)?.ref;
			const actor = targetRef ?? createProxy(this.systemActor);
			if (!targetRef) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(actor as any).name = msg.from;
			}
			const result = await target?.receive(actor, msg.message);
			if (msg.ask) {
				if (ts) {
					clearTimeout(ts);
				}
				if (!timedOut) {
					msg.ask(result);
				}
			}
		} catch (e) {
			const target = this.actors.get(msg.to);
			if (this.errorActor) {
				this.send(this.errorActor.ref, serializeError(e));
			}
			if (target) {
				this.logger.warn(`Unhandled exception in ${target.name}, applying strategy ${target.strategy}`);
				switch (target.strategy) {
					case "Restart":
						target.restart();
						break;
					case "Shutdown":
						target.shutdown();
						break;
					case "Resume":
						break;
				}
			} else {
				this.logger.error(e);
			}
		}
	}
}

/**
 * The base actor for the whole system. This is serving as a parent to all other actors.
 */
class SystemActor extends Actor<unknown, void> {
	constructor(name: string, actorSystem: ActorSystem) {
		super(name, actorSystem);
		this.shutdown = this.shutdown.bind(this);
	}

	public async receive(from: ActorRef, message: unknown) {
		this.logger.info(`System (from ${from.name}): ${JSON.stringify(message)}`);
	}
}
