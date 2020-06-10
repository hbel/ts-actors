import { ActorSystem } from "../ActorSystem";

describe("ActorSystem", () => {
    it("should initialise", () => {
        const system = new ActorSystem();
        expect(system).not.toBeUndefined();
        const systemActor = system.getActorRef("actors://system");
        expect(systemActor.hasValue).toBeTruthy();
        expect(systemActor.map(s => s.name).unsafeLift()).toBe("actors://system");
        expect(systemActor.map(s => s.isShutdown).unsafeLift()).toBeFalsy();
        expect(system.isShutdown).toBeFalsy();
        system.shutdown();
    });
    it("should properly shut down", () => {
        const system = new ActorSystem();
        system.shutdown();
        expect(system.getActorRef("actors://system").map(s => s.isShutdown).unsafeLift()).toBeTruthy();
        expect(system.isShutdown).toBeFalsy();
    });
    it("should throw if createActor is called without parameters", () => {
        const system = new ActorSystem();
        expect(() => system.createActor()).toThrow();
        system.shutdown();
    });
});
