
/**
 * Reference to an actor. In client code, always use ActorRefs, never try to work on actual actor instances!
 */
export interface ActorRef {
	/**
	 * Send message to another actor
	 */
    send: <T>(to: ActorRef, message: T) => void;
	/**
	 * Ask another actor
	 */
    ask: <T,U>(to: ActorRef, message: T, askCallback: (message: Promise<U>) => void, askTimeout: number) => Promise<void>;
	/**
	 * Actor name
	 */
    name: string;
	/**
	 * Is this actor shut down
	 */
    isShutdown: boolean;
}
