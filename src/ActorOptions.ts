import type { ActorRefImpl } from "./ActorRefImpl";
import type { SupervisionStrategy } from "./SupervisionStrategy";

/**
 * Options to be deployed to an actor
 */
export interface ActorOptions {
	/** Actor name, defaults to a generated UID. Note that this has to be unique unless overrideExisting is set to true */
	name?: string;
	/** Actor restart strategy */
	strategy?: SupervisionStrategy;
	/** Parent actor, defaults to the system actor omitted */
	parent?: ActorRefImpl;
	/** Should this actor replace the actor with the same name */
	overwriteExisting?: boolean;
	/** This actor will receive internal error objects from the actor system. This is meant to be used to handle non-critical errors in an application-specific way */
	errorReceiver?: boolean;
}
