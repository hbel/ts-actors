import { SupervisionStrategy } from "./SupervisionStrategy";
import { ActorRefImpl } from "./ActorRefImpl";
export interface ActorOptions {
    name: string;
    strategy: SupervisionStrategy;
    parent: ActorRefImpl;
}
