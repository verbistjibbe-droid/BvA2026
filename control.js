const homeNameInput = document.getElementById('homeName');
const awayNameInput = document.getElementById('awayName');
const homeColorInput = document.getElementById('homeColor');
const awayColorInput = document.getElementById('awayColor');
const homePlayersEl = document.getElementById('homePlayers');
const awayPlayersEl = document.getElementById('awayPlayers');
const resetBtn = document.getElementById('resetBtn');
const pregameBtn = document.getElementById('pregameBtn');
const pregameModal = document.getElementById('pregameModal');
const pregameStatus = document.getElementById('pregameStatus');
const controlHomeName = document.getElementById('controlHomeName');
const controlAwayName = document.getElementById('controlAwayName');
const controlHomeScore = document.getElementById('controlHomeScore');
const controlAwayScore = document.getElementById('controlAwayScore');
const preparePregameBtn = document.getElementById('preparePregameBtn');
const startPregameBtn = document.getElementById('startPregameBtn');
const nextPlayerBtn = document.getElementById('nextPlayerBtn');
const cancelPregameBtn = document.getElementById('cancelPregameBtn');
const activeEventPrompt = document.getElementById('activeEventPrompt');
const activePromptMessage = document.getElementById('activePromptMessage');
const stopEventBtn = document.getElementById('stopEventBtn');
const accessCodeInput = document.getElementById('accessCodeInput');
const accessCodeSubmit = document.getElementById('accessCodeSubmit');
const loginOverlay = document.getElementById('loginOverlay');
const accessError = document.getElementById('accessError');
const infoLink = document.getElementById('infoLink');
const infoModal = document.getElementById('infoModal');
const closeInfoModal = document.getElementById('closeInfoModal');
const openProjectionBtn = document.getElementById('openProjectionBtn');
let currentMatchId = null;
const syncChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bva-sync') : null;
const socket = (location.protocol === 'http:' || location.protocol === 'https:')
  ? new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`)
  : null;
const socketQueue = [];
let lastScoreText = 'Geen recente score';


const initialHomePlayers = [
  { number: 4, name: 'Player A', points: 0, fouls: 0, team: 'home', onField: false },
  { number: 5, name: 'Player B', points: 0, fouls: 0, team: 'home', onField: false },
  { number: 6, name: 'Player C', points: 0, fouls: 0, team: 'home', onField: false },
  { number: 7, name: 'Player D', points: 0, fouls: 0, team: 'home', onField: false },
  { number: 8, name: 'Player E', points: 0, fouls: 0, team: 'home', onField: false },
];

const initialAwayPlayers = [
  { number: 4, name: 'Player A', points: 0, fouls: 0, team: 'away', onField: false },
  { number: 5, name: 'Player B', points: 0, fouls: 0, team: 'away', onField: false },
  { number: 6, name: 'Player C', points: 0, fouls: 0, team: 'away', onField: false },
  { number: 7, name: 'Player D', points: 0, fouls: 0, team: 'away', onField: false },
  { number: 8, name: 'Player E', points: 0, fouls: 0, team: 'away', onField: false },
];

let homePlayers = [];
let awayPlayers = [];
let currentPeriod = '1';

function createPlayerCard(player, team) {
  if (editingPlayer === player && editingTeam === team) {
    const editCard = document.createElement('div');
    editCard.className = 'player-card';

    const editRow = document.createElement('div');
    editRow.className = 'player-edit-row';

    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = '1';
    numberInput.max = '99';
    numberInput.value = player.number;
    numberInput.placeholder = 'Nummer';
    numberInput.className = 'edit-number-input';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = player.name;
    nameInput.placeholder = 'Naam';
    nameInput.className = 'edit-name-input';

    const actionWrapper = document.createElement('div');
    actionWrapper.className = 'player-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'save-edit-btn';
    saveBtn.textContent = 'Opslaan';
    saveBtn.addEventListener('click', () => {
      const newNumber = parseInt(numberInput.value, 10);
      const newName = nameInput.value.trim();
      if (!newNumber || !newName) {
        alert('Voer alstublieft een nummer en naam in');
        return;
      }
      player.number = newNumber;
      player.name = newName;
      editingPlayer = null;
      editingTeam = null;
      renderRoster();
      saveState();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cancel-edit-btn';
    cancelBtn.textContent = 'Annuleer';
    cancelBtn.addEventListener('click', () => {
      editingPlayer = null;
      editingTeam = null;
      renderRoster();
    });

    actionWrapper.append(saveBtn, cancelBtn);
    editRow.append(numberInput, nameInput, actionWrapper);
    editCard.append(editRow);
    return editCard;
  }

  const card = document.createElement('div');
  card.className = 'player-card';
  
  // Apply team color to the card
  const teamColor = team === 'home' ? homeColorInput.value : awayColorInput.value;
  card.style.borderColor = teamColor;

  const topRow = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'player-meta';
  const number = document.createElement('div');
  number.className = 'player-number';
  number.textContent = player.number;
  
  // Apply team color background if player is on field
  if (player.onField) {
    number.style.background = teamColor;
  } else {
    number.style.background = 'var(--red)';
  }
  
  // Make number clickable
  number.style.cursor = 'pointer';
  number.title = player.onField ? 'Klik om uit het veld te zetten' : 'Klik om in het veld in te stellen';
  number.addEventListener('click', () => togglePlayerOnField(player, team));
  
  const name = document.createElement('div');
  name.className = 'player-name';
  name.textContent = player.name;
  meta.append(number, name);

  const scoreBadge = document.createElement('div');
  scoreBadge.textContent = `${player.points} punten`;
  scoreBadge.style.color = '#facc15';
  
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-btn';
  editBtn.textContent = '✏️';
  editBtn.title = 'Speler bewerken';
  editBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    startEditPlayer(player, team);
  });
  
  topRow.append(meta, scoreBadge, editBtn);

  const actionRow = document.createElement('div');
  actionRow.className = 'action-row';

  const ftBtn = document.createElement('button');
  ftBtn.type = 'button';
  ftBtn.className = 'score-btn';
  ftBtn.textContent = 'FT';
  if (!player.onField) {
    ftBtn.disabled = true;
    ftBtn.className += ' disabled-btn';
  }
  ftBtn.addEventListener('click', () => updatePlayer(player, 1, 'FT'));

  const btn2 = document.createElement('button');
  btn2.type = 'button';
  btn2.className = 'score-btn';
  btn2.textContent = '+2';
  if (!player.onField) {
    btn2.disabled = true;
    btn2.className += ' disabled-btn';
  }
  btn2.addEventListener('click', () => updatePlayer(player, 2, '2PT'));

  const btn3 = document.createElement('button');
  btn3.type = 'button';
  btn3.className = 'score-btn';
  btn3.textContent = '+3';
  if (!player.onField) {
    btn3.disabled = true;
    btn3.className += ' disabled-btn';
  }
  btn3.addEventListener('click', () => updatePlayer(player, 3, '3PT'));

  const foulBtn = document.createElement('button');
  foulBtn.type = 'button';
  foulBtn.className = 'foul-btn';
  if (!player.onField) {
    foulBtn.disabled = true;
    foulBtn.className += ' disabled-btn';
  }
  foulBtn.textContent = 'FLS';
  foulBtn.addEventListener('click', () => addFoul(player));

  actionRow.append(ftBtn, btn2, btn3, foulBtn);
  card.append(topRow, actionRow);
  return card;
}

let editingPlayer = null;
let editingTeam = null;

function startEditPlayer(player, team) {
  editingPlayer = player;
  editingTeam = team;
  renderRoster();
  const input = document.getElementById('edit-number');
  if (input) input.focus();
}

function saveEditPlayer() {
  if (!editingPlayer) return;
  
  const newNumber = parseInt(document.getElementById('edit-number').value);
  const newName = document.getElementById('edit-name').value.trim();
  
  if (!newNumber || !newName) {
    alert('Voer alstublieft een nummer en naam in');
    return;
  }
  
  editingPlayer.number = newNumber;
  editingPlayer.name = newName;
  
  renderRoster();
  saveState();
  editingPlayer = null;
  editingTeam = null;
}

function cancelEditPlayer() {
  editingPlayer = null;
  editingTeam = null;
  renderRoster();
}

function checkAccessCode() {
  const enteredCode = accessCodeInput ? accessCodeInput.value.trim() : '';
  if (enteredCode === 'BvA2026') {
    hideLoginOverlay();
    return;
  }
  if (accessError) {
    accessError.classList.remove('hidden');
  }
}

function hideLoginOverlay() {
  if (loginOverlay) {
    loginOverlay.classList.add('hidden');
  }
  if (accessError) {
    accessError.classList.add('hidden');
  }
}

function showInfoPopup() {
  if (infoModal) {
    infoModal.classList.remove('hidden');
  }
}

function hideInfoPopup() {
  if (infoModal) {
    infoModal.classList.add('hidden');
  }
}

function storageKey(key) {
  return currentMatchId ? `${key}-${currentMatchId}` : key;
}


function getProjectionLink() {
  if (location.protocol === 'http:' || location.protocol === 'https:') {
    return `${location.origin}/projection.html`;
  }
  return `projection.html`;
}

openProjectionBtn.onclick = () => {
  window.open(getProjectionLink(), '_blank');
};

function updateProjectionLink() {
  if (openProjectionBtn) {
    openProjectionBtn.disabled = false;
  }
}

function trySendJoin() {
  if (socket && socket.readyState === WebSocket.OPEN && currentMatchId) {
    sendSocketMessage({ type: 'join' });
  }
}

async function openProjectionWindow() {
  const category = askCategory();
  if (!category) return;

  currentMatchId = category;
  updateProjectionLink();
  trySendJoin();

  const link = getProjectionLink();
  if (!link) return;

  if (window.projectionWindow && !window.projectionWindow.closed) {
    window.projectionWindow.location.href = link;
  } else {
    window.projectionWindow = window.open(link, 'projection');
  }
}

function broadcastSyncMessage(message) {
  if (syncChannel) {
    try {
      syncChannel.postMessage(message);
    } catch (error) {
      console.warn('BroadcastChannel error', error);
    }
  }
}

function sendSocketMessage(message) {
  if (!socket || !currentMatchId) return;
  message.matchId = currentMatchId;
  const payload = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
  } else {
    socketQueue.push(payload);
  }
}

if (socket) {
  socket.addEventListener('open', () => {
    while (socketQueue.length) {
      socket.send(socketQueue.shift());
    }
    trySendJoin();
  });

  socket.addEventListener('error', (event) => {
    console.warn('WebSocket error', event);
  });

  socket.addEventListener('close', () => {
    console.warn('WebSocket closed');
  });
}

function togglePlayerOnField(player, team) {
  const players = team === 'home' ? homePlayers : awayPlayers;
  
  if (player.onField) {
    // Player is already on field, remove them
    player.onField = false;
  } else {
    // Check if already 5 players on field
    const onFieldCount = players.filter(p => p.onField).length;
    if (onFieldCount >= 5) {
      alert('Je hebt al 5 spelers op het veld. Zet eerst een speler eraf.');
      return;
    }
    // Add player to field
    player.onField = true;
  }
  
  renderRoster();
  saveState();
}

function deletePlayer(team) {
  const players = team === 'home' ? homePlayers : awayPlayers;
  const playerList = team === 'home' ? homePlayersEl : awayPlayersEl;
  
  if (players.length <= 1) {
    alert('Je moet minstens 1 speler hebben');
    return;
  }
  
  players.pop();
  renderRoster();
  saveState();
}

function benchAllPlayers() {
  homePlayers.forEach((player) => { player.onField = false; });
  awayPlayers.forEach((player) => { player.onField = false; });
  renderRoster();
  saveState();
}

function addPlayer(team) {
  const players = team === 'home' ? homePlayers : awayPlayers;
  
  if (players.length >= 12) {
    alert('Je kunt maximaal 12 spelers hebben');
    return;
  }
  
  const newPlayer = {
    number: Math.max(...players.map(p => p.number), 0) + 1,
    name: 'Nieuwe speler',
    points: 0,
    fouls: 0,
    team: team,
    onField: false,
  };
  
  players.push(newPlayer);
  renderRoster();
  saveState();

  // Auto-edit the new player
  setTimeout(() => {
    startEditPlayer(newPlayer, team);
  }, 0);
}

function renderRoster() {
  homePlayersEl.innerHTML = '';
  awayPlayersEl.innerHTML = '';

  // Sort players by number ascending within each group
  const sortedHomePlayers = [...homePlayers].sort((a, b) => a.number - b.number);

  const homeOnField = sortedHomePlayers.filter((player) => player.onField);
  const homeBench = sortedHomePlayers.filter((player) => !player.onField);
  homePlayersEl.append(createPlayerSection('Op veld', homeOnField, 'home'));
  homePlayersEl.append(createPlayerSection('Bank', homeBench, 'home'));

  const addHomeBtn = document.createElement('button');
  addHomeBtn.className = 'add-btn';
  addHomeBtn.textContent = '+ Speler toevoegen';
  addHomeBtn.addEventListener('click', () => addPlayer('home'));
  homePlayersEl.append(addHomeBtn);

  // Sort players: on-field first, then by number
  const sortedAwayPlayers = [...awayPlayers].sort((a, b) => a.number - b.number);

  const awayOnField = sortedAwayPlayers.filter((player) => player.onField);
  const awayBench = sortedAwayPlayers.filter((player) => !player.onField);
  awayPlayersEl.append(createPlayerSection('Op veld', awayOnField, 'away'));
  awayPlayersEl.append(createPlayerSection('Bank', awayBench, 'away'));

  const addAwayBtn = document.createElement('button');
  addAwayBtn.className = 'add-btn';
  addAwayBtn.textContent = '+ Speler toevoegen';
  addAwayBtn.addEventListener('click', () => addPlayer('away'));
  awayPlayersEl.append(addAwayBtn);

  updateControlScoreboard();
}

function createPlayerSection(title, players, team) {
  const section = document.createElement('div');
  section.className = `team-player-section ${title === 'Op veld' ? 'onfield-section' : 'bench-section'}`;

  const heading = document.createElement('div');
  heading.className = 'team-player-section-title';
  heading.textContent = title;
  section.append(heading);

  if (players.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-player-section';
    empty.textContent = title === 'Op veld' ? 'Geen spelers op het veld' : 'Geen spelers op de bank';
    section.append(empty);
    return section;
  }

  players.forEach((player) => {
    const card = createPlayerCard(player, team);
    section.append(card);
  });

  return section;
}

function saveState() {
  const state = {
    homeName: homeNameInput.value,
    awayName: awayNameInput.value,
    homeTeamColor: homeColorInput.value,
    awayTeamColor: awayColorInput.value,
    period: currentPeriod,
    homePlayers,
    awayPlayers,
    lastScoreText,
  };
  localStorage.setItem(storageKey('bva-match-state'), JSON.stringify(state));
  broadcastSyncMessage({ type: 'state', state });
  sendSocketMessage({ type: 'state', state });
  window.dispatchEvent(new CustomEvent('stateChanged', { detail: state }));
  updateControlScoreboard();
}

function updateControlScoreboard() {
  if (controlHomeName) controlHomeName.textContent = homeNameInput.value;
  if (controlAwayName) controlAwayName.textContent = awayNameInput.value;
  if (controlHomeScore) {
    controlHomeScore.textContent = homePlayers.reduce((sum, player) => sum + player.points, 0);
  }
  if (controlAwayScore) {
    controlAwayScore.textContent = awayPlayers.reduce((sum, player) => sum + player.points, 0);
  }
}

function updatePlayer(player, points, type) {
  player.points += points;
  lastScoreText = `${player.name} - ${type}`;
  localStorage.setItem(storageKey('last-score'), JSON.stringify({ text: lastScoreText, timestamp: Date.now() }));
  renderRoster();
  saveState();
  showPopup(player, type);
}

function addFoul(player) {
  if (player.fouls < 5) {
    player.fouls += 1;
  }
  renderRoster();
  saveState();
  showPopup(player, 'FOUT');
}

function showPopup(player, type) {
  // Store popup data in localStorage for projection page
  const popupData = { player, type };
  localStorage.setItem(storageKey('popup-data'), JSON.stringify(popupData));
  broadcastSyncMessage({ type: 'popup', popupData });
  sendSocketMessage({ type: 'popup', popupData });
  // Dispatch event to trigger popup on projection page if it's open
  window.dispatchEvent(new CustomEvent('showPopup', { detail: popupData }));
}

function resetMatch() {
  if (confirm('Weet je zeker dat je de wedstrijd wil resetten? Alle scores en fouten worden verwijderd.')) {
    homePlayers = initialHomePlayers.map((player) => ({ ...player, points: 0, fouls: 0, onField: false }));
    awayPlayers = initialAwayPlayers.map((player) => ({ ...player, points: 0, fouls: 0, onField: false }));
    currentMatchId = null;
    renderRoster();
    saveState();
    updateProjectionLink();
    updatePregameButtonVisibility();
  }
}

function showTimeoutModal() {
  document.getElementById('timeoutModal').classList.remove('hidden');
  document.querySelector('input[name="timeout-team"][value="home"]').checked = true;
}

function hideTimeoutModal() {
  document.getElementById('timeoutModal').classList.add('hidden');
}

function updatePregameButtonVisibility() {
  pregameBtn.style.display = currentPeriod === '1' ? 'inline-flex' : 'none';
}

function showPregameModal() {
  pregameModal.classList.remove('hidden');
  pregameStatus.textContent = 'Kies een startteam of zet de opening klaar met Klaarzetten.';
  preparePregameBtn.classList.remove('hidden');
  startPregameBtn.classList.remove('hidden');
  nextPlayerBtn.classList.add('hidden');
  const defaultTeamInput = document.querySelector('input[name="pregame-team"][value="home"]');
  if (defaultTeamInput) {
    defaultTeamInput.checked = true;
  }
}

function hidePregameModal() {
  pregameModal.classList.add('hidden');
}

function sendPregameAction(action) {
  localStorage.setItem(storageKey('pregame-action'), JSON.stringify(action));
  broadcastSyncMessage({ type: 'pregame-action', action });
  sendSocketMessage({ type: 'pregame-action', action });
  try {
    if (window.projectionWindow && !window.projectionWindow.closed) {
      window.projectionWindow.handlePregameAction(action);
    }
  } catch (e) {
    console.log('Projection window not accessible, using localStorage for pregame action');
  }
}

function getSortedPlayers(team) {
  const players = team === 'home' ? homePlayers : awayPlayers;
  return [...players].sort((a, b) => a.number - b.number);
}

let pregameSequence = [];
let pregameIndex = 0;
let selectedPregameMode = 'main';

function preparePregame() {
  sendPregameAction({
    type: 'preparePregame',
    screenMode: 'black',
  });
  pregameStatus.textContent = 'Pre-game klaargezet. START PREGAME start de show met geselecteerde ploeg.';
}

function startPregameShow() {
  const startTeamEl = document.querySelector('input[name="pregame-team"]:checked');

  if (!startTeamEl) {
    alert('Kies een startteam.');
    return;
  }

  const screenMode = 'black';
  const startTeam = startTeamEl.value;
  const otherTeam = startTeam === 'home' ? 'away' : 'home';
  const teamNames = {
    home: homeNameInput.value,
    away: awayNameInput.value,
  };

  const firstTeamPlayers = getSortedPlayers(startTeam);
  const secondTeamPlayers = getSortedPlayers(otherTeam);

  pregameSequence = [
    { type: 'teamName', team: startTeam, teamName: teamNames[startTeam] },
    ...firstTeamPlayers.map((player) => ({ type: 'player', team: startTeam, player })),
    { type: 'teamName', team: otherTeam, teamName: teamNames[otherTeam] },
    ...secondTeamPlayers.map((player) => ({ type: 'player', team: otherTeam, player })),
  ];
  pregameIndex = 0;
  selectedPregameMode = screenMode;

  sendPregameAction({
    type: 'startPregameShow',
    screenMode,
  });

  const nextItem = pregameSequence[pregameIndex];
  if (nextItem) {
    sendPregameAction({
      type: 'showTeamName',
      screenMode,
      teamName: nextItem.teamName,
    });
    pregameStatus.textContent = `Startend team is ${nextItem.teamName}. Klik op Volgende speler om verder te gaan.`;
    pregameIndex += 1;
  }

  preparePregameBtn.classList.add('hidden');
  startPregameBtn.classList.add('hidden');
  nextPlayerBtn.classList.remove('hidden');
  nextPlayerBtn.textContent = pregameIndex >= pregameSequence.length ? 'Voltooien' : 'Volgende speler';
}

function nextPregamePlayer() {
  if (pregameIndex >= pregameSequence.length) {
    sendPregameAction({ type: 'pregameComplete' });
    pregameStatus.textContent = 'Pre-game show voltooid.';
    nextPlayerBtn.classList.add('hidden');
    pregameBtn.style.display = 'none';
    return;
  }

  const nextItem = pregameSequence[pregameIndex];
  if (nextItem.type === 'teamName') {
    sendPregameAction({
      type: 'showTeamName',
      screenMode: selectedPregameMode,
      teamName: nextItem.teamName,
    });
    pregameStatus.textContent = `Vervolgd met ${nextItem.teamName}. Klik op Volgende speler.`;
  } else {
    sendPregameAction({
      type: 'showPlayer',
      screenMode: selectedPregameMode,
      player: nextItem.player,
      teamName: nextItem.team === 'home' ? homeNameInput.value : awayNameInput.value,
    });
    pregameStatus.textContent = `Toon speler ${nextItem.player.number} - ${nextItem.player.name}. Klik op Volgende speler.`;
  }

  pregameIndex += 1;
  nextPlayerBtn.textContent = pregameIndex >= pregameSequence.length ? 'Voltooien' : 'Volgende speler';
}

let activeEventType = null;

function showActivePrompt(type, teamName = '') {
  activeEventType = type;
  activePromptMessage.textContent = type === 'timeout'
    ? `Time-out gestart voor ${teamName}`
    : 'Halftime gestart';
  stopEventBtn.textContent = type === 'timeout' ? 'Stop time-out' : 'Stop halftime';
  activeEventPrompt.classList.remove('hidden');
}

function hideActivePrompt() {
  activeEventType = null;
  activeEventPrompt.classList.add('hidden');
}

function stopEvent() {
  if (activeEventType === 'timeout') {
    stopTimeout();
  } else if (activeEventType === 'halftime') {
    stopHalftime();
  }
}

function stopTimeout() {
  try {
    if (window.projectionWindow && !window.projectionWindow.closed) {
      window.projectionWindow.stopTimeout();
    }
  } catch (e) {
    console.log('Projection window not accessible, using localStorage stop action');
  }
  localStorage.setItem(storageKey('timeout-action'), JSON.stringify({ type: 'stop' }));
  broadcastSyncMessage({ type: 'timeout-action', action: { type: 'stop' } });
  sendSocketMessage({ type: 'timeout-action', action: { type: 'stop' } });
  hideActivePrompt();
}

function stopHalftime() {
  try {
    if (window.projectionWindow && !window.projectionWindow.closed) {
      window.projectionWindow.stopHalftime();
    }
  } catch (e) {
    console.log('Projection window not accessible, using localStorage stop action');
  }
  localStorage.setItem(storageKey('halftime-action'), JSON.stringify({ type: 'stop' }));
  broadcastSyncMessage({ type: 'halftime-action', action: { type: 'stop' } });
  sendSocketMessage({ type: 'halftime-action', action: { type: 'stop' } });
  hideActivePrompt();
}

function startTimeout() {
  const selectedTeam = document.querySelector('input[name="timeout-team"]:checked');
  
  if (!selectedTeam) {
    alert('Kies alstublieft een team.');
    return;
  }
  
  benchAllPlayers();
  const team = selectedTeam.value;
  const teamName = team === 'home' ? homeNameInput.value : awayNameInput.value;
  
  const timeoutData = {
    type: 'timeout',
    team,
    teamName,
    duration: 60,
    remaining: 60,
  };
  
  localStorage.setItem(storageKey('timeout-data'), JSON.stringify(timeoutData));
  broadcastSyncMessage({ type: 'timeout-data', timeoutData });
  sendSocketMessage({ type: 'timeout-data', timeoutData });
  
  // Try direct window communication
  try {
    if (window.projectionWindow && !window.projectionWindow.closed) {
      window.projectionWindow.startTimeoutCountdown(timeoutData);
    }
  } catch (e) {
    console.log('Projection window not accessible, using localStorage');
  }
  
  hideTimeoutModal();
  showActivePrompt('timeout', teamName);
}

function startHalftime(remainingSeconds = 15 * 60) {
  benchAllPlayers();
  const totalSeconds = remainingSeconds;
  
  const halftimeData = {
    type: 'halftime',
    totalSeconds,
    remaining: totalSeconds,
  };
  
  localStorage.setItem(storageKey('halftime-data'), JSON.stringify(halftimeData));
  broadcastSyncMessage({ type: 'halftime-data', halftimeData });
  sendSocketMessage({ type: 'halftime-data', halftimeData });
  
  // Try direct window communication
  try {
    if (window.projectionWindow && !window.projectionWindow.closed) {
      window.projectionWindow.startHalftimeCountdown(halftimeData);
    }
  } catch (e) {
    console.log('Projection window not accessible, using localStorage');
  }
}

function showHalftimeModal() {
  document.getElementById('halftimeModal').classList.remove('hidden');
}

function hideHalftimeModal() {
  document.getElementById('halftimeModal').classList.add('hidden');
}

function startHalftimeFromModal() {
  currentPeriod = '3';
  document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
  const periodBtn = document.querySelector('.period-btn[data-period="3"]');
  if (periodBtn) periodBtn.classList.add('active');

  startHalftime();
  saveState();
  hideHalftimeModal();
  showActivePrompt('halftime');
}

function wireEvents() {
  homeNameInput.addEventListener('input', saveState);
  awayNameInput.addEventListener('input', saveState);
  homeColorInput.addEventListener('change', () => {
    renderRoster();
    saveState();
  });
  awayColorInput.addEventListener('change', () => {
    renderRoster();
    saveState();
  });
  
  // Periode knoppen
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const selectedPeriod = e.target.dataset.period;
      
      if (selectedPeriod === '3') {
        showHalftimeModal();
        return;
      }
      
      benchAllPlayers();
      document.querySelectorAll('.period-btn').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      currentPeriod = selectedPeriod;
      saveState();
      updatePregameButtonVisibility();
    });
  });
  
  // Timeout knoppen
  document.getElementById('timeoutBtn').addEventListener('click', showTimeoutModal);
  document.getElementById('cancelTimeoutBtn').addEventListener('click', hideTimeoutModal);
  document.getElementById('startTimeoutBtn').addEventListener('click', startTimeout);
  
  // Pregame knoppen
  pregameBtn.addEventListener('click', showPregameModal);
  preparePregameBtn.addEventListener('click', preparePregame);
  startPregameBtn.addEventListener('click', startPregameShow);
  nextPlayerBtn.addEventListener('click', nextPregamePlayer);
  cancelPregameBtn.addEventListener('click', hidePregameModal);
  
  stopEventBtn.addEventListener('click', stopEvent);
  document.getElementById('startHalftimeBtn').addEventListener('click', startHalftimeFromModal);
  document.getElementById('cancelHalftimeBtn').addEventListener('click', hideHalftimeModal);
  
  // Update team labels when team names change
  homeNameInput.addEventListener('input', () => {
    document.getElementById('homeTeamLabel').textContent = homeNameInput.value;
    document.getElementById('pregameHomeLabel').textContent = homeNameInput.value;
  });
  awayNameInput.addEventListener('input', () => {
    document.getElementById('awayTeamLabel').textContent = awayNameInput.value;
    document.getElementById('pregameAwayLabel').textContent = awayNameInput.value;
  });

  if (accessCodeSubmit) {
    accessCodeSubmit.addEventListener('click', checkAccessCode);
  }

  if (accessCodeInput) {
    accessCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkAccessCode();
      }
    });
    accessCodeInput.addEventListener('input', () => {
      accessError.classList.add('hidden');
    });
  }

  if (infoLink) {
    infoLink.addEventListener('click', showInfoPopup);
  }

  if (openProjectionBtn) {
    openProjectionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openProjectionWindow();
    });
  }

  if (closeInfoModal) {
    closeInfoModal.addEventListener('click', hideInfoPopup);
  }
  
  resetBtn.addEventListener('click', resetMatch);
}

async function init() {
  // Check if there's a saved state in localStorage
  const savedState = localStorage.getItem(storageKey('bva-match-state'));
  if (savedState) {
    const state = JSON.parse(savedState);
    homePlayers = state.homePlayers;
    awayPlayers = state.awayPlayers;
    // Ensure all players have onField property (for backwards compatibility)
    homePlayers.forEach(p => { if (p.onField === undefined) p.onField = false; });
    awayPlayers.forEach(p => { if (p.onField === undefined) p.onField = false; });
    homeNameInput.value = state.homeName;
    awayNameInput.value = state.awayName;
    homeColorInput.value = state.homeTeamColor || '#b22222';
    awayColorInput.value = state.awayTeamColor || '#dc143c';
    currentPeriod = state.period || '1';
  } else {
    // First time - initialize with default data
    homePlayers = initialHomePlayers.map((player) => ({ ...player }));
    awayPlayers = initialAwayPlayers.map((player) => ({ ...player }));
    homeColorInput.value = '#b22222';
    awayColorInput.value = '#dc143c';
    currentPeriod = '1';
  }
  
  // Set active period button
  document.querySelectorAll('.period-btn').forEach((btn) => {
    btn.classList.remove('active');
    if (btn.dataset.period === currentPeriod) {
      btn.classList.add('active');
    }
  });
  
  // Initialize team labels in modals
  document.getElementById('homeTeamLabel').textContent = homeNameInput.value;
  document.getElementById('awayTeamLabel').textContent = awayNameInput.value;
  document.getElementById('pregameHomeLabel').textContent = homeNameInput.value;
  document.getElementById('pregameAwayLabel').textContent = awayNameInput.value;
  updatePregameButtonVisibility();
  updateControlScoreboard();
  
  wireEvents();
  renderRoster();
  saveState();
  updateProjectionLink();

  if (accessCodeInput) {
    accessCodeInput.focus();
  }
}

init();
