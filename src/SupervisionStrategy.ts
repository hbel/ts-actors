/**
 * What should happen if an actor runs into an unrecoverable error.
 * Restart - Restart the existing actor and all of its children
 * Resume - Just continue working
 * Shutdown - Shut down the actor and all of its children
 */
export type SupervisionStrategy = "Restart" | "Resume" | "Shutdown";
