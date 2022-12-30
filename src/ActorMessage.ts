/**
 * Message passed between actors
 */
export interface ActorMessage<T, U> {
	// Sender's actor address 
    from: string; 
	// Receiver's actor address
    to: string; 
	// Message payload
    message: T; 
	// Result callback if message waits for a result
    ask?: (result: U) => void; 
	// Ask timeout in ms if message waits for a result (0 otherwise)
    askTimeout: number; 
}
