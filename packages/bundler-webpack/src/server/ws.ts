import type { SpdyServer as Server } from '@umajs/bundler-utils';
import { Server as HttpServer } from 'http';
import { Server as HttpsServer } from 'https';
import { Http2Server } from 'http2';
import WebSocket from '../../compiled/ws';
import {chalk} from "@umajs/utils";

export function createWebSocketServer(
    server: HttpServer | HttpsServer | Http2Server | Server,
){
  const wss = new WebSocket.Server({
    noServer: true,
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.headers['sec-websocket-protocol'] === 'webpack-hmr') {
      wss.handleUpgrade(req, socket as any, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'connected' }));
  });

  wss.on('error', (e: Error & { code: string }) => {
    if (e.code !== 'EADDRINUSE') {
      console.error(
          chalk.red(`WebSocket server error:\n${e.stack || e.message}`),
      );
    }
  });

  return {
    send(message: string) {
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    },

    wss,

    close() {
      wss.close();
    },
  };
}