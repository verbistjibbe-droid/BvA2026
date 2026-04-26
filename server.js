const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname);

app.use(express.static(publicPath));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const session = {
  clients: new Set(),
  lastState: null,
  lastPopup: null,
  lastTimeoutData: null,
  lastHalftimeData: null,
  lastPregameAction: null,
};

function broadcast(payload, room, excludeSocket) {
  const message = JSON.stringify(payload);
  room.forEach((client) => {
    if (client !== excludeSocket && client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  session.clients.add(ws);

  if (session.lastState) {
    ws.send(JSON.stringify({ type: 'state', state: session.lastState }));
  }
  if (session.lastPopup) {
    ws.send(JSON.stringify({ type: 'popup', popupData: session.lastPopup }));
  }
  if (session.lastTimeoutData) {
    ws.send(JSON.stringify({ type: 'timeout-data', timeoutData: session.lastTimeoutData }));
  }
  if (session.lastHalftimeData) {
    ws.send(JSON.stringify({ type: 'halftime-data', halftimeData: session.lastHalftimeData }));
  }
  if (session.lastPregameAction) {
    ws.send(JSON.stringify({ type: 'pregame-action', action: session.lastPregameAction }));
  }

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Invalid message:', error);
      return;
    }

    if (!data || !data.type) return;

    if (data.type === 'state' && data.state) {
      session.lastState = data.state;
      broadcast(data, session.clients, ws);
      return;
    }

    if (data.type === 'popup' && data.popupData) {
      session.lastPopup = data.popupData;
      broadcast(data, session.clients, ws);
      return;
    }

    if (data.type === 'timeout-data' && data.timeoutData) {
      session.lastTimeoutData = data.timeoutData;
      broadcast(data, session.clients, ws);
      return;
    }

    if (data.type === 'halftime-data' && data.halftimeData) {
      session.lastHalftimeData = data.halftimeData;
      broadcast(data, session.clients, ws);
      return;
    }

    if (data.type === 'timeout-action' && data.action) {
      broadcast(data, session.clients, ws);
      return;
    }

    if (data.type === 'pregame-action' && data.action) {
      session.lastPregameAction = data.action;
      broadcast(data, session.clients, ws);
      return;
    }

    if (data.type === 'halftime-action' && data.action) {
      broadcast(data, session.clients, ws);
      return;
    }
  });

  ws.on('close', () => {
    session.clients.delete(ws);
  });
});

server.listen(port, () => {
  console.log(`BVA sync server running at http://localhost:${port}`);
});
