/* eslint-disable @typescript-eslint/no-explicit-any */
import { Maybe, maybe } from "tsmonads";
import { Actor } from "./Actor";
import type { ActorMessage } from "./ActorMessage";
import type { ActorRef } from "./ActorRef";
import type { ActorRefImpl } from "./ActorRefImpl";
import { Subject } from "rxjs";
import type Winston from "winston";
import { isString } from "util";
import moment from "moment";
import {v1} from "uuid";

export class ActorSystem {
    private actors = new Map<string, Actor>();
    private systemActor = new SystemActor("actors://system", this);
    public inbox = new Subject<ActorMessage>();

    private running = false;

    constructor(private logger?: Winston.Logger) {
        this.inbox.subscribe(async (msg: ActorMessage) => {
            try {
                const actorName = (msg.to as ActorRefImpl).actor.name;
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
                if(target.isShutdown) {
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
                        this.logger && this.logger.debug(`Ask from ${msg.from.name} timed out at ${moment().toISOString()}`);
                        timedOut = true;
                        ask(new Promise((_, reject) => reject(`Ask from ${msg.from.name} timed out at ${moment().toISOString()}`)));
                    }, msg.askTimeout);
                }
                const result = await target.receive(msg.from, msg.message);
                if (msg.ask) {
                    if (ts) {
                        clearTimeout(ts);
                    }
                    if (!timedOut) {
                        msg.ask(result);
                    }
                }
            } catch {
                const target = (msg.to as ActorRefImpl).actor;
                this.logger && this.logger.warn(`Unhandled expection in ${target.name}, applying strategy ${target.strategy}`);
                switch (target.strategy) {
                    case "Restart": target.restart(); break;
                    case "Shutdown": target.shutdown(); break;
                    case "Resume": break;
                }                
            }
        });
        this.running = true;
    }

    public createActor(...params: any[]): ActorRefImpl {
        const [actorType, options, ...args] = params;
        if (!actorType) {
            throw new Error("At least an actor type has to be given!");
        }
        const {name, parent, strategy} = options ?? {};
        const actorName = (parent ? parent.actor.name + "/" : "actors://system/") + (name || actorType.name + "_" + v1());
        if (this.actors.has(actorName) && !options.overwriteExisting) {
            throw new Error("Actor with that name already exists");
        }
        const newActor: Actor = new actorType(actorName, this, ...args);
        newActor.options = options;
        newActor.params = args;
        newActor.logger = this.logger;
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

    public getActorRef(name: string): Maybe<ActorRefImpl> {
        if (name === "actors://system") {
            return maybe(this.systemActor.ref);
        }
        return maybe(this.actors.get(name)?.ref);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async send(to: ActorRef, message: any) {
        this.inbox.next({from: this.systemActor.ref, to, message, askTimeout: 0});
    }

    public childrenOf(ref?: ActorRefImpl): ActorRefImpl[] {
        if (ref) {
            return ref.actor.children;
        }
        
        return this.systemActor.children;
    }

    public shutdown(): void {
        this.systemActor.shutdown();
        this.inbox.complete();
        this.inbox.unsubscribe();
    }

    public remove(actorRef: ActorRefImpl): void {
        this.actors.delete(actorRef.actor.name);
    }

    public updateChildren(oldRef: ActorRef, newRef: ActorRef): void {
        this.systemActor.updateChildren(oldRef, newRef);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public async ask(to: ActorRef | string, message: any, timeout = 5000): Promise<void> {
        if (isString(to)) {
            return new Promise((resolve) => {
                this.getActorRef(to).forEach((a: ActorRefImpl) => this.systemActor.ref.ask(a, message, (t) => resolve(t), timeout));
            });
        } else {
            return new Promise((resolve) => {
                this.systemActor.ref.ask(to, message, (t) => resolve(t), timeout);
            });
        }
    }

    
    public get isShutdown() : boolean {
        return !this.running;
    }
    
}

class SystemActor extends Actor {
    constructor(name: string, actorSystem: ActorSystem) {
        super(name, actorSystem);
    }

    public async receive(from: ActorRef, message: any) {
        this.logger && this.logger.info(`System (from ${from.name}): `, message);
    }
}

