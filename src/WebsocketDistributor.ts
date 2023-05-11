import type { ActorMessage } from "./ActorMessage";
import type { Distributor } from "./Distributor.js";
import { WebsocketClient } from "./WebSocket";

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
	authenticationMiddleware?: (request: any, next: (err: any) => void) => void
}

/**
 * Distributed messaging using Websockets
 */
export class WebsocketDistributor implements Distributor {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private proxy?: any;
	private client!: WebsocketClient;

	/**
	 * 
	 * @param systemName Actor system name
	 * @param protocol Either ws or wss
	 * @param server Either a HttpServer object (if you want to use this distributor as a proxy) or a string containing the full server hostname, port, and protocol
	 */
	constructor(private readonly systemName: string, private server: string | ServerInfo ) {
	    if (typeof server !== "string") { // In the browser, you cannot create a websocket server, so we import this dynamically
	        import("./WebSocketMessageProxy").then(t => {
	            // eslint-disable-next-line @typescript-eslint/no-explicit-any
	            this.proxy = new t.WebsocketMessageProxy(server.server as unknown as any, server.authenticationMiddleware);
	        });
	    }
	}

	/**
	 * @inheritDoc
	 */
	public async connect(): Promise<void> {
	    return Promise.resolve();
	}

	/**
	 * @inheritDoc
	 */
	public disconnect(): Promise<void> {
	    this.client?.close();
	    this.proxy?.close();
	    this.proxy === null;
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
	    } else {
	        serverUri = `${this.server}/ws`;
	    }
	    this.client = new WebsocketClient(serverUri, this.systemName, (origin, questionId, msg) => {
	        if (msg.askTimeout) {
	            msg.ask = <T>(t: T) => this.client.answer(origin, questionId, t);
	        }
	        callback(msg);
	    });
	}

	/**
	 * @inheritDoc
	 */
	public async send(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): Promise<void> {
	    this.client.send(channel.substring(0, channel.indexOf(".")), msg, 5000);
	}

	/**
	 * @inheritDoc
	 */
	public async ask(channel: string, msg: Partial<ActorMessage<unknown, unknown>>): Promise<ActorMessage<unknown, unknown>> {
	    return this.client.ask(channel.substring(0, channel.indexOf(".")), msg);
	}
}
