import { createServer } from "http";

import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import type { ActorSystem } from "../src/ActorSystem";
import { DistributedActorSystem } from "../src/DistributedActorSystem";
import { WebsocketDistributor } from "../src/WebsocketDistributor";

class CustomError extends Error {
	constructor(message: string, public readonly kabang: number) {
		super(message);
	}
}

class Ping extends Actor<string, void | string | Error> {
	private counter = 0;

	constructor(name: string, system: ActorSystem) {
		super(name, system);
	}

	async receive(from: ActorRef, message: string): Promise<void | string | Error> {
		console.log("PING msg", message);
		switch (message) {
			case "PING": {
				console.log("PING", this.counter);
				this.counter += 1;
				this.send(from.name.includes("SA") ? "actors://SB/PONG" : from.name, "PONG");
				break;
			}
			case "SHUTDOWN": {
				this.system.shutdown();
				break;
			}
			case "ASK": {
				return "An answer";
			}
			case "ERROR": {
				return new CustomError("Error message", 7);
			}
		}
	}
}

class Pong extends Actor<string, void> {
	private counter = 0;

	constructor(name: string, system: ActorSystem) {
		super(name, system);
	}

	async receive(from: ActorRef, message: string): Promise<void> {
		console.log("FROM", from.name, "TO", this.name);
		switch (message) {
			case "ASK": {
				const result = await this.ask<string, string>("actors://SA/PING", "ASK");
				console.log("Got answer of PING: ", result);
				break;
			}
			case "PONG": {
				console.log("PONG", this.counter);
				this.counter += 1;
				if (this.counter > 2) {
					setTimeout(() => this.send("actors://SB/PONG", "SHUTDOWN"), 250);

					return;
				}

				setTimeout(() => this.send(from.name, "PING"), 500);
				break;
			}
			case "SHUTDOWN": {
				const err = await this.ask<string, CustomError>("actors://SA/PING", "ERROR");
				console.error(err.message, err.kabang);
				this.send("actors://SA/PING", "SHUTDOWN");
				setTimeout(() => this.system.shutdown(), 250);
			}
		}
	}
}

async function run() {
	let systemA: DistributedActorSystem | undefined = undefined;
	let systemB: DistributedActorSystem | undefined = undefined;
	const srv = createServer().listen(12345, "127.0.0.1", async () => {
		const distributor1 = new WebsocketDistributor("SA", { server: srv });
		const distributor2 = new WebsocketDistributor("SB", "ws://127.0.0.1:12345");

		systemA = await DistributedActorSystem.create({ distributor: distributor1, systemName: "SA" });
		const ping = await systemA.createActor(Ping, { name: "PING" });

		systemB = await DistributedActorSystem.create({ distributor: distributor2, systemName: "SB" });
		const pong = await systemB.createActor(Pong, { name: "PONG" });

		systemA.send(ping, "PING");
		systemB.send(pong, "ASK");
	});
	setInterval(() => {
		if (systemB?.isShutdown && systemA?.isShutdown) {
			srv.close();
			process.exit(0);
		}
	}, 500);
}

run();
