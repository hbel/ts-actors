import { createServer } from "http";

import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import type { ActorSystem } from "../src/ActorSystem";
import { DistributedActorSystem } from "../src/DistributedActorSystem";
// import { NatsDistributor } from "../src/NatsDistributor";
import { WebsocketDistributor } from "../src/WebsocketDistributor";

class ErrorActor extends Actor<Error, void> {
	private errors: Error[] = [];

	constructor(name: string, system: ActorSystem) {
		super(name, system);
	}

	public override async receive(_from: ActorRef, message: Error): Promise<void> {
		console.error("ERROR", message);
		this.errors.push(message);
		console.log(this.errors.length, "errors so far");
	}
}

class Ping extends Actor<string, void | string> {
	private counter = 0;

	constructor(name: string, system: ActorSystem) {
		super(name, system);
	}

	async receive(from: ActorRef, message: string): Promise<void | string> {
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
		try {
			switch (message) {
				case "ASK": {
					const result = await this.ask<string, string>("actors://SA/PING", "ASK").catch(() =>
						setTimeout(() => this.send(this.ref, "ASK"), 500)
					);
					console.log("Got answer of PING: ", result);
					break;
				}
				case "PONG": {
					console.log("PONG", this.counter);
					this.counter += 1;
					if (this.counter > 10) {
						this.send(from.name, "SHUTDOWN");
						setTimeout(() => this.send("actors://SB/PONG", "SHUTDOWN"), 250);
						return;
					}

					this.send(from.name, "PING");
					break;
				}
				case "SHUTDOWN": {
					this.system.shutdown();
				}
			}
		} catch (e) {
			console.error("SB", e);
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
		await systemA.createActor(ErrorActor, { name: "ErrorHandler", errorReceiver: true });

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
