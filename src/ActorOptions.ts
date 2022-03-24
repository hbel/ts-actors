import type { ActorRefImpl } from "./ActorRefImpl";
import type { SupervisionStrategy } from "./SupervisionStrategy";

/**
 * Options to be deployed to an actor
 */
export interface ActorOptions {
    name?: string; // Actor name, defaults to a generated UID. Note that this has to be unique unless overrideExisting is set to true
    strategy?: SupervisionStrategy; // Actor restart strategy
    parent?: ActorRefImpl; // Parent actor, defaults to the system actor omitted
	overwriteExisting?: boolean; // Should this actor replace the actor with the same name
}
