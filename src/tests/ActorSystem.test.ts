import { ActorRefImpl } from "../ActorRefImpl";
import { ActorSystem } from "../ActorSystem";

describe("ActorSystem", () => {
    it("should initialise", () => {
        const system = new ActorSystem();
        expect(system).not.toBeUndefined();
        const systemActor = system.getActorRef("actors://system");
        expect(systemActor instanceof ActorRefImpl).toBeTruthy();
        expect(systemActor.name).toBe("actors://system");
        expect((systemActor as ActorRefImpl).isShutdown).toBeFalsy();
        expect(system.isShutdown).toBeFalsy();
        system.shutdown();
    });
    it("should properly shut down", async () => {
        const system = new ActorSystem();
        await system.shutdown();
        expect((system.getActorRef("actors://system") as ActorRefImpl).isShutdown).toBeTruthy();
        expect(system.isShutdown).toBeFalsy();
    });
});
