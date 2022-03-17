/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ActorRef } from "./ActorRef";
export interface ActorMessage {
    from: ActorRef;
    to: ActorRef;
    message: any;
    ask?: (message: Promise<any>) => void;
    askTimeout: number;
}
