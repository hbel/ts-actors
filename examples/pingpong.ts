import type { UnionOf } from "unionize";
import unionize from "unionize";
import Winston from "winston";

import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import { ActorSystem } from "../src/ActorSystem";

const logger = Winston.createLogger({
	format: Winston.format.combine(
		Winston.format.colorize(),
		Winston.format.timestamp(),
		Winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
	),
	transports: [new Winston.transports.Console()],
});

const Actions = unionize(
	{
		Ping: {},
		Pong: {},
	},
	{ value: "command" }
);

type Action = UnionOf<typeof Actions>;

class PingPongActor extends Actor<Action, void> {
	private counter = 0;

	constructor(name: string, actorSystem: ActorSystem, other: ActorRef) {
		super(name, actorSystem);
		if (other) {
			this.send(other, Actions.Ping());
		}
	}

	public async receive(from: ActorRef, message: Action): Promise<void> {
		Actions.match(message, {
			Ping: () => {
				this.counter++;
				if (this.counter > 5) {
					console.log("Shutting down");
					this.system.shutdown();
					return;
				}
				logger.info(this.name + ": PING");
				this.send(from, Actions.Pong());
			},
			Pong: () => {
				this.counter++;
				logger.info(this.name + ": PONG");
				this.send(from, Actions.Ping());
			},
		});
	}
}

ActorSystem.create({ logger }).then(system => {
	system.createActor(PingPongActor, { name: "one" }).then(() => {
		system.createActor(PingPongActor, { name: "two" }, system.getActorRef("actors://system/one"));
	});
});
