import { Actor } from "../Actor";
import type { ActorRef } from "../ActorRef";
import { ActorSystem } from "../ActorSystem";
import type { SupervisionStrategy } from "../SupervisionStrategy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
class TestActor extends Actor<any, void | string> {
	public state = "";

	constructor(name: string, actorSystem: ActorSystem) {
		super(name, actorSystem);
		this.shutdown = this.shutdown.bind(this);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	public async receive(_: ActorRef, message: any): Promise<void | string> {
		switch (message) {
			case "getState":
				return this.state;
			case "error":
				throw new Error("Foobar");
			default:
				this.state = message;
		}
	}
}

let system: ActorSystem;

beforeEach(async () => {
	system = await ActorSystem.create();
});

afterEach(() => {
	system.shutdown();
});

describe("Supervisioned actor", () => {
	it("should shut down by default", async done => {
		const actor = await system.createActor(TestActor, { name: "testActor" });
		system.send(actor, "error");
		setTimeout(() => {
			expect(actor.isShutdown).toBeTruthy();
			done();
		}, 150);
	});
	it("should shut down if supervision strategy is shutdown", async done => {
		const actor = await system.createActor(TestActor, {
			name: "testActor",
			strategy: "Shutdown" as SupervisionStrategy,
		});
		system.send(actor, "error");
		setTimeout(() => {
			expect(actor.isShutdown).toBeTruthy();
			done();
		}, 50);
	});
	it("should keep its state and run if supervision strategy is resume", async () => {
		const actor = await system.createActor(TestActor, {
			name: "testActor",
			strategy: "Resume" as SupervisionStrategy,
		});
		system.send(actor, "foobar");
		system.send(actor, "error");
		const foobar = await system.ask(actor, "getState");
		expect(foobar).toBe("foobar");
	});
	it("should loose its state and run if supervision strategy is restart", async () => {
		const actor = await system.createActor(TestActor, {
			name: "testActor",
			strategy: "Restart" as SupervisionStrategy,
		});
		system.send(actor, "foobar");
		system.send(actor, "error");
		await new Promise(resolver => setTimeout(resolver, 500));
		const foobar = await system.ask(actor, "getState");
		expect(foobar).toBe("");
	});
});

describe("For children of supervisioned actors", () => {
	it("should shut down by default", async done => {
		const parent = await system.createActor(TestActor, {
			name: "parent",
			strategy: "Shutdown" as SupervisionStrategy,
		});
		const actor = await system.createActor(TestActor, { name: "child", parent });
		system.send(parent, "error");
		setTimeout(() => {
			expect(parent.isShutdown).toBeTruthy();
			expect(actor.isShutdown).toBeTruthy();
			done();
		}, 50);
	});
	it("should shut down if supervision strategy is shutdown", async done => {
		const parent = await system.createActor(TestActor, {
			name: "parent",
			strategy: "Shutdown" as SupervisionStrategy,
		});
		const actor = await system.createActor(TestActor, { name: "child", parent });
		system.send(parent, "error");
		setTimeout(() => {
			expect(parent.isShutdown).toBeTruthy();
			expect(actor.isShutdown).toBeTruthy();
			done();
		}, 500);
	});
	it("should keep its state and run if supervision strategy is resume", async () => {
		const parent = await system.createActor(TestActor, {
			name: "parent",
			strategy: "Resume" as SupervisionStrategy,
		});
		const actor = await system.createActor(TestActor, { name: "child", parent });
		system.send(actor, "foobar");
		system.send(parent, "error");
		const foobar = await system.ask(actor, "getState");
		expect(foobar).toBe("foobar");
	});
	it("should loose its state and run if supervision strategy is restart", async () => {
		const parent = await system.createActor(TestActor, {
			name: "parent",
			strategy: "Restart" as SupervisionStrategy,
		});
		const actor = await system.createActor(TestActor, { name: "child", parent });
		system.send(actor, "foobar");
		system.send(parent, "error");
		await new Promise(resolver => setTimeout(resolver, 500));
		const foobar = await system.ask(actor, "getState");
		expect(foobar).toBe("");
	});
});
