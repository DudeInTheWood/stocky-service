import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { FinnhubTradesProvider } from "../modules/trades/finnhub-trades.provider.js";

export interface HttpApiServerOptions {
  port: number;
  host: string;
  watchlistSymbols: string[];
  tradesProvider: FinnhubTradesProvider;
}

export class HttpApiServer {
  private server: Server | null = null;

  constructor(private readonly options: HttpApiServerOptions) {}

  start(): Promise<void> {
    if (this.server) {
      return Promise.resolve();
    }

    this.server = createServer((request, response) => {
      this.handleRequest(request, response).catch((error) => {
        console.error("Failed to handle API request.", error);
        sendJson(response, 500, {
          error: "Internal server error"
        });
      });
    });

    return new Promise((resolve) => {
      this.server?.listen(this.options.port, this.options.host, () => {
        console.log(
          `Stock watcher API listening on http://${this.options.host}:${this.options.port}.`
        );
        resolve();
      });
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/trades/websocket") {
      const websocketConfig = this.createFinnhubTradesWebSocketConfig(response);

      if (!websocketConfig) {
        return;
      }

      sendJson(response, 200, {
        ...websocketConfig,
        createdAt: new Date().toISOString()
      });
      return;
    }

    sendJson(response, 404, {
      error: "Not found"
    });
  }

  private createFinnhubTradesWebSocketConfig(response: ServerResponse) {
    try {
      return {
        ...this.options.tradesProvider.createSubscription(this.options.watchlistSymbols),
        websocketUrl: this.options.tradesProvider.createWebSocketUrl(),
        subscribeMessages: this.options.tradesProvider.createSubscribeMessages(
          this.options.watchlistSymbols
        )
      };
    } catch (error) {
      console.error("Failed to create Finnhub WebSocket Trades config.", error);
      sendJson(response, 400, {
        error: "Failed to create Finnhub WebSocket Trades config"
      });
      return null;
    }
  }
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify(body));
}
