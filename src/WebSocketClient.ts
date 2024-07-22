import type { MessageEvent } from "isomorphic-ws";
import WebSocket from "isomorphic-ws";
import { v4 } from "uuid";

import { AuthorizationError, DeliveryError, SocketClosedError } from "./Errors";
import { serializeError } from "serialize-error";

/**
 * Socket message base interface
 */
export interface SocketMessage {
	id: string; // Unique ID of message
	originId: string; // Origin ID of the message
	targetId: string; // Target ID of the message
}

/**
 * Arbitrary message that should be send to specific target
 */
export class Message<T> implements SocketMessage {
	type: "msg" = "msg";
	/**
	 * @param id unique message ID
	 * @param originId origin ID
	 * @param targetId target ID
	 * @param payload payload
	 */
	constructor(public id: string, public originId: string, public targetId: string, public payload: T) {}
}

/**
 * Tell the proxy your own client ID
 */
export class ClientId {
	type: "client" = "client";
	/**
	 * @param clientId unique client ID
	 */
	constructor(public clientId: string) {}
}

/**
 * Acknowledge that a message was successfully received.
 */
export class Ack implements SocketMessage {
	type: "ack" = "ack";
	/**
	 * @param id ID (of the received message)
	 * @param originId origin ID (was target of original message)
	 * @param targetId target ID (was origin of original message)
	 */
	constructor(public id: string, public originId: string, public targetId: string) {}

	/** Create an Ack message directly from the original message or answer */
	public static fromMessage<T>(originalMessage: Message<T> | Answer<T>): Ack {
		return new Ack(originalMessage.id, originalMessage.targetId, originalMessage.originId);
	}
}

/**
 * Answer to a received message
 */
export class Answer<T> implements SocketMessage {
	type: "answer" = "answer";
	/**
	 *
	 * @param id unique ID
	 * @param originId origin ID
	 * @param targetId target ID
	 * @param questionId id of original message
	 * @param payload answer payload
	 */
	constructor(
		public id: string,
		public originId: string,
		public targetId: string,
		public questionId: string,
		public payload: T
	) {}
}

/**
 * Union type for all possible messages
 */
export type SockMsg<T> = Message<T> | Ack | Answer<T> | ClientId;

export class WebsocketClient {
	// eslint-disable-next-line @typescript-eslint/ban-types
	private acks = new Map<string, [number, Function, Function]>(); // All outstanding acknowledgements we are waiting for.
	// eslint-disable-next-line @typescript-eslint/ban-types
	private questions = new Map<string, [number, Function, Function]>(); // All open questions we still need answers for.
	private pending = new Map<string, unknown>(); // All pending messages

	private client!: WebSocket;
	private check!: NodeJS.Timeout;
	private keepAlive!: NodeJS.Timeout;
	private errorHandler!: (e: Error) => void;

	private shutdown = false;

