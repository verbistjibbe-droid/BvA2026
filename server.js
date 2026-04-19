const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 3000;
const publicPath = path.join(__dirname);

app.use(express.static(publicPath));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const matches = new Map();

function createMatch(matchId) {
  if (!matches.has(matchId)) {
    matches.set(matchId, {
      clients: new Set(),
      lastState: null,
      lastPopup: null,
      lastTimeoutData: null,
      lastHalftimeData: null,
      lastPregameAction: null,
    });
  }
  return matches.get(matchId);
}

app.get('/:category([A-Za-z0-9_-]+)', (req, res) => {
  const matchId = req.params.category;
  createMatch(matchId);
  res.sendFile(path.join(publicPath, 'projection.html'));
});

function broadcast(payload, room, excludeSocket) {
  const message = JSON.stringify(payload);
  room.forEach((client) => {
    if (client !== excludeSocket && client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws) => {
  ws.matchId = null;

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Invalid message:', error);
      return;
    }

    if (!data || !data.type) return;

    if (data.type === 'join' && data.matchId) {
      const match = createMatch(data.matchId);
      ws.matchId = data.matchId;
      match.clients.add(ws);

      if (match.lastState) {
        ws.send(JSON.stringify({ type: 'state', state: match.lastState }));
      }
      if (match.lastPopup) {
        ws.send(JSON.stringify({ type: 'popup', popupData: match.lastPopup }));
      }
      if (match.lastTimeoutData) {
        ws.send(JSON.stringify({ type: 'timeout-data', timeoutData: match.lastTimeoutData }));
      }
      if (match.lastHalftimeData) {
        ws.send(JSON.stringify({ type: 'halftime-data', halftimeData: match.lastHalftimeData }));
      }
      if (match.lastPregameAction) {
        ws.send(JSON.stringify({ type: 'pregame-action', action: match.lastPregameAction }));
      }

      return;
    }

    const matchId = data.matchId || ws.matchId;
    if (!matchId) return;
    const match = createMatch(matchId);

    if (data.type === 'state' && data.state) {
      match.lastState = data.state;
      broadcast(data, match.clients, ws);
      return;
    }

    if (data.type === 'popup' && data.popupData) {
      match.lastPopup = data.popupData;
      broadcast(data, match.clients, ws);
      return;
    }

    if (data.type === 'timeout-data' && data.timeoutData) {
      match.lastTimeoutData = data.timeoutData;
      broadcast(data, match.clients, ws);
      return;
    }

    if (data.type === 'halftime-data' && data.halftimeData) {
      match.lastHalftimeData = data.halftimeData;
      broadcast(data, match.clients, ws);
      return;
    }

    if (data.type === 'timeout-action' && data.action) {
      broadcast(data, match.clients, ws);
      return;
    }

    if (data.type === 'pregame-action' && data.action) {
      match.lastPregameAction = data.action;
      broadcast(data, match.clients, ws);
      return;
    }
  });

  ws.on('close', () => {
    if (ws.matchId) {
      const match = matches.get(ws.matchId);
      if (match) {
        match.clients.delete(ws);
        if (match.clients.size === 0) {
          // keep match state around for later reconnects
        }
      }
    }
  });
});

server.listen(port, () => {
  console.log(`BVA sync server running at http://localhost:${port}`);
});
