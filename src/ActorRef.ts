export interface ActorRef {
    send: (to: ActorRef, message: any) => Promise<void>;
    ask: (to: ActorRef, message: any, ask: (message: Promise<any>) => void, askTimeout: number) => Promise<void>;
    name: string;
}
