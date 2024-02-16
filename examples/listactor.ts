import { createServer } from "http";

import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import type { ActorSystem } from "../src/ActorSystem";
import { DistributedActorSystem } from "../src/DistributedActorSystem";
import { WebsocketDistributor } from "../src/WebsocketDistributor";

export class UpdateElement {
	type = "UpdateElement" as const;
	constructor(public readonly element: Element) {}
}

export class SubscribeElements {
	type = "SubscribeElements" as const;
	constructor(public readonly category: string, public readonly token: string) {}
}

export class UnubscribeElements {
	type = "UnubscribeElements" as const;
	constructor(public readonly category: string, public readonly token: string) {}
}

export class DeleteElement {
	type = "DeleteElement" as const;
	constructor(public readonly id: number) {}
}

export class Element {
	constructor(public readonly id: number, public readonly content: string) {}
}

type ActorMessages = SubscribeElements | UnubscribeElements;

class ListActor extends Actor<ActorMessages, void | string> {
	private subscribers = new Map<string, Set<string>>();
	private categories = new Set<string>();

	constructor(name: string, system: ActorSystem) {
		super(name, system);
		setInterval(() => {
			const id = Math.round(Math.random() * 10);
			const del = Math.random() > 0.5;
			const categoryIndex = Math.round(Math.random() * (this.categories.size - 1));
			const category = Array.from(this.categories.values())[categoryIndex];
			const targets = Array.from(this.subscribers.get(category)?.values() ?? []);
			if (del) {
				targets.map(target => {
					console.log("Deleting", id, target);
					this.send(target, new DeleteElement(id));
				});
			} else {
				targets.map(target => {
					const content = "It's now " + new Date().toString();
					console.log("Sending", id, content, target);
					this.send(target, new UpdateElement(new Element(id, content)));
				});
			}
		}, 1000);
	}

	async receive(from: ActorRef, message: ActorMessages): Promise<void | string> {
		console.warn(from.name, message);
		if (message.token !== "boofar") {
			this.send(from, { type: "Error", error: "Invalid token" });
			return;
		}
		switch (message.type) {
			case "SubscribeElements": {
				console.log("Subscription", message.category);
				this.categories.add(message.category);
				const subscribers = this.subscribers.get(message.category) ?? new Set<string>();
				subscribers.add(from.name);
				this.subscribers.set(message.category, subscribers);
				console.log(
					"Subscribers",
					JSON.stringify(Array.from(this.subscribers.entries())),
					JSON.stringify(Array.from(this.subscribers.get(message.category)?.values() ?? []))
				);
				break;
			}
			case "UnubscribeElements": {
				const subscribers = this.subscribers.get(message.category) ?? new Set<string>();
				subscribers.delete(from.name);
				this.subscribers.set(message.category, subscribers);
				console.log("Subscribers", JSON.stringify(subscribers));
				break;
			}
		}
	}
}

async function run() {
	const srv = createServer().listen(12345, "127.0.0.1", async () => {
		const distributor1 = new WebsocketDistributor("SA", {
			server: srv,
			authenticationMiddleware: (request, next) => {
				const authHeader = request.headers.authorization;
				const error = authHeader === "allesokay" ? undefined : new Error("Authorization failed");
				next(error);
			},
			headers: {
				authorization: "allesokay",
			},
		});

		const systemA = await DistributedActorSystem.create({ distributor: distributor1, systemName: "SA" });
		await systemA.createActor(ListActor, { name: "List" });
	});
}

run();
