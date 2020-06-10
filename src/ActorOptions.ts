import { ActorRefImpl } from "./ActorRefImpl";
import { SupervisionStrategy } from "./SupervisionStrategy";

export interface ActorOptions {
    name?: string;
    strategy?: SupervisionStrategy;
    parent?: ActorRefImpl;
}
