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

let lastState = null;
let lastTimeoutData = null;
let lastHalftimeData = null;
let lastPregameAction = null;
let lastPopup = null;

function broadcast(payload, excludeSocket) {
  const message = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client !== excludeSocket && client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  if (lastState) {
    ws.send(JSON.stringify({ type: 'state', state: lastState }));
  }

  if (lastPopup) {
    ws.send(JSON.stringify({ type: 'popup', popupData: lastPopup }));
  }

  if (lastTimeoutData) {
    ws.send(JSON.stringify({ type: 'timeout-data', timeoutData: lastTimeoutData }));
  }

  if (lastHalftimeData) {
    ws.send(JSON.stringify({ type: 'halftime-data', halftimeData: lastHalftimeData }));
  }

  if (lastPregameAction) {
    ws.send(JSON.stringify({ type: 'pregame-action', action: lastPregameAction }));
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
      lastState = data.state;
      broadcast(data, ws);
      return;
    }

    if (data.type === 'popup' && data.popupData) {
      lastPopup = data.popupData;
      broadcast(data, ws);
      return;
    }

    if (data.type === 'timeout-data' && data.timeoutData) {
      lastTimeoutData = data.timeoutData;
      broadcast(data, ws);
      return;
    }

    if (data.type === 'halftime-data' && data.halftimeData) {
      lastHalftimeData = data.halftimeData;
      broadcast(data, ws);
      return;
    }

    if (data.type === 'timeout-action' && data.action) {
      broadcast(data, ws);
      return;
    }

    if (data.type === 'pregame-action' && data.action) {
      lastPregameAction = data.action;
      broadcast(data, ws);
      return;
    }
  });
});

server.listen(port, () => {
  console.log(`BVA sync server running at http://localhost:${port}`);
});
