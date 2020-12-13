import type { ActorRefImpl } from "./ActorRefImpl";
import type { SupervisionStrategy } from "./SupervisionStrategy";

export interface ActorOptions {
    name?: string;
    strategy?: SupervisionStrategy;
    parent?: ActorRefImpl;
}
