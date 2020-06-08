import { UnionOf, ofType, unionize } from "unionize";
import { Actor } from "./Actor";
import { ActorRef } from "./ActorRef";
import { ActorSystem } from "./ActorSystem";
import Winston from "winston";
import { range } from "ramda";

const logger = Winston.createLogger({
    format: Winston.format.combine(
        Winston.format.colorize(),
        Winston.format.timestamp(),
        Winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [new Winston.transports.Console()]
});

const system = new ActorSystem(logger);

const Actions = unionize({
    Start: ofType<ActorRef>(),
    Ask: ofType<string>(),
    Append: {},
    Output: {}
}, {value: "command"});

type Action = UnionOf<typeof Actions>;

class MyActor extends Actor {
    public p1: number;
    public arr: number[] = [];
    public static starts = 0;

    constructor(name: string, actorSystem: ActorSystem, param1: number) {
        super(name, actorSystem);
        this.p1 = param1;
        this.afterStart();
    }

    public async receive(from: ActorRef, action: Action): Promise<unknown> {
        console.warn(this.ref.name);
        const result =  await Actions.match<Promise<void|string>>(action, {
            Start: async (actor) => {
                this.send(from, "Got it!");
                try {
                    const answer = await this.ask(actor, Actions.Ask("gdgfjhfgdjhdfg"), 1000);
                    logger.info("Got " + answer);
                } catch(e) {
                    logger.error(e);
                }
                range(1,10).map(_ => this.send(actor, Actions.Append()));
                this.send(actor, Actions.Output());
                return;
            },
            Append: async () => {
                if (this.arr.length > 10 && this.name.includes("two")) {
                    throw new Error("Waa!");
                }
                console.log(this.name, "Appending");
                this.arr.push(this.p1);
                return;
            },
            Output: async () => {
                console.log(this.name, "Output: ", this.arr);
                return;
            },
            Ask: async (payload) => {
                await new Promise((r) => setTimeout(() => r(), 100));
                return payload.toLocaleUpperCase();
            }
        });
        return result;
    }

    public preStart() {
        MyActor.starts++;
        console.log(this.name, "Will start");
    }

    public afterStart() {
        console.log(this.name, "Started ("+MyActor.starts+"x)");
    }

    public preShutdown() {
        console.log(this.name, "Will shut down");
    }

    public afterShutdown() {
        console.log(this.name, "Shut down");
    }
}

const two = system.createActor(MyActor, {name: "two", strategy: "Resume"}, 2);
const one = system.createActor(MyActor, {name: "one", parent: two}, 1);
const three = system.createActor(MyActor, {name: "three", parent: two}, 3);
console.log(three.name);
system.send(one, Actions.Start(two));
system.send(two, Actions.Start(one));
setTimeout(() => system.shutdown(), 5000);