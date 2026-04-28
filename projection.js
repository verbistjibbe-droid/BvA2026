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
  return key;
}

function sendSocketMessage(message) {
  if (!socket) return;
  const payload = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
  }
}

if (socket) {
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
  const trimmed = (name || '').trim();
  if (!trimmed) return [''];
  // if name is short, keep on one line
  if (trimmed.length <= 25) return [trimmed];

  // try to split on a space close to the middle
  const mid = Math.floor(trimmed.length / 2);
  const leftSpace = trimmed.lastIndexOf(' ', mid);
  const rightSpace = trimmed.indexOf(' ', mid + 1);
  let splitIndex = -1;
  if (leftSpace > -1) splitIndex = leftSpace;
  else if (rightSpace > -1) splitIndex = rightSpace;
  else splitIndex = 25; // fallback hard split

  const first = trimmed.slice(0, splitIndex).trim();
  const second = trimmed.slice(splitIndex + 1).trim();
  return [first, second];
}

function createProjectionItem(player, teamColor) {
  const item = document.createElement('div');
  item.className = 'projection-player';
  // Apply team color to the projection item border
  if (teamColor) item.style.borderColor = teamColor;

  const number = document.createElement('div');
  number.className = 'proj-number';
  number.textContent = player.number;

  const details = document.createElement('div');
  details.className = 'proj-details';

  // Name area: single line unless very long (>25 chars)
  const name = document.createElement('div');
  name.className = 'proj-name';
  const nameLines = splitPlayerName(player.name);
  if (nameLines.length === 1) {
    name.textContent = nameLines[0];
  } else {
    const first = document.createElement('span');
    first.className = 'proj-name-first-line';
    first.textContent = nameLines[0];
    const second = document.createElement('span');
    second.className = 'proj-name-second-line';
    second.textContent = nameLines[1];
    name.append(first, second);
    name.classList.add('multi-line');
  }

  details.appendChild(name);

  // Right container: points + separator (space or blinking dot) + fouls
  const right = document.createElement('div');
  right.className = 'proj-right';

  // Points: show only when > 0 and append 'pts'
  if (player.points && player.points > 0) {
    const points = document.createElement('div');
    points.className = 'proj-points';
    points.textContent = `${player.points}pts`;
    right.appendChild(points);
  }

  // Separator between points and fouls: blinking green dot when player on field, otherwise a small spacer
  if (player.onField) {
    const sepDot = document.createElement('div');
    sepDot.className = 'on-field-dot';
    right.appendChild(sepDot);
  } else {
    const spacer = document.createElement('div');
    spacer.className = 'proj-sep';
    right.appendChild(spacer);
  }

  const fouls = document.createElement('div');
  fouls.className = 'foul-dots';
  for (let i = 0; i < 5; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < player.fouls) dot.classList.add('active');
    if (i === 4 && player.fouls >= 5) dot.classList.add('full');
    fouls.append(dot);
  }

  right.appendChild(fouls);

  item.append(number, details, right);
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

  // Render players sorted by number (ascending: smallest number at top)
  const sortedHome = (currentState.homePlayers || []).slice().sort((a, b) => {
    const na = parseInt(a && a.number, 10) || 0;
    const nb = parseInt(b && b.number, 10) || 0;
    return na - nb;
  });

  const sortedAway = (currentState.awayPlayers || []).slice().sort((a, b) => {
    const na = parseInt(a && a.number, 10) || 0;
    const nb = parseInt(b && b.number, 10) || 0;
    return na - nb;
  });

  sortedHome.forEach((player) => {
    const item = createProjectionItem(player, currentState.homeTeamColor);
    homeProjectionPlayersEl.append(item);
  });

  sortedAway.forEach((player) => {
    const item = createProjectionItem(player, currentState.awayTeamColor);
    awayProjectionPlayersEl.append(item);
  });

  fitPlayerLists();
}

