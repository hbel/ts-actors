import type { ActorMessage } from "./ActorMessage";
import type { Distributor } from "./Distributor.js";
import { WebsocketClient } from "./WebSocketClient";

interface AddressInfo {
	address: string;
	port: number;
}

type NetInfo = AddressInfo | string | null;

/**
 * Server info object
 */
export interface ServerInfo {
	server: { address: () => NetInfo }; // nodejs server object
	secure?: boolean; // if true, use wss protocol, otherwise ws
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	authenticationMiddleware?: (request: any, next: (err: any) => void) => void;
	headers?: Record<string, string>;
}

/**
 * Distributed messaging using Websockets
 */
export class WebsocketDistributor implements Distributor {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private proxy?: any;
	private client!: WebsocketClient;
	private errorHandler!: (e: Error) => void;

	/**
	 *
	 * @param systemName Actor system name
	 * @param protocol Either ws or wss
	 * @param server Either a HttpServer object (if you want to use this distributor as a proxy) or a string containing the full server hostname, port, and protocol
	 * @param token Token to be send with sec-websocket-protocol Authorization
	 */
	constructor(private readonly systemName: string, private server: string | ServerInfo, private token?: string) {
		if (typeof server !== "string") {
			// In the browser, you cannot create a websocket server, so we import this dynamically
			import("./WebSocketMessageProxy").then(t => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.proxy = new t.WebsocketMessageProxy(
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					server.server as unknown as any,
					server.authenticationMiddleware
				);
			});
		}
		this.connect = this.connect.bind(this);
	}

	/**
	 * @inheritDoc
	 */
	public async connect(errorHandler: (e: Error) => void): Promise<void> {
		this.errorHandler = errorHandler;
		return Promise.resolve();
	}

	/**
	 * @inheritDoc
	 */
	public disconnect(): Promise<void> {
		this.client?.close();
		this.proxy?.close();
		return Promise.resolve();
	}

	/**
	 * @inheritDoc
	 */
	public async subscribe(callback: (message: ActorMessage<unknown, unknown>) => void): Promise<void> {
		let serverUri = "";
		if (typeof this.server !== "string") {
			const { address, port } = this.server.server.address() as AddressInfo;
			serverUri = `${this.server.secure ? "wss" : "ws"}://${address}:${port}/ws`;
			this.proxy.errorHandler = this.errorHandler;
		} else {
			serverUri = this.server.includes("/ws") ? this.server : `${this.server}/ws`;
			console.error(serverUri);
		}
		this.client = await WebsocketClient.createClient(
			serverUri,
			this.systemName,
			this.errorHandler,
			(origin, questionId, msg) => {
				if (msg.askTimeout) {
					msg.ask = <T>(t: T) => this.client.answer(origin, questionId, t);
				}
				callback(msg);
			},
			typeof this.server !== "string" ? this.server.headers : undefined,
			this.token
		);
	}

	/**
	 * @inheritDoc
	 */
	public async send(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): Promise<void> {
		return this.client.send(channel.substring(0, channel.indexOf(".")), msg, 5000);
	}

	/**
	 * @inheritDoc
	 */
	public async ask(
		channel: string,
		msg: Partial<ActorMessage<unknown, unknown>>
	): Promise<ActorMessage<unknown, unknown>> {
		return this.client.ask(channel.substring(0, channel.indexOf(".")), msg);
	}
}
