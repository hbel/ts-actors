export class DeliveryError extends Error {
	public readonly info: { from: string; to: string; message: unknown };
	constructor(msg: string, payload: any) {
		super(msg);
		if (payload.from) {
			this.info = { from: payload.from, to: payload.to, message: payload.message };
		} else {
			this.info = { from: "", to: "", message: payload };
		}
	}
}

export class UnknownTargetError extends Error {
	constructor(public readonly targetId: string) {
		super(`Unknown target ${targetId}`);
	}
}

export class SocketClosedError extends Error {
	constructor(msg: string, public readonly socketName: string, public readonly errorCode: number) {
		super(msg);
	}
}

export class AuthorizationError extends Error {
	constructor() {
		super("Websocket authorization failed");
	}
}

export class ActorExistsError extends Error {
	constructor(public readonly actorName: string) {
		super(`Actor named ${actorName} already exists`);
	}
}

export class ActorNotFoundError extends Error {
	constructor(public readonly actorName: string) {
		super(`Actor named ${actorName} not found`);
	}
}
