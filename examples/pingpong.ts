import unionize, { UnionOf } from "unionize";
import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import { ActorSystem } from "../src/ActorSystem";
import Winston from "winston";
import { any } from "ramda";

const logger = Winston.createLogger({
    format: Winston.format.combine(
        Winston.format.colorize(),
        Winston.format.timestamp(),
        Winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [new Winston.transports.Console()]
});

const Actions = unionize({
    Ping: {},
    Pong: {}
}, {value: "command"});

type Action = UnionOf<typeof Actions>;

class PingPongActor extends Actor {
    private counter = 0;

    constructor(name: string, actorSystem: ActorSystem, other: ActorRef) {
        super(name, actorSystem);
        if (other) {
            this.send(other, Actions.Ping());
        }
    }

    public async receive(from: ActorRef, message: Action): Promise<void> {
        Actions.match(message, {
            "Ping": () => {
                this.counter++;
                if (this.counter > 5) {
                    this.shutdown();
                    return;
                }
                logger.info(this.name +  ": PING");
                this.send(from, Actions.Pong());
            },
            "Pong": () => {
                this.counter++;
                logger.info(this.name +  ": PONG");
                this.send(from, Actions.Ping());
            },
        });
    }
}

const system = new ActorSystem(logger);
system.createActor(PingPongActor, {name: "one"});
system.createActor(PingPongActor, {name: "two"}, system.getActorRef("actors://system/one").orUndefined());

const shutdownHook = () => {
    const children = system.childrenOf(system.getActorRef("actors://system").orUndefined());
    if (any(c => c.isShutdown, children)) {
        system.shutdown();
    } else {
        setTimeout(shutdownHook, 500);
    }
};

setTimeout(shutdownHook, 500);