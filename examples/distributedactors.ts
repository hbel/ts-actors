import { Actor } from "../src/Actor";
import type { ActorRef } from "../src/ActorRef";
import type { ActorSystem } from "../src/ActorSystem";
import { DistributedActorSystem } from "../src/DistributedActorSystem";

class Ping extends Actor<string, void|string> {
	private counter = 0;

	constructor(name: string, system: ActorSystem) {
	    super(name, system);
	}

	async receive(from: ActorRef, message: string): Promise<void|string> {
	    switch(message) {
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
	    switch(message) {
	        case "ASK": {
	            const result = await this.ask<string, string>("actors://SA/PING", "ASK");
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
	}
}

const systemA = new DistributedActorSystem({systemName: "SA", natsPort: "9999"});
const ping = systemA.createActor(Ping, { name: "PING" });

const systemB = new DistributedActorSystem({systemName: "SB", natsPort: "9999"});
const pong = systemB.createActor(Pong, { name: "PONG" });

systemA.started().then(() => systemA.send(ping, "PING"));
systemB.started().then(() => systemB.send(pong, "ASK"));
