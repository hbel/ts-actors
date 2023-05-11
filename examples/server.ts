import { createServer } from "http";

import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import type { ActorSystem } from "../src/ActorSystem";
import { DistributedActorSystem } from "../src/DistributedActorSystem";
import { WebsocketDistributor } from "../src/WebsocketDistributor";

// Example system that can be accessed via web app

class Ping extends Actor<string, void|string> {
	private counter = 0;

	constructor(name: string, system: ActorSystem) {
	    super(name, system);
	}

	async receive(from: ActorRef, message: string): Promise<void|string> {
	    switch(message) {
	        case "Ping": {
	            console.log("PING", this.counter);
	            this.counter += 1;
	            this.send(from.name, "Pong");
	            break;
	        }
	        case "Pong": {
	            console.log("PONG", this.counter, from.name);
	            this.counter += 1;
	            this.send(from.name, "Ping");
	            break;
	        }
	        case "SHUTDOWN": {
	            this.system.shutdown();
	            break;
	        }
	        case "ASK": {
	            console.log("GOT ASK");
	            return "An answer";
	        }
	    }
	}
}

const srv = createServer().listen(12345,"127.0.0.1", async () => {
    const distributor1 = new WebsocketDistributor("SA", { server: srv });

    const systemA = new DistributedActorSystem({distributor: distributor1, systemName: "SA"}, () => { return Promise.resolve();});
    await systemA.createActor(Ping, { name: "PING" });
});
