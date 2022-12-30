
/**
 * Reference to an actor. In client code, always use ActorRefs, never try to work on actual actor instances!
 */
export interface ActorRef {
	/**
	 * Send message to another actor
	 * @param to Target actor
	 * @param message Message to send
	 */
    send: <T>(to: ActorRef, message: T) => void;
	/**
	 * Ask another actor
	 * @param to Target actor
	 * @param message Message to send
	 * @param askCallback Callback to run after the response from the target has been received
	 * @param askTimeout Timeout, defaults to 5000 ms
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
