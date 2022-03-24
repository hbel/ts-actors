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
    public async receive(_: ActorRef, message: any): Promise<void|string> {
        switch(message) {
            case "getState":
                return this.state;
            case "error":
                throw(new Error("Foobar"));
            default:
                this.state = message;
        }
    }
}

let system: ActorSystem;

beforeEach(() => {
    system = new ActorSystem();
});

afterEach(() => {
    system.shutdown();
});

describe("Supervisioned actor", () => {
    it("should shut down by default", (done) => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        system.send(actor, "error");
        setTimeout(() => {
            expect(actor.isShutdown).toBeTruthy();
            done();
        }, 50);
    });
    it("should shut down if supervision strategy is shutdown", (done) => {
        const actor = system.createActor(TestActor, {name: "testActor", strategy: "Shutdown" as SupervisionStrategy});
        system.send(actor, "error");
        setTimeout(() => {
            expect(actor.isShutdown).toBeTruthy();
            done();
        }, 50);
    });
    it("should keep its state and run if supervision strategy is resume", async () => {
        const actor = system.createActor(TestActor, {name: "testActor", strategy: "Resume" as SupervisionStrategy});
        system.send(actor, "foobar");
        system.send(actor, "error");
        const foobar = await system.ask(actor, "getState");
        expect(foobar).toBe("foobar");
    });    
    it("should loose its state and run if supervision strategy is restart", async () => {
        const actor = system.createActor(TestActor, {name: "testActor", strategy: "Restart" as SupervisionStrategy});
        system.send(actor, "foobar");
        system.send(actor, "error");
        const foobar = await system.ask(actor, "getState");
        expect(foobar).toBe("");
    });    
});

describe("For children of supervisioned actors", () => {
    it("should shut down by default", (done) => {
        const parent = system.createActor(TestActor, {name: "parent", strategy: "Shutdown" as SupervisionStrategy});
        const actor = system.createActor(TestActor, {name: "child", parent});
        system.send(parent, "error");
        setTimeout(() => {
            expect(parent.isShutdown).toBeTruthy();
            expect(actor.isShutdown).toBeTruthy();
            done();
        }, 50);
    });
    it("should shut down if supervision strategy is shutdown", (done) => {
        const parent = system.createActor(TestActor, {name: "parent", strategy: "Shutdown" as SupervisionStrategy});
        const actor = system.createActor(TestActor, {name: "child", parent});
        system.send(parent, "error");
        setTimeout(() => {
            expect(parent.isShutdown).toBeTruthy();
            expect(actor.isShutdown).toBeTruthy();
            done();
        }, 500);
    });
    it("should keep its state and run if supervision strategy is resume", async () => {
        const parent = system.createActor(TestActor, {name: "parent", strategy: "Resume" as SupervisionStrategy});
        const actor = system.createActor(TestActor, {name: "child", parent});
        system.send(actor, "foobar");
        system.send(parent, "error");
        const foobar = await system.ask(actor, "getState");
        expect(foobar).toBe("foobar");
    });    
    it("should loose its state and run if supervision strategy is restart", async () => {
        const parent = system.createActor(TestActor, {name: "parent", strategy: "Restart" as SupervisionStrategy});
        const actor = system.createActor(TestActor, {name: "child", parent});
        system.send(actor, "foobar");
        system.send(parent, "error");
        const foobar = await system.ask(actor, "getState");
        expect(foobar).toBe("");
    });
});