	/**
	 *
	 * @param proxy Websocket server address
	 * @param id Client ID
	 * @param onMessage (optional) external callback that gets called whenever a new message is received
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private constructor(
		private id: string,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private onMessage?: (origin: string, questionId: string, payload: any) => void
	) {
		this.check = setInterval(this.handleTimeouts, 5000);
	}

	public static async createClient(
		proxy: string,
		id: string,
		errorHandler: (e: Error) => void,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		onMessage?: (origin: string, questionId: string, payload: any) => void,
		headers?: Record<string, string>,
		token?: string
	): Promise<WebsocketClient> {
		const client = new WebsocketClient(id, onMessage);
		client.errorHandler = errorHandler;
		return client.init(proxy, headers, token).then(() => client);
	}

	private handleTimeouts = () => {
		const t = this.ts();
		const rejectAcks = Array.from(this.acks.entries()).reduce((p, c) => {
			const [key, value] = c;
			if (value[0] < t) {
				return [...p, key];
			}
			return p;
		}, [] as string[]);
		rejectAcks.forEach(acknowledgeMessage => {
			const ack = this.acks.get(acknowledgeMessage);
			if (ack) {
				const error = new DeliveryError(
					`ACK for message ${acknowledgeMessage} is missing`,
					this.pending.get(acknowledgeMessage)!
				);
				this.errorHandler(error);
				this.acks.delete(acknowledgeMessage);
				this.pending.delete(acknowledgeMessage);
			}
		});
		const rejectQuestions = Array.from(this.questions.entries()).reduce((p, c) => {
			const [key, value] = c;
			if (value[0] < t) {
				return [...p, key];
			}
			return p;
		}, [] as string[]);
		rejectQuestions.forEach(answer => {
			const question = this.questions.get(answer);
			if (question) {
				const [, , reject] = question;
				const error = new DeliveryError(`Answer for message ${answer} is missing`, this.pending.get(answer)!);
				this.errorHandler(error);
				this.questions.delete(answer);
				this.pending.delete(answer);
				reject(error);
			}
		});
	};

	private async init(proxy: string, headers: Record<string, string> | undefined, token?: string): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			this.client = new WebSocket(
				proxy,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(token ? ["Authorization", token] : headers ? { headers } : undefined) as any
			);
			this.client.onopen = () => {
				console.log("Connection to proxy established");
				this.trySend(JSON.stringify(new ClientId(this.id)));
				clearInterval(this.keepAlive);
				this.keepAlive = setInterval(() => this.trySend("KA"), 30000);
				resolve();
			};
			this.client.onmessage = <T>(data: MessageEvent | { data: "KA" }) => {
				if (data.data === "KA") {
					// This is just a keep-alive message for the websocket. Ignore it for now.
					return;
				}
				const d = JSON.parse(data.data.toString()) as SockMsg<T>;
				switch (d.type) {
					case "msg": {
						this.trySend(JSON.stringify(new Ack(d.id, this.id, d.originId)));
						this.onMessage?.(d.originId, d.id, d.payload);
						break;
					}
					case "ack": {
						// eslint-disable-next-line @typescript-eslint/no-empty-function
						const [, resolveAck] = this.acks.get(d.id) ?? [0, () => {}, () => {}];
						resolveAck?.();
						this.acks.delete(d.id);
						this.pending.delete(d.id);
						break;
					}
					case "answer": {
						// eslint-disable-next-line @typescript-eslint/no-empty-function
						const [, resolveAnswer] = this.questions.get(d.questionId) ?? [0, () => {}, () => {}];
						resolveAnswer?.(d.payload);
						this.questions.delete(d.questionId);
						this.pending.delete(d.id);
						this.trySend(JSON.stringify(new Ack(d.id, this.id, d.originId)));
						break;
					}
					default:
						console.error("Received unknown message over websocket, ignoring it");
				}
			};
			this.client.onclose = socket => {
				if (this.shutdown) {
					clearInterval(this.keepAlive);
					return;
				}
				const error = new SocketClosedError(
					`Socket to proxy was closed with code ${socket.code}. Trying to reestablish it.`,
					this.id,
					socket.code
				);
				console.warn(error);
				this.errorHandler(error);
				clearInterval(this.keepAlive);
				setTimeout(() => this.init(proxy, headers, token), 500);
			};
			this.client.onerror = error => {
				if (error.message?.includes("401") || error.target?.readyState == 3) {
					console.error("Websocket authorization failed");
					clearInterval(this.check);
					const error = new AuthorizationError();
					this.errorHandler(error);
					reject(error);
					return;
				}
				console.error("Error on websocket. Reconnecting.");
				this.errorHandler(new Error(error.message));
				clearInterval(this.keepAlive);
				setTimeout(() => this.init(proxy, headers, token), 2000);
			};
		});
	}

	public close() {
		clearInterval(this.check);
		this.shutdown = true;
		this.client.close();
	}

	private ts(): number {
		return Date.now().valueOf();
	}

	/** Send a message to the given target */
	public send<T>(targetId: string, msg: T, timeout = 5000): Promise<void> {
		return new Promise((resolve, reject) => {
			const id = v4();
			const m = new Message(id, this.id, targetId, msg);
			this.acks.set(id, [this.ts() + timeout, resolve, reject]);
			this.pending.set(id, msg);
			this.trySend(JSON.stringify(m));
		});
	}

	/** Send an answer for the given question to the target */
	public answer<T>(targetId: string, questionId: string, msg: T, timeout = 5000): Promise<void> {
		return new Promise((resolve, reject) => {
			const id = v4();
			if (msg instanceof Error) {
				msg = serializeError(msg) as any;
			}
			const m = new Answer(id, this.id, targetId, questionId, msg);
			this.acks.set(id, [this.ts() + timeout, resolve, reject]);
			this.pending.set(id, msg);
			this.trySend(JSON.stringify(m));
		});
	}

	/** Ask a question to the target */
	public ask<T, U>(targetId: string, msg: T, timeout = 5000): Promise<U> {
		return new Promise((resolve, reject) => {
			const id = v4();
			const m = new Message(id, this.id, targetId, msg);
			this.questions.set(id, [this.ts() + timeout, resolve, reject]);
			this.pending.set(id, msg);

			this.trySend(JSON.stringify(m));
		});
	}

	private trySend(message: string): void {
		if (this.client.readyState === this.client.CONNECTING) {
			// Socket is not connected yet. Retry sending after a short pause.
			setTimeout(() => this.trySend(message), 100);
			return;
		}
		if (this.client.readyState !== this.client.OPEN) {
			// We are not solving this hear. The acknowledgement and timeout handling will take care of the failure.
			console.error("Trying to send on websocket but it is already closing or closed.");
			return;
		}
		this.client.send(message);
	}
}
