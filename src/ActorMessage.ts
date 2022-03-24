/**
 * Message passed between actors
 */
export interface ActorMessage<T, U> {
    from: string; // Sender's actor address 
    to: string; // Receiver's actor address
    message: T; // Message payload
    ask?: (result: U) => void; // Result callback if message waits for a result
    askTimeout: number; // Ask timeout in ms
}
