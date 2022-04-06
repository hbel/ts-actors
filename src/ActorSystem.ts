import type { Subscription } from "rxjs";
import { Subject } from "rxjs";
import {v1} from "uuid";

import { Actor } from "./Actor";
import type { ActorMessage } from "./ActorMessage";
import type { ActorOptions } from "./ActorOptions";
import type { ActorRef } from "./ActorRef";
import { ActorRefImpl } from "./ActorRefImpl";
import { ConsoleLogger } from "./ConsoleLogger";
import type { Logger } from "./Logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActorClass<T> = new (name: string, system: ActorSystem, ...args: any[]) => T;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActor = Actor<any, any>;

export interface ActorSystemOptions {
	logger?: Logger;
	systemName?: string;
}

/**
 * Actor system. Orchestrates all local actors.
 */
export class ActorSystem {
    protected actors = new Map<string, AnyActor>(); // All actors orchestrated by the system
    protected systemActor: Actor<unknown, void>; // Base actor for system

    public inbox = new Subject<ActorMessage<unknown, unknown>>(); // Message inbox

	protected inboxSubscription: Subscription; // Primary handler for inbox messages

    protected running = false; // Signals the system is running
	protected readonly logger: Logger;
	protected readonly systemName: string;

	/**
	 * @param options Option object (can be omitted)
	 * @param logger optionally provided logger. System will log to console otherwise
	 * @param systemName optional system name. Defaults to "system"
	 */
	constructor(options?: ActorSystemOptions) {
	    this.logger = options?.logger ?? new ConsoleLogger();
	    this.systemName = options?.systemName ?? "system";
	    this.systemActor = new SystemActor(`actors://${this.systemName}`, this);
	    this.systemActor.logger = this.logger;
	    this.handleInboxMessage = this.handleInboxMessage.bind(this);
	    this.inboxSubscription = this.inbox.subscribe(this.handleInboxMessage);
	    this.running = true;
	}

	/**
	 * Promise that resolves as soon as the system has started.
	 */
	public started(): Promise<void> {
	    return new Promise((resolve) => {
	        const interval = setInterval(() => {
	            if (this.running) { 
	                clearInterval(interval);
	                resolve();
	            }
	        }, 250);
	    });
	}

	/**
	 * Creates a new actor
	 * @param actorType Type of the Actor
	 * @param options Options for the new actor (name, shutdown strategy, parent actor)
	 * @param params Additional arbitrary parameters. Will be passed to the actual actors constructor
	 * @returns Reference to the new actor
	 */
	public createActor<X, Y, T extends Actor<X, Y> = Actor<X, Y>>(actorType: ActorClass<T>, options: ActorOptions, ...params: unknown[]): ActorRefImpl {
	    const [...args] = params;
	    const {name, parent, strategy} = options ?? {};
	    const actorName = (parent ? parent.actor.name + "/" : `actors://${this.systemName}/`) + (name || actorType.name + "_" + v1());
	    if (this.actors.has(actorName) && !options.overwriteExisting) {
	        throw new Error("Actor with that name already exists");
	    }
	    const newActor: Actor<X, Y> = new actorType(actorName, this, ...args) as unknown as Actor<X, Y>;
	    newActor.options = options;
	    newActor.logger = this.logger;
	    newActor.parent = parent ?? this.systemActor.ref;
	    this.actors.set(newActor.name, newActor);
	    if (parent) {
	        parent.actor.appendChild(newActor);
	    } else {
	        this.systemActor.appendChild(newActor);
	    }
	    if (strategy) {
	        newActor.strategy = strategy;
	    }
	    newActor.afterStart();
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
	    return this.actors.get(name)?.ref ?? new Error("Actor not found");
	}

	/**
	 * Send a message (from the system actor) to the target
	 * @param to target actor
	 * @param message 
	 */
	public async send<T>(to: ActorRef | string, message: T) {
	    this.inbox.next({from: this.systemActor.ref.name, to: typeof(to) === "string" ? to : to.name, message, askTimeout: 0});
	}

	/**
	 * Returns the child actors of the given actor (or of the system actor if ref is omitted)
	 * @param ref 
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
	public shutdown(): void {
	    this.systemActor.shutdown.bind(this.systemActor)();
	    this.inbox.complete();
	    this.inbox.unsubscribe();
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
	 * @returns result from the target actor
	 */
	public async ask<S, V>(to: ActorRef | string, message: V, timeout = 5000): Promise<S> {
	    if (typeof(to) === "string") {
	        const actorOrError = this.getActorRef(to);
	        if (actorOrError instanceof ActorRefImpl) {
	            return new Promise((resolve) => {
	                this.systemActor.ref.ask(actorOrError, message, (t: S) => resolve(t), timeout);
	            });
	        } else {
	            return Promise.reject(actorOrError);
	        }
	    } else {
	        return new Promise((resolve) => {
	            this.systemActor.ref.ask(to, message, (t: S) => resolve(t), timeout);
	        });
	    }
	}
    
	/**
	 * Returns whether the actor is currently running
	 */
	public get isShutdown() : boolean {
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
	                message: msg.message
	            };
	        }
	        if(target?.isShutdown) {
	            target = this.systemActor;
	            msg.message = {
	                info: "Received a message for an actor that is already shut down",
	                message: msg.message
	            };
	        }
	        let ts: NodeJS.Timeout | undefined;
	        let timedOut = false;
	        if (msg.ask) {
	            const ask = msg.ask;
	            ts = setTimeout(() => {
	                this.logger && this.logger.debug(`Ask from ${msg.from} timed out at ${Date.now().toLocaleString()}`);
	                timedOut = true;
	                ask(Promise.reject(`Ask from ${msg.from} timed out at ${Date.now().toLocaleString()}`));
	            }, msg.askTimeout);
	        }
			
	        const actor = this.actors.get(msg.from)?.ref ?? this.systemActor.ref;
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
	        if (target) {
	            this.logger.warn(`Unhandled exception in ${target.name}, applying strategy ${target.strategy}`);
	            switch (target.strategy) {
	                case "Restart": target.restart(); break;
	                case "Shutdown": target.shutdown(); break;
	                case "Resume": break;
	            }
	        } else {
	            this.logger.error(e);
	        }
	    }
	}
}

/**
 * The base actor for the whole system
 */
class SystemActor extends Actor<unknown, void> {
    constructor(name: string, actorSystem: ActorSystem) {
        super(name, actorSystem);
        this.shutdown = this.shutdown.bind(this);
    }

    public async receive(from: ActorRef, message: unknown) {
        this.logger.info(`System (from ${from.name}): ${message}`);
    }
}

