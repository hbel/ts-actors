/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ActorOptions } from "./ActorOptions";
import type { ActorRef } from "./ActorRef";
import { ActorRefImpl } from "./ActorRefImpl";
import type { ActorSystem } from "./ActorSystem";
import type { Logger } from "./Logger";
import type { SupervisionStrategy } from "./SupervisionStrategy";

/**
 * Actor base class. All actors have to derive from this class and need to override at least the {@link receive} function.
 * Also make sure that your derived actor calls the constructor of this base class.
 */
export abstract class Actor<T, U> {
	protected actorRef?: ActorRefImpl;
	public children: ActorRefImpl[] = [];
	public strategy: SupervisionStrategy = "Shutdown";
	public options?: ActorOptions;
	public parent!: ActorRefImpl;
	public isShutdown = false;
	public logger!: Logger;

	/**
	 * Instantiate a new actor. This constructor (or the constructor of derived classes) is never to be called directly, but is
	 * used by the actor system to instantiate new actors via the {@link ActorSystem#createActor createActor} function.
	 * @param name actor name. This is an freely chosen internal name that will also become part of the actors uri.
	 * @param actorSystem the system the actor belongs to
	 * @param params any additional parameters given on actor creation
	 */
	protected constructor(public readonly name: string, private actorSystem: ActorSystem, private params?: any[]) {
		this.actorRef = new ActorRefImpl(this);
	}

	/**
	 * Runs before the actor is started by the actor system. This will run after the actors constructor was called and it's options and parents were set, but
	 * before the actor gets integrated into the actor system's hierarchy.
	 */
	public beforeStart(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Runs after the actor was started and is ready to receive messages.
	 */
	public afterStart(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Runs before the actor gets shut down by the actor system
	 */
	public beforeShutdown(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Runs after the actor was shut down.
	 */
	public afterShutdown(): Promise<void> {
		return Promise.resolve();
	}

	/**
	 * Calling restart will reinstantiate the actor and exchange its old instance for the new one. All child actors will be restartet, too.
	 */
	public async restart(): Promise<void> {
		try {
			if (!this.actorRef) {
				throw new Error("Actor reference got lost. This is a critical error");
			}
			this.children.forEach(c => c.actor.restart());
			const actorRef = await this.system.createActor<T, U>(
				this.constructor as any,
				{ ...this.options, overwriteExisting: true },
				this.params
			);
			actorRef.actor.actorRef = this.actorRef;
			actorRef.actor.children = [...this.children];
			this.system.updateChildren(this.actorRef, actorRef);
			this.actorRef.actor = actorRef.actor;
			this.children = [];
		} catch (e) {
			this.logger.error(e);
			this.shutdown();
		}
	}

	/**
	 * Add a child to the actor. This will usually only be called internally by the actor system when a new actor is created and this actor is given as the parent actor.
	 * @param actor
	 */
	public appendChild(actor: Actor<unknown, unknown>): void {
		this.children.push(actor.ref);
	}

	/**
	 * @returns the actor ref of the actor.
	 */
	public get ref(): ActorRefImpl {
		if (!this.actorRef) {
			throw new Error("No actor ref found for actor. This is a critical error!");
		}
		return this.actorRef;
	}

	/**
	 * @returns the actor system the actor belongs to
	 */
	public get system(): ActorSystem {
		return this.actorSystem;
	}

	/**
	 * Send a message to another actor
	 * @param to actor ref or actor uri of target
	 * @param message message to send
	 */
	public send<S>(to: ActorRef | string, message: S): void {
		const inbox = this.system.inbox;
		if (inbox.isStopped) {
			throw new Error("Actor system has already been shut down!");
		}
		setTimeout(() => {
			if (!inbox.isStopped) {
				inbox.next({ from: this.name, to: typeof to === "string" ? to : to.name, message, askTimeout: 0 });
			}
		}, 0);
	}

	/**
	 * Abstract method that handles all incoming messages
	 * @param from actor that has send the message
	 * @param message message type
	 * @returns promised return value. If the caller used {@link ask}, this value will be returned to the calling actor
	 */
	public abstract receive(from: ActorRef, message: T): Promise<U>;

	/**
	 * Stop processing for this actor. This will also shut down and remove all child actors.
	 */
	public async shutdown(): Promise<void> {
		if (this.isShutdown) {
			this.logger.warn(`${this.name} is already shut down!`);
			return;
		}
		await this.beforeShutdown();
		await Promise.allSettled(
			this.children
				.filter(c => !c.actor.isShutdown)
				.map(async child => {
					this.logger.debug(`${this.name} - Shutting down child: ${child.name}`);
					return await child.actor.shutdown();
				})
		);
		this.isShutdown = true;
		this.logger.debug(`Shut down actor ${this.name}`);
		this.parent?.actor?.removeChild(this.ref);
		this.actorSystem.remove(this.ref);
		await this.afterShutdown();
	}

	/**
	 * Removes a child actor. This should only be called internally by the actor system or the actor itself.
	 * @param child child ref
	 */
	public removeChild(child: ActorRef): void {
		this.children = this.children.filter(c => c != child);
	}

	/**
	 * Exchange an old child actor for a new one. Both actors have to be assigned to the same actor system.
	 * @param oldRef old ref
	 * @param newRef new ref
	 */
	public updateChildren(oldRef: ActorRef, newRef: ActorRef): void {
		const childrenToTraverse = this.children.filter(c => c.name !== oldRef.name);
		const updateChild = this.children.filter(c => c.name === oldRef.name).length > 0;
		if (updateChild) {
			this.children = this.children.filter(c => c.name !== oldRef.name);
			this.children.push(newRef as ActorRefImpl);
		}
		childrenToTraverse.forEach(child => {
			child.actor.updateChildren(oldRef, newRef);
		});
	}

	/**
	 * Send a message to another actor and wait for a response
	 * @param to target actor ref or uri
	 * @param message message to send
	 * @param timeout timeout (defaults to 5000 ms)
	 * @returns promised return value of the target actor
	 */
	public async ask<S, V>(to: ActorRef | string, message: S, timeout = 5000): Promise<V> {
		const actorName = typeof to === "string" ? to : to.name;
		return new Promise(resolve => {
			const inbox = this.system.inbox;
			if (inbox.isStopped) {
				throw new Error("Actor system has already been shut down!");
			}
			setTimeout(() => {
				if (!inbox.isStopped) {
					inbox.next({
						from: this.name,
						to: actorName,
						message,
						ask: (t: unknown) => resolve(t as V),
						askTimeout: timeout,
					});
				}
			}, 0);
		});
	}
}
