import type { Logger } from "./Logger";

export class ConsoleLogger implements Logger {
	info = (message: unknown) => { console.info(message); };
	debug = (message: unknown) => { console.debug(message); };
	warn = (message: unknown) => { console.warn(message); };
	error = (message: unknown) => { console.error(message); };
}
