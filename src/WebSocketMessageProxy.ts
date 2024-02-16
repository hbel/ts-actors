import type { IncomingMessage, Server as HttpServer } from "http";
import type { Server as HttpsServer } from "https";
import type { Duplex } from "stream";
import WebSocket from "ws";

import type { SockMsg } from "./WebSocketClient";

/**
 * Websocket server to proxy messages between different clients
 */
export class WebsocketMessageProxy {
	private server!: WebSocket.Server;
	private sockets = new Map<string, WebSocket.WebSocket>();

	/**
	 * @param host Host to use
	 * @param port Port to use
	 * @param authenticationMiddleware (optional) middleware to authenticate access to the websocket endpoint
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	constructor(
		server: HttpsServer | HttpServer,
		authenticationMiddleware: (request: IncomingMessage, next: (err: Error | undefined) => void) => void = (
			_,
			next
		) => {
			next(undefined);
		}
	) {
		this.init();

		server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			if (request.url === "/ws") {
				authenticationMiddleware(request, (err?: Error) => {
					if (err) {
						socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
						socket.destroy();
						return;
					}

					this.server.handleUpgrade(request, socket, head, webSocket => {
						this.server.emit("connection", webSocket, request);
					});
				});
			}
		});
	}

	private init() {
		this.server = new WebSocket.Server({ noServer: true }); // Will be hosted inside a http server with "upgrade"
		console.log("Websocket MessageProxy ready");
		this.server.on("connection", socket => {
			console.log("Got new connection");
			socket.on("close", (code, reason) => {
				const socketToClose = Array.from(this.sockets.entries()).find(s => s[1] === socket);
				this.sockets.delete(socketToClose?.[0] ?? "");
				console.log("Socket closed", socketToClose?.[0] ?? "", code, reason.toString("utf-8"));
			});
			socket.on("error", err => {
				const socketToClose = Array.from(this.sockets.entries()).find(s => s[1] !== socket);
				this.sockets.delete(socketToClose?.[0] ?? "");
				console.error(socketToClose?.[0] ?? "", err);
			});
			socket.on("message", <T>(data: WebSocket.RawData) => {
				const d = JSON.parse(data.toString()) as SockMsg<T>;
				switch (d.type) {
					case "client": {
						console.log("Got new client with id", d.clientId);
						this.sockets.set(d.clientId, socket);
						break;
					}
					default: {
						// console.log("Proxying", JSON.parse(data.toString()));
						const target = this.sockets.get(d.targetId);
						if (!target) {
							console.error("Unknown target", d.targetId);
						}
						target?.send(data.toString());
						break;
					}
				}
			});
		});
		this.server.on("error", err => {
			console.error("Connection broke down, reinitialising. Error: ", err);
			this.init();
		});
	}

	private closer = (attemptsLeft: number) => {
		if (attemptsLeft === 0 || this.sockets.size === 0) {
			this.server.close();
		} else {
			setTimeout(() => {
				this.closer(attemptsLeft - 1);
			}, 1000);
		}
	};

	/** Close the proxy */
	public close() {
		console.log("MessageProxy is waiting for clients to shut down gracefully");
		this.closer(5);
	}
}
