const projHomeName = document.getElementById('projHomeName');
const projAwayName = document.getElementById('projAwayName');
const projHomeScore = document.getElementById('projHomeScore');
const projAwayScore = document.getElementById('projAwayScore');
const homeProjectionPlayersEl = document.getElementById('homeProjectionPlayers');
const awayProjectionPlayersEl = document.getElementById('awayProjectionPlayers');
const homeTeamTitle = document.getElementById('homeTeamTitle');
const awayTeamTitle = document.getElementById('awayTeamTitle');
const popup = document.getElementById('popup');
const pregameOverlay = document.getElementById('pregameOverlay');
const pregameContent = document.querySelector('.pregame-content');
const pregameModeLabel = document.getElementById('pregameModeLabel');
const pregameTeamLabel = document.getElementById('pregameTeamLabel');
const pregamePlayerRow = document.getElementById('pregamePlayerRow');
const pregamePlayerNumber = document.getElementById('pregamePlayerNumber');
const pregamePlayerName = document.getElementById('pregamePlayerName');

const pathname = window.location.pathname.replace(/^\//, '');
let matchId = null;
if (pathname && !pathname.includes('.') && pathname !== 'projection.html') {
  matchId = pathname;
}
if (!matchId) {
  matchId = new URLSearchParams(window.location.search).get('category') || new URLSearchParams(window.location.search).get('match');
}

let currentState = {
  homeName: 'TEAM A',
  awayName: 'TEAM B',
  homeTeamColor: '#b22222',
  awayTeamColor: '#dc143c',
  period: '1',
  homePlayers: [],
  awayPlayers: [],
  lastScoreText: 'geen recente score',
};

const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bva-sync') : null;
const socket = (location.protocol === 'http:' || location.protocol === 'https:')
  ? new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`)
  : null;
let lastStoredStateJSON = null;

function storageKey(key) {
  return matchId ? `${key}-${matchId}` : key;
}

function sendSocketMessage(message) {
  if (!socket || !matchId) return;
  message.matchId = matchId;
  const payload = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
  }
}

if (socket) {
  socket.addEventListener('open', () => {
    sendSocketMessage({ type: 'join' });
  });

  socket.addEventListener('error', (event) => {
    console.warn('WebSocket error', event);
  });

  socket.addEventListener('close', () => {
    console.warn('WebSocket connection closed');
  });
}
let popupTimeout = null;
let countdownInterval = null;
let currentCountdownType = null;
let pregameScreenMode = 'main';

function splitPlayerName(name) {
  const trimmed = name.trim();
  if (!trimmed) return [''];
  const parts = trimmed.split(' ');
  if (parts.length > 1 && trimmed.length > 14) {
    return [parts[0], parts.slice(1).join(' ')];
  }
  return [trimmed];
}

function createProjectionItem(player, teamColor) {
  const item = document.createElement('div');
  item.className = 'projection-player';
  
  // Apply team color to the projection item
  if (teamColor) {
    item.style.borderColor = teamColor;
  }

  const number = document.createElement('div');
  number.className = 'proj-number';
  number.textContent = player.number;

  const details = document.createElement('div');
  details.className = 'proj-details';
  
  const nameContainer = document.createElement('div');
  nameContainer.className = 'proj-name-container';
  
  const name = document.createElement('div');
  name.className = 'proj-name';
  const nameLines = splitPlayerName(player.name);
  nameLines.forEach((line, index) => {
    const lineEl = document.createElement('span');
    lineEl.className = index === 0 ? 'proj-name-first-line' : 'proj-name-second-line';
    lineEl.textContent = line;
    name.append(lineEl);
  });
  if (nameLines.length > 1) {
    name.classList.add('multi-line');
  }
  
  // Add blinking dot if player is on field
  if (player.onField) {
    const onFieldDot = document.createElement('div');
    onFieldDot.className = 'on-field-dot';
    nameContainer.append(name, onFieldDot);
  } else {
    nameContainer.append(name);
  }
  
  const score = document.createElement('div');
  score.className = 'proj-score';
  score.textContent = `${player.points} pts`;
  details.append(nameContainer, score);

  const fouls = document.createElement('div');
  fouls.className = 'foul-dots';
  for (let i = 0; i < 5; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < player.fouls) dot.classList.add('active');
    if (i === 4 && player.fouls >= 5) dot.classList.add('full');
    fouls.append(dot);
  }

  item.append(number, details, fouls);
  return item;
}

function renderProjection() {
  projHomeName.textContent = currentState.homeName;
  projAwayName.textContent = currentState.awayName;
  homeTeamTitle.textContent = currentState.homeName;
  awayTeamTitle.textContent = currentState.awayName;

  const homeScore = currentState.homePlayers.reduce((sum, player) => sum + player.points, 0);
  const awayScore = currentState.awayPlayers.reduce((sum, player) => sum + player.points, 0);
  projHomeScore.textContent = homeScore;
  projAwayScore.textContent = awayScore;
  
  // Update period display
  const periodDisplay = document.getElementById('periodDisplay');
  if (currentState.period === 'OT') {
    periodDisplay.textContent = 'OVERTIME';
  } else {
    periodDisplay.textContent = `PERIODE ${currentState.period}`;
  }

  homeProjectionPlayersEl.innerHTML = '';
  awayProjectionPlayersEl.innerHTML = '';

  currentState.homePlayers.forEach((player) => {
    const item = createProjectionItem(player, currentState.homeTeamColor);
    homeProjectionPlayersEl.append(item);
  });

  currentState.awayPlayers.forEach((player) => {
    const item = createProjectionItem(player, currentState.awayTeamColor);
    awayProjectionPlayersEl.append(item);
  });

  fitPlayerLists();
}

function fitPlayerLists() {
  [homeProjectionPlayersEl, awayProjectionPlayersEl].forEach((listEl) => {
    if (!listEl) return;
    listEl.style.transform = '';
    listEl.style.height = '';

    const parent = listEl.parentElement;
    const titleElement = parent.querySelector('.team-title');
    const titleHeight = titleElement ? titleElement.offsetHeight : 0;
    const style = getComputedStyle(parent);
    const paddingHeight = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableHeight = parent.clientHeight - titleHeight - paddingHeight - 12;
    const contentHeight = listEl.scrollHeight;

    if (availableHeight <= 0 || contentHeight <= 0) return;

    const scale = Math.min(1, availableHeight / contentHeight);
    listEl.style.height = `${availableHeight}px`;
    listEl.style.transformOrigin = 'top center';
    listEl.style.transform = `scale(${scale})`;
    if (scale < 1) {
      listEl.classList.add('compact');
    } else {
      listEl.classList.remove('compact');
    }
  });
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStoredLastScore() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey('last-score')) || 'null');
    return stored && stored.text ? stored.text : 'geen recente score';
  } catch (e) {
    return 'geen recente score';
  }
}

function syncState() {
  const storedStateJSON = localStorage.getItem(storageKey('bva-match-state'));
  if (storedStateJSON && storedStateJSON !== lastStoredStateJSON) {
    try {
      currentState = JSON.parse(storedStateJSON);
      renderProjection();
      lastStoredStateJSON = storedStateJSON;
    } catch (e) {
      console.error('Onjuiste opgeslagen status in localStorage:', e);
    }
  }
}

if (syncChannel) {
  syncChannel.addEventListener('message', (event) => {
    const message = event.data;
    if (!message || !message.type) return;

    if (message.type === 'state' && message.state) {
      currentState = message.state;
      renderProjection();
      lastStoredStateJSON = JSON.stringify(message.state);
    }

    if (message.type === 'popup' && message.popupData) {
      showPopup(message.popupData);
    }

    if (message.type === 'timeout-data' && message.timeoutData) {
      if (!currentCountdownType) {
        startTimeoutCountdown(message.timeoutData);
      }
    }

    if (message.type === 'halftime-data' && message.halftimeData) {
      if (!currentCountdownType) {
        startHalftimeCountdown(message.halftimeData);
      }
    }

    if (message.type === 'timeout-action' && message.action && message.action.type === 'stop') {
      stopTimeout();
    }

    if (message.type === 'halftime-action' && message.action && message.action.type === 'stop') {
      stopHalftime();
    }

    if (message.type === 'pregame-action' && message.action) {
      handlePregameAction(message.action);
    }
  });
}

if (socket) {
  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (!message || !message.type) return;

      if (message.type === 'state' && message.state) {
        currentState = message.state;
        renderProjection();
        lastStoredStateJSON = JSON.stringify(message.state);
      }

      if (message.type === 'popup' && message.popupData) {
        showPopup(message.popupData);
      }

      if (message.type === 'timeout-data' && message.timeoutData) {
        if (!currentCountdownType) {
          startTimeoutCountdown(message.timeoutData);
        }
      }

      if (message.type === 'halftime-data' && message.halftimeData) {
        if (!currentCountdownType) {
          startHalftimeCountdown(message.halftimeData);
        }
      }

      if (message.type === 'timeout-action' && message.action && message.action.type === 'stop') {
        stopTimeout();
      }

      if (message.type === 'halftime-action' && message.action && message.action.type === 'stop') {
        stopHalftime();
      }

      if (message.type === 'pregame-action' && message.action) {
        handlePregameAction(message.action);
      }
    } catch (error) {
      console.error('Invalid WebSocket message', error);
    }
  });

  socket.addEventListener('error', (event) => {
    console.warn('WebSocket error', event);
  });

  socket.addEventListener('close', () => {
    console.warn('WebSocket connection closed');
  });
}

function updateLastScoreDisplay() {
  const lastScoreElement = document.getElementById('timeoutLastScoreDisplay');
  if (lastScoreElement) {
    const scoreText = currentState.lastScoreText || getStoredLastScore();
    lastScoreElement.textContent = `Laatste score: ${scoreText}`;
  }
}

function updateCountdownDisplay() {
  // Countdown values are updated internally, but the timeout and halftime popups do not show a timer.
}

function showPregameOverlay(mode) {
  pregameScreenMode = mode;
  pregameOverlay.classList.remove('hidden', 'pregame-closing');
  pregameOverlay.classList.toggle('black', mode === 'black');
  pregameModeLabel.textContent = 'FINALES BEKER VAN ANTWERPEN';
  if (mode === 'black') {
    document.querySelector('.main-display').style.display = 'none';
  } else {
    document.querySelector('.main-display').style.display = '';
  }
  animatePregameContent();
}

function showPregameElement(element) {
  if (!element) return;
  element.classList.remove('hidden', 'visible');
  requestAnimationFrame(() => {
    element.classList.add('visible');
  });
}

function hidePregameElement(element) {
  if (!element) return;
  element.classList.remove('visible');
  setTimeout(() => element.classList.add('hidden'), 220);
}

function animatePregameContent() {
  if (!pregameContent) return;
  pregameContent.classList.remove('pregame-appear');
  void pregameContent.offsetWidth;
  pregameContent.classList.add('pregame-appear');
}

function updatePregameScreen(item) {
  if (item.type === 'teamName') {
    pregameTeamLabel.textContent = item.teamName;
    showPregameElement(pregameTeamLabel);
    hidePregameElement(pregamePlayerRow);
  } else if (item.type === 'player') {
    pregameTeamLabel.textContent = item.teamName || '';
    showPregameElement(pregameTeamLabel);
    pregamePlayerNumber.textContent = item.player.number;
    pregamePlayerName.textContent = item.player.name;
    showPregameElement(pregamePlayerRow);
  }
  animatePregameContent();
}

function hidePregameOverlay() {
  pregameOverlay.classList.add('pregame-closing');
  setTimeout(() => {
    pregameOverlay.classList.add('hidden');
    pregameOverlay.classList.remove('pregame-closing');
  }, 240);
  document.querySelector('.main-display').style.display = '';
}

function handlePregameAction(action) {
  if (!action || !action.type) return;

  if (action.type === 'preparePregame') {
    showPregameOverlay(action.screenMode);
    pregameTeamLabel.classList.add('hidden');
    pregamePlayerRow.classList.add('hidden');
  }

  if (action.type === 'startPregameShow') {
    showPregameOverlay(action.screenMode);
    pregameTeamLabel.classList.add('hidden');
    pregamePlayerRow.classList.add('hidden');
  }

  if (action.type === 'showTeamName') {
    showPregameOverlay(action.screenMode || pregameScreenMode || 'main');
    updatePregameScreen({ type: 'teamName', teamName: action.teamName });
  }

  if (action.type === 'showPlayer') {
    showPregameOverlay(action.screenMode || pregameScreenMode || 'main');
    updatePregameScreen({ type: 'player', player: action.player, teamName: action.teamName });
  }

  if (action.type === 'pregameComplete') {
    hidePregameOverlay();
  }
}

window.handlePregameAction = handlePregameAction;

function startTimeoutCountdown(timeoutData) {
  currentCountdownType = 'timeout';
  const mainDisplay = document.querySelector('.main-display');
  const timeoutPopup = document.getElementById('timeoutPopup');
  
  // Update scores in timeout popup
  const homeScore = currentState.homePlayers.reduce((sum, player) => sum + player.points, 0);
  const awayScore = currentState.awayPlayers.reduce((sum, player) => sum + player.points, 0);
  document.getElementById('timeoutProjHomeName').textContent = currentState.homeName;
  document.getElementById('timeoutProjAwayName').textContent = currentState.awayName;
  document.getElementById('timeoutProjHomeScore').textContent = homeScore;
  document.getElementById('timeoutProjAwayScore').textContent = awayScore;
  document.getElementById('timeoutTitle').textContent = `TIME-OUT ${timeoutData.teamName}`;
  document.getElementById('timeoutLastScoreDisplay').textContent = `Laatste score: ${getStoredLastScore()}`;
  
  // Hide main display
  mainDisplay.style.display = 'none';
  timeoutPopup.classList.remove('hidden');
  
  // Start countdown internally, but do not display the timer in the popup.
  let remaining = timeoutData.duration;
  
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining -= 1;
    const timeoutDataUpdate = JSON.parse(localStorage.getItem(storageKey('timeout-data')) || '{}');
    timeoutDataUpdate.remaining = remaining;
    localStorage.setItem(storageKey('timeout-data'), JSON.stringify(timeoutDataUpdate));
    
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      localStorage.removeItem(storageKey('timeout-data'));
      mainDisplay.style.display = '';
      timeoutPopup.classList.add('hidden');
      currentCountdownType = null;
    }
  }, 1000);
}


function startHalftimeCountdown(halftimeData) {
  currentCountdownType = 'halftime';
  const mainDisplay = document.querySelector('.main-display');
  const halftimePopup = document.getElementById('halftimePopup');
  
  // Update scores in halftime popup
  const homeScore = currentState.homePlayers.reduce((sum, player) => sum + player.points, 0);
  const awayScore = currentState.awayPlayers.reduce((sum, player) => sum + player.points, 0);
  document.getElementById('halftimeProjHomeName').textContent = currentState.homeName;
  document.getElementById('halftimeProjAwayName').textContent = currentState.awayName;
  document.getElementById('halftimeProjHomeScore').textContent = homeScore;
  document.getElementById('halftimeProjAwayScore').textContent = awayScore;
  
  // Hide main display
  mainDisplay.style.display = 'none';
  halftimePopup.classList.remove('hidden');
  
  // Start countdown internally, but do not display the timer in the popup.
  let remaining = halftimeData.totalSeconds;
  
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    remaining -= 1;
    const halftimeDataUpdate = JSON.parse(localStorage.getItem(storageKey('halftime-data')) || '{}');
    halftimeDataUpdate.remaining = remaining;
    localStorage.setItem(storageKey('halftime-data'), JSON.stringify(halftimeDataUpdate));
    
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      localStorage.removeItem(storageKey('halftime-data'));
      mainDisplay.style.display = '';
      halftimePopup.classList.add('hidden');
      currentCountdownType = null;
    }
  }, 1000);
}

function stopTimeout() {
  const mainDisplay = document.querySelector('.main-display');
  const timeoutPopup = document.getElementById('timeoutPopup');
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  currentCountdownType = null;
  localStorage.removeItem(storageKey('timeout-data'));
  if (mainDisplay) mainDisplay.style.display = '';
  if (timeoutPopup) timeoutPopup.classList.add('hidden');
}

function stopHalftime() {
  const mainDisplay = document.querySelector('.main-display');
  const halftimePopup = document.getElementById('halftimePopup');
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  currentCountdownType = null;
  localStorage.removeItem(storageKey('halftime-data'));
  if (mainDisplay) mainDisplay.style.display = '';
  if (halftimePopup) halftimePopup.classList.add('hidden');
}

function loadState() {
  const saved = localStorage.getItem(storageKey('bva-match-state'));
  if (saved) {
    currentState = JSON.parse(saved);
    lastStoredStateJSON = saved;
  }
  renderProjection();
}

function showPopup(popupData) {
  if (!popupData || !popupData.player) return;
  
  // Clear any existing timeout
  if (popupTimeout) {
    clearTimeout(popupTimeout);
  }
  
  const { player, type } = popupData;
  const mainDisplay = document.querySelector('.main-display');
  
  // Build popup content
  const typeLabel = type === 'FOUT' ? 'Fout' : type;
  const playerDisplay = `${typeLabel} nummer ${player.number}: ${player.name}`;
  
  // Build stats
  const pointsText = player.points === 1 ? '1 punt' : `${player.points} punten`;
  const foulsText = player.fouls === 1 ? '1 fout' : `${player.fouls} fouten`;
  
  let statsHTML = '';
  if (player.points > 0 || player.fouls > 0) {
    statsHTML = '<div class="popup-stats">';
    statsHTML += `<span>${player.points > 0 ? pointsText : ''}</span>`;
    statsHTML += `<span>${player.fouls > 0 ? foulsText : ''}</span>`;
    statsHTML += '</div>';
  }
  
  popup.innerHTML = `<div class="popup-content">
    <div class="popup-title">${playerDisplay}</div>
    ${statsHTML}
  </div>`;
  
  popup.classList.add('visible');
  mainDisplay.style.display = 'none';
  
  popupTimeout = setTimeout(() => {
    popup.classList.remove('visible');
    mainDisplay.style.display = '';
    popupTimeout = null;
  }, 5000);
}

// Listen for custom events from control page (same window)
window.addEventListener('stateChanged', (e) => {
  currentState = e.detail;
  renderProjection();
});

// Listen for popup events
window.addEventListener('showPopup', (e) => {
  showPopup(e.detail);
});

// Listen for localStorage changes (for cross-window communication)
window.addEventListener('storage', (e) => {
  if (e.key === storageKey('bva-match-state') && e.newValue) {
    syncState();
  }

  if (e.key === storageKey('popup-data') && e.newValue) {
    const popupData = JSON.parse(e.newValue);
    showPopup(popupData);
    localStorage.removeItem(storageKey('popup-data'));
  }

  if (e.key === storageKey('last-score') && e.newValue) {
    updateLastScoreDisplay();
  }
  
  if (e.key === storageKey('timeout-data') && e.newValue) {
    const timeoutData = JSON.parse(e.newValue);
    if (!currentCountdownType) {
      startTimeoutCountdown(timeoutData);
    }
  }
  
  if (e.key === storageKey('halftime-data') && e.newValue) {
    const halftimeData = JSON.parse(e.newValue);
    if (!currentCountdownType) {
      startHalftimeCountdown(halftimeData);
    }
  }

  if (e.key === storageKey('timeout-action') && e.newValue) {
    const action = JSON.parse(e.newValue);
    if (action.type === 'stop') {
      stopTimeout();
    }
    localStorage.removeItem(storageKey('timeout-action'));
  }

  if (e.key === storageKey('halftime-action') && e.newValue) {
    const action = JSON.parse(e.newValue);
    if (action.type === 'stop') {
      stopHalftime();
    }
    localStorage.removeItem(storageKey('halftime-action'));
  }

  if (e.key === storageKey('pregame-action') && e.newValue) {
    const action = JSON.parse(e.newValue);
    handlePregameAction(action);
  }
});

// Check for stored popup data on load
const storedPopupData = localStorage.getItem(storageKey('popup-data'));
if (storedPopupData) {
  const popupData = JSON.parse(storedPopupData);
  showPopup(popupData);
  localStorage.removeItem(storageKey('popup-data'));
}

// Clean up old timeout/halftime data on startup
localStorage.removeItem(storageKey('timeout-data'));
  localStorage.removeItem(storageKey('halftime-data'));

// Also check periodically for popup data (fallback)
setInterval(() => {
  const data = localStorage.getItem(storageKey('popup-data'));
  if (data) {
    const popupData = JSON.parse(data);
    showPopup(popupData);
    localStorage.removeItem(storageKey('popup-data'));
  }
  
  // Also check periodically for timeout/halftime data
  if (!currentCountdownType) {
    const timeoutData = localStorage.getItem(storageKey('timeout-data'));
    if (timeoutData) {
      const parsed = JSON.parse(timeoutData);
      if (parsed.remaining && parsed.remaining > 0) {
        startTimeoutCountdown(parsed);
      }
    }
    
    const halftimeData = localStorage.getItem(storageKey('halftime-data'));
    if (halftimeData) {
      const parsed = JSON.parse(halftimeData);
      if (parsed.remaining && parsed.remaining > 0) {
        startHalftimeCountdown(parsed);
      }
    }
  }

  syncState();
}, 50);

window.addEventListener('resize', () => {
  fitPlayerLists();
});

loadState();