function fitPlayerLists() {
  [homeProjectionPlayersEl, awayProjectionPlayersEl].forEach((listEl) => {
    if (!listEl) return;

    const players = listEl.children.length;

    listEl.classList.remove("compact", "ultra");

    if (players >= 11) {
      listEl.classList.add("ultra");
    } else if (players >= 8) {
      listEl.classList.add("compact");
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
    return stored && stored.text ? stored.text : (currentState.lastScoreText || 'geen recente score');
  } catch (e) {
    return currentState.lastScoreText || 'geen recente score';
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
    lastScoreElement.textContent = `Laatste actie: ${scoreText}`;
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

// Ensure a text element fits on a single line by reducing font-size until it fits (with a sensible min)
function fitTextToOneLine(el, minFontPx = 14) {
  if (!el) return;
  // enforce single-line behavior
  el.style.whiteSpace = 'nowrap';
  el.style.overflow = 'hidden';
  el.style.textOverflow = 'ellipsis';

  // Reset any previously set inline font-size to get the computed default
  el.style.fontSize = '';
  let computed = window.getComputedStyle(el).fontSize;
  let fontSize = parseFloat(computed) || 20;

  // quick bail if already fits
  if (el.scrollWidth <= el.clientWidth) return;

  // iterate down to minFontPx (avoid infinite loops)
  let iter = 0;
  while (el.scrollWidth > el.clientWidth && fontSize > minFontPx && iter < 60) {
    fontSize -= 1;
    el.style.fontSize = `${fontSize}px`;
    iter += 1;
  }
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
    // set text then show row, then ensure name fits on one line
    pregamePlayerName.textContent = item.player.name;
    showPregameElement(pregamePlayerRow);
    // allow layout to settle then fit the name to one line
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fitTextToOneLine(pregamePlayerName, 14);
    }));
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
    // ensure pregame content is visible for the prepare screen
    if (pregameContent) pregameContent.classList.remove('hidden');
    if (pregameModeLabel) pregameModeLabel.classList.remove('hidden');
    showPregameOverlay(action.screenMode);
    pregameTeamLabel.classList.add('hidden');
    pregamePlayerRow.classList.add('hidden');
  }

  // Start a pregame video (PREGAMEBVA). Projection will attempt to play
  // a `PREGAMEBVA.mp4` file in the same folder; when it ends, it notifies control.
  if (action.type === 'startVideo') {
    // Prepare overlay for full-screen video playback
    showPregameOverlay(action.screenMode || 'black');
    pregameOverlay.classList.add('black');

    // Hide the large title text while the video plays
    if (pregameModeLabel) pregameModeLabel.classList.add('hidden');
    if (pregameContent) pregameContent.classList.add('hidden');

    // create or reuse a video element attached to the overlay so it can cover the whole screen
    let videoEl = document.getElementById('pregameVideo');
    if (!videoEl) {
      videoEl = document.createElement('video');
      videoEl.id = 'pregameVideo';
      videoEl.src = 'PREGAMEBVA.mp4';
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.controls = false;
      videoEl.muted = false;
      // full-screen covering styles
      videoEl.style.position = 'fixed';
      videoEl.style.inset = '0';
      videoEl.style.width = '100vw';
      videoEl.style.height = '100vh';
      videoEl.style.objectFit = 'cover';
      videoEl.style.zIndex = '2500';
      videoEl.style.background = '#000';
      // append directly to the overlay so it's contained with the pregame layer
      pregameOverlay.appendChild(videoEl);
    }

    // try to play (may be blocked by autoplay policies). If blocked, notify control so it can still continue.
    videoEl.play().catch(() => {
      try { window.setFirebase(window.ref(window.db, 'pregameAction'), { type: 'videoDone' }); } catch (e) {}
      sendSocketMessage({ type: 'pregame-action', action: { type: 'videoDone' } });
    });

    videoEl.onended = () => {
      // remove video element and keep the overlay black until Start Pregame pressed
      try { if (videoEl && videoEl.parentNode) videoEl.parentNode.removeChild(videoEl); } catch (e) {}
      // ensure the overlay remains black and pregame content stays hidden
      pregameOverlay.classList.add('black');
      if (pregameContent) pregameContent.classList.add('hidden');
      if (pregameModeLabel) pregameModeLabel.classList.add('hidden');
      pregameTeamLabel.classList.add('hidden');
      pregamePlayerRow.classList.add('hidden');
      // notify control that video finished so 'Start pregame' can be enabled
      try { window.setFirebase(window.ref(window.db, 'pregameAction'), { type: 'videoDone' }); } catch (e) {}
      sendSocketMessage({ type: 'pregame-action', action: { type: 'videoDone' } });
    };
    return;
  }

  if (action.type === 'startPregameShow') {
    // ensure pregame area is visible and ready for the player presentation
    if (pregameContent) pregameContent.classList.remove('hidden');
    if (pregameModeLabel) pregameModeLabel.classList.remove('hidden');
    showPregameOverlay(action.screenMode);
    pregameTeamLabel.classList.add('hidden');
    pregamePlayerRow.classList.add('hidden');
  }

  if (action.type === 'showTeamName') {
    if (pregameContent) pregameContent.classList.remove('hidden');
    if (pregameModeLabel) pregameModeLabel.classList.remove('hidden');
    showPregameOverlay(action.screenMode || pregameScreenMode || 'main');
    updatePregameScreen({ type: 'teamName', teamName: action.teamName });
  }

  if (action.type === 'showPlayer') {
    if (pregameContent) pregameContent.classList.remove('hidden');
    if (pregameModeLabel) pregameModeLabel.classList.remove('hidden');
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
  document.getElementById('timeoutLastScoreDisplay').textContent = `Laatste actie: ${getStoredLastScore()}`;
  
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
  // Map simple 'P' to 'FOUT' for display consistency
  const typeLabel = (type === 'FOUT' || type === 'P') ? 'FOUT' : type;
  const playerDisplay = `${typeLabel} Nummer ${player.number}: ${player.name}`;
  
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

  // If free-throw shooter info provided, include it in its own box under the main message
  const shooterHTML = popupData && popupData.shooterText ? `<div class="popup-shooter-box">${popupData.shooterText}</div>` : '';

  // Show team name prominently above message
  const teamLabel = player.team === 'home' ? currentState.homeName : currentState.awayName;
  
  popup.innerHTML = `<div class="popup-content">
    <div class="popup-team">${teamLabel}</div>
    <div class="popup-title">${playerDisplay}</div>
    ${statsHTML}
    ${shooterHTML}
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

function autoScaleLists() {
  const lists = document.querySelectorAll(".projection-list");

  lists.forEach(list => {
    const container = list.parentElement;

    // reset eerst
    list.style.transform = "scale(1)";

    const containerHeight = container.clientHeight;
    const contentHeight = list.scrollHeight;

    if (contentHeight > containerHeight) {
      const scale = containerHeight / contentHeight;
      list.style.transform = `scale(${scale})`;
    }
  });
}

window.addEventListener("load", autoScaleLists);

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

// Attach Firebase listeners when firebase is available
function setupFirebaseListenersProjection() {
  if (!window.onValue || !window.ref || !window.db) {
    setTimeout(setupFirebaseListenersProjection, 150);
    return;
  }

  window.onValue(window.ref(window.db, 'state'), (snapshot) => {
    const state = snapshot.val();
    if (state) {
      currentState = state;
      renderProjection();
    }
  });

  window.onValue(window.ref(window.db, 'popup'), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      showPopup(data);
      try { window.setFirebase(window.ref(window.db, 'popup'), null); } catch (e) {}
    }
  });

  window.onValue(window.ref(window.db, 'timeoutData'), (snapshot) => {
    const data = snapshot.val();
    if (data && !currentCountdownType) {
      startTimeoutCountdown(data);
    }
  });

  window.onValue(window.ref(window.db, 'halftimeData'), (snapshot) => {
    const data = snapshot.val();
    if (data && !currentCountdownType) {
      startHalftimeCountdown(data);
    }
  });

  window.onValue(window.ref(window.db, 'pregameAction'), (snapshot) => {
    const action = snapshot.val();
    if (action) handlePregameAction(action);
  });

  window.onValue(window.ref(window.db, 'lastScore'), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      currentState.lastScoreText = data.text;
      updateLastScoreDisplay();
    }
  });

  window.onValue(window.ref(window.db, 'timeoutAction'), (snapshot) => {
    const action = snapshot.val();
    if (action && action.type === 'stop') {
      stopTimeout();
      try { window.setFirebase(window.ref(window.db, 'timeoutAction'), null); } catch (e) {}
    }
  });

  window.onValue(window.ref(window.db, 'halftimeAction'), (snapshot) => {
    const action = snapshot.val();
    if (action && action.type === 'stop') {
      stopHalftime();
      try { window.setFirebase(window.ref(window.db, 'halftimeAction'), null); } catch (e) {}
    }
  });
}

setupFirebaseListenersProjection();

loadState();
