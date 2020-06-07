/* eslint-disable @typescript-eslint/no-explicit-any */
import Winston from "winston";
import { isString } from "util";

import { ActorRef } from "./ActorRef";
import { SupervisionStrategy } from "./SupervisionStrategy";
import { ActorRefImpl } from "./ActorRefImpl";
import { ActorOptions } from "./ActorOptions";
import { ActorSystem } from "./ActorSystem";
 
export abstract class Actor {
    protected actorRef?: ActorRefImpl;
    public children: ActorRefImpl[] = [];
    public strategy: SupervisionStrategy = "Shutdown";
    public options?: ActorOptions;
    public params: any;    
    public isShutdown = false;
    public logger?: Winston.Logger;

    protected constructor(public readonly name: string, private actorSystem: ActorSystem) {
        this.preStart();
        this.actorRef = new ActorRefImpl(this);
    }

    public preStart (): void { 
        return; 
    }
    public afterStart (): void { 
        return; 
    }
    public preShutdown (): void { 
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
            const actorRef = this.system.createActor(this.constructor, {...this.options, overwriteExisting: true}, this.params);
            actorRef.actor.actorRef = this.actorRef;                
            actorRef.actor.children = [...this.children];
            this.system.updateChildren(this.actorRef, actorRef);
            this.actorRef.actor = actorRef.actor;
            this.children = [];
        } catch (e) {
            this.logger && this.logger.error(e);
            this.shutdown();
        }
    }

    public appendChild(actor: Actor): void {
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

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async send(to: ActorRef | string, message: any): Promise<void> {
        if (isString(to)) {
            this.actorSystem.getActorRef(to).forEach(a => this.ref.send(a, message));
        } else {
            this.ref.send(to, message);
        }
    }

    public abstract async receive(from: ActorRef, message: any): Promise<any>;

    public shutdown(): void {
        if (this.isShutdown) {
            this.logger && this.logger.warn(this.name, "is already shut down!");
        }
        this.preShutdown();
        this.children.filter(c => !c.actor.isShutdown).forEach(child => {
            this.logger && this.logger.debug(this.name, "Shutting down child: ", child.name);
            child.actor.shutdown();
        });
        this.isShutdown = true;
        this.afterShutdown();
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

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async ask(to: ActorRef | string, message: any, timeout = 5000): Promise<void> {
        if (isString(to)) {
            return new Promise((resolve) => {
                this.actorSystem.getActorRef(to).forEach(a => this.ref.ask(a, message, (t) => resolve(t), timeout));
            });
        } else {
            return new Promise((resolve) => {
                this.ref.ask(to, message, (t) => resolve(t), timeout);
            });
        }
    }
}

