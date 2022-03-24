/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ActorOptions } from "./ActorOptions";
import type { ActorRef } from "./ActorRef";
import { ActorRefImpl } from "./ActorRefImpl";
import type { ActorSystem } from "./ActorSystem";
import type { Logger } from "./Logger";
import type { SupervisionStrategy } from "./SupervisionStrategy";
 
export abstract class Actor<T, U> {
    protected actorRef?: ActorRefImpl;
    public children: ActorRefImpl[] = [];
    public strategy: SupervisionStrategy = "Shutdown";
    public options?: ActorOptions;
    public parent!: ActorRefImpl;
    public isShutdown = false;
    public logger!: Logger;

    protected constructor(public readonly name: string, private actorSystem: ActorSystem, private params?: any[]) {
        this.beforeStart();
        this.actorRef = new ActorRefImpl(this);
    }

    public beforeStart (): void { 
        return; 
    }
    public afterStart (): void { 
        return; 
    }
    public beforeShutdown (): void { 
        return; 
    }
    public afterShutdown (): void { 
        return; 
    }

    public restart(): void {
        try {
            if (!this.actorRef) {
                throw new Error("Actor reference got lost. This is a critical error");
            }
            this.children.forEach(c => c.actor.restart());
            const actorRef = this.system.createActor<T, U>(this.constructor as any, {...this.options, overwriteExisting: true}, this.params);
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

    public appendChild(actor: Actor<unknown, unknown>): void {
        this.children.push(actor.ref);
    }

    public get ref() : ActorRefImpl {
        if (!this.actorRef) {
            throw new Error("No actor ref found for actor");
        }
        return this.actorRef;
    }

    public get system() : ActorSystem {
        return this.actorSystem;
    }

    public send<S>(to: ActorRef | string, message: S): void {
        const inbox = this.system.inbox;
        if (inbox.isStopped) {
            throw new Error("Actor system has already been shut down!");
        }
        setTimeout(() => {
            if (!inbox.isStopped) {
                inbox.next({ from: this.name, to: typeof(to) === "string" ? to : to.name, message, askTimeout: 0 });
            }
        }, 0);
    }

    public abstract receive(from: ActorRef, message: T): Promise<U>;

    public shutdown(): void {
        if (this.isShutdown) {
            this.logger.warn(`${this.name} is already shut down!`);
        }
        this.beforeShutdown();
        this.children.filter(c => !c.actor.isShutdown).forEach(child => {
            this.logger.debug(`${this.name} - Shutting down child: ${child.name}`);
            child.actor.shutdown();
        });
        this.isShutdown = true;
        this.parent?.actor?.removeChild(this.ref);
        this.actorSystem.remove(this.ref);
        this.afterShutdown();
    }

    public removeChild(child: ActorRef): void {
        this.children = this.children.filter(c => c != child);
    }

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

    public async ask<S,V>(to: ActorRef | string, message: S, timeout = 5000): Promise<V> {
        const actorName = typeof(to) === "string" ? to : to.name;
        return new Promise((resolve) => {
            const inbox = this.system.inbox;
            if (inbox.isStopped) {
                throw new Error("Actor system has already been shut down!");
            }
            setTimeout(() => {
                if (!inbox.isStopped) {
                    inbox.next({ from: this.name, to: actorName, message, ask: (t: unknown) => resolve(t as V), askTimeout: timeout });
                }
            }, 0);
        });
	
    }
}

