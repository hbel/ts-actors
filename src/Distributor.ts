import type { ActorMessage } from "./ActorMessage";

/**
 * Interface for RPC implementations that provide the neccessary functionality for distributed actor systems
 */
export interface Distributor {
	/**
	 * Connect to RPC bus
	 */
	connect(errorHandler: (error: Error) => void): Promise<void>;
	/**
	 * Disconnect from RPC bus
	 */
	disconnect(): Promise<void>;
	/**
	 * Subscribe to RPC messages
	 * @param callback function receiving incoming actor messages
	 */
	subscribe(callback: (message: ActorMessage<unknown, unknown>) => void): Promise<void>;
	/**
	 * Send an actor message to the bus
	 * @param channel channel to use
	 * @param message actor message
	 */
	send(channel: string, message: Partial<ActorMessage<unknown, unknown>>): Promise<void>;
	/**
	 * Send an actor message to the bus and wait for an answer
	 * @param channel channel to use
	 * @param message actor message
	 */
	ask(channel: string, message: Partial<ActorMessage<unknown, unknown>>): Promise<ActorMessage<unknown, unknown>>;
}
