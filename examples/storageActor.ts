import { Maybe, maybe } from "tsmonads";
import unionize, { UnionOf, ofType } from "unionize";
import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import { ActorSystem } from "../src/ActorSystem";
import Winston from "winston";

const logger = Winston.createLogger({
    format: Winston.format.combine(
        Winston.format.colorize(),
        Winston.format.timestamp(),
        Winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
    ),
    transports: [new Winston.transports.Console()]
});

const Actions = unionize({
    Append: ofType<number>(),
    Pop: {},
    Empty: {},
}, {value: "command"});

type Action = UnionOf<typeof Actions>;

class StorageActor extends Actor<Action, Maybe<number> | void | boolean> {
    private store: number[] = [];

    constructor(name: string, actorSystem: ActorSystem) {
        super(name, actorSystem);
    }

    public async receive(_from: ActorRef, message: Action): Promise<Maybe<number> | void | boolean> {
        return Actions.match<Maybe<number> | void | boolean>(message, {
            Pop: () => {
                const [head, ...rest] = this.store;
                this.store = rest;
                return maybe(head);
            },
            Empty: () => {
                return this.store.length === 0;
            },
            Append: (x) => {
                this.store.push(x);
            },
        });
    }
}


const getVals = async () => {
    console.log(await system.ask(storage, Actions.Empty()));
    console.log(await system.ask(storage, Actions.Pop()));
    console.log(await system.ask(storage, Actions.Empty()));
    console.log(await system.ask(storage, Actions.Pop()));
    console.log(await system.ask(storage, Actions.Empty()));
    console.log(await system.ask(storage, Actions.Pop()));
    console.log(await system.ask(storage, Actions.Empty()));
    console.log(await system.ask(storage, Actions.Pop()));
    system.shutdown();
};

const system = new ActorSystem(logger);
const storage = system.createActor(StorageActor, {name: "storage"});
system.send(storage, Actions.Append(10));
system.send(storage, Actions.Append(20));
system.send(storage, Actions.Append(30));
getVals();
