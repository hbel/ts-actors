export interface Logger {
	info: (message: unknown) => void;
	debug: (message: unknown) => void;
	warn: (message: unknown) => void;
	error: (message: unknown) => void;
}
