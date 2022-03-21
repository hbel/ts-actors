import { Actor } from "../Actor";
import type { ActorRef } from "../ActorRef";
import { ActorSystem } from "../ActorSystem";

class TestActor extends Actor<any, void|number|string> {
    public myStore = "";

    constructor(name: string, actorSystem: ActorSystem) {
        super(name, actorSystem);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async receive(from: ActorRef, message: any): Promise<void|number|string> {
        let wait: Promise<number>;
        switch(message.command) {
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

    public afterStart() {
        this.myStore = "started";
    }

    public afterShutdown() {
        this.myStore = "shut down";
    }
}

let system: ActorSystem;

beforeEach(() => {
    system = new ActorSystem();
});

afterEach(() => {
    system.shutdown();
});

describe("Actor", () => {
    it("should be started", () => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        expect(actor.name).toBe("actors://system/testActor");
        expect(system.getActorRef("actors://system/testActor").hasValue).toBeTruthy();
        expect(actor.isShutdown).toBeFalsy();
    });
    it("should respond to a message", (done) => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        system.send(actor, {command: "doSomething", text: "nice"});
        setTimeout(() => {
            expect((actor.actor as TestActor).myStore).toBe("nice");
            done();
        }, 100);
    });
    it("should answer to ask", async () => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        const name = await system.ask(actor, {command: "callerName"});        
        expect(name).toBe("actors://system");
        const num = await system.ask(actor, {command: "number"});
        expect(num).toBe(1);
    });
    it("should timeout", async (done) => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        try {
            await system.ask(actor, {command: "timeout"}, 10);
        } catch (e) {
            if (typeof(e) === "string") {
                expect(e.startsWith("Ask from actors://system timed out")).toBeTruthy();
                done();
            }
        }
    });
    it("should set state on afterStart", () => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        expect((actor.actor as TestActor).myStore).toBe("started");
    });
    it("should set state on afterShutdown", (done) => {
        const actor = system.createActor(TestActor, {name: "testActor"});
        actor.actor.shutdown();
        setTimeout(() => {
            expect(actor.actor.isShutdown).toBeTruthy();
            expect((actor.actor as TestActor).myStore).toBe("shut down");
            done();
        }, 50);
    });
});
