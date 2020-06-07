import { ActorRef } from "./ActorRef";
export interface ActorMessage {
    from: ActorRef;
    to: ActorRef;
    message: any;
    ask?: (messege: Promise<any>) => void;
    askTimeout: number;
}
