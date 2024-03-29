import { Actor } from "../Actor";
import type { ActorRef } from "../ActorRef";
import { ActorRefImpl } from "../ActorRefImpl";
import { ActorSystem } from "../ActorSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class TestActor extends Actor<any, void | number | string> {
	public myStore = "";

	constructor(name: string, actorSystem: ActorSystem) {
		super(name, actorSystem);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async receive(from: ActorRef, message: any): Promise<void | number | string> {
		if (this.myStore !== "started") {
			throw new Error("Actor start order failure");
		}
		let wait: Promise<number>;
		switch (message.command) {
			case "callerName":
				return from.name;
			case "number":
				return 1;
			case "timeout":
				wait = new Promise(resolve => {
					setTimeout(() => resolve(1), 1000);
				});
				return wait;
			case "doSomething":
				this.myStore = message.text;
				break;
			case "kill":
				this.shutdown();
				break;
		}
	}

	public override beforeStart() {
		this.myStore = "beforeStart";
		return Promise.resolve();
	}

	public override async afterStart() {
		if (this.myStore !== "beforeStart") {
			throw new Error("Actor start order failure");
		}
		this.myStore = "started";
	}

	public override afterShutdown() {
		this.myStore = "shut down";
		return Promise.resolve();
	}
}

let system: ActorSystem;

beforeEach(async () => {
	system = await ActorSystem.create();
});

afterEach(() => {
	system.shutdown();
});

describe("Actor", () => {
	it("should be started", async () => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((actor as any).actor.myStore).toBe("started");
		expect(actor.name).toBe("actors://system/testActor");
		expect(system.getActorRef("actors://system/testActor") instanceof ActorRefImpl).toBeTruthy();
		expect(actor.isShutdown).toBeFalsy();
	});
	it("should respond to a message", async done => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		system.send(actor, { command: "doSomething", text: "nice" });
		setTimeout(() => {
			expect((actor.actor as TestActor).myStore).toBe("nice");
			done();
		}, 100);
	});
	it("should answer to ask", async () => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		const name = await system.ask(actor, { command: "callerName" });
		expect(name).toBe("actors://system");
		const num = await system.ask(actor, { command: "number" });
		expect(num).toBe(1);
	});
	it("should timeout", async () => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		const askPromise = system.ask(actor, { command: "timeout" }, 10);
		expect(askPromise).rejects.toBeTruthy();
	});
	it("should set state on afterStart", async () => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		expect((actor.actor as TestActor).myStore).toBe("started");
	});
	it("should set state on afterShutdown", async done => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		actor.actor.shutdown();
		setTimeout(() => {
			expect(actor.actor.isShutdown).toBeTruthy();
			expect((actor.actor as TestActor).myStore).toBe("shut down");
			done();
		}, 50);
	});
});
