// --- STATE MANAGEMENT & SYNC ---
function getCurrentStateFromUI() {
  return {
    homeName: homeNameInput.value,
    awayName: awayNameInput.value,
    homeTeamColor: homeColorInput.value,
    awayTeamColor: awayColorInput.value,
    period: currentPeriod,
    homePlayers: homePlayers.map(p => ({ ...p })),
    awayPlayers: awayPlayers.map(p => ({ ...p })),
    lastScoreText,
  };
}

function storageKey(key) {
  return key;
}

function pushStateToFirebase() {
  const state = getCurrentStateFromUI();

  // Ensure players are stored in ascending order by number for projection consistency
  try {
    state.homePlayers = (state.homePlayers || []).slice().sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    state.awayPlayers = (state.awayPlayers || []).slice().sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
  } catch (e) {
    // ignore sorting errors
  }

  // Prefer Firebase when available
  if (window.setFirebase && window.ref && window.db) {
    try {
      window.setFirebase(window.ref(window.db, 'state'), state);
      window.setFirebase(window.ref(window.db, 'lastScore'), { text: lastScoreText, timestamp: Date.now() });
    } catch (e) {
      console.warn('Firebase write failed', e);
    }
  }

  // Always persist locally so refresh doesn't reset the match
  try {
    localStorage.setItem(storageKey('bva-match-state'), JSON.stringify(state));
    localStorage.setItem(storageKey('last-score'), JSON.stringify({ text: lastScoreText, timestamp: Date.now() }));
  } catch (e) {
    // ignore
  }

  sendSocketMessage({ type: 'state', state });
  updateControlScoreboard();
}
// DOM Elements - Login
const loginOverlay = document.getElementById('loginOverlay');
const accessCodeInput = document.getElementById('accessCodeInput');
const accessCodeSubmit = document.getElementById('accessCodeSubmit');
const accessError = document.getElementById('accessError');

// Quick attach: ensure access-code UI works even if full init() is delayed or Firebase fails
if (accessCodeSubmit) {
  accessCodeSubmit.addEventListener('click', () => {
    try {
      checkAccessCode();
    } catch (err) {
      console.error('checkAccessCode error', err);
    }
  });
}
if (accessCodeInput) {
  accessCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      try { checkAccessCode(); } catch (err) { console.error('checkAccessCode error', err); }
    }
  });
  accessCodeInput.addEventListener('input', () => {
    if (accessError) accessError.classList.add('hidden');
  });
}

// DOM Elements - Main
const homeNameInput = document.getElementById('homeName');
const awayNameInput = document.getElementById('awayName');
const homeColorInput = document.getElementById('homeColor');
const awayColorInput = document.getElementById('awayColor');
const homeOnFieldEl = document.getElementById('homeOnField');
const homeBenchEl = document.getElementById('homeBench');
const awayOnFieldEl = document.getElementById('awayOnField');
const awayBenchEl = document.getElementById('awayBench');

// DOM Elements - Selection
const selectedPlayerNumberEl = document.getElementById('selectedPlayerNumber');
const selectedPlayerNameEl = document.getElementById('selectedPlayerName');
const selectedPlayerFoulsEl = document.getElementById('selectedPlayerFouls');
const selectedPlayerPointsEl = document.getElementById('selectedPlayerPoints');
const selectedPlayerInfoEl = document.querySelector('.selected-player-info');

// DOM Elements - Modals
const playerEditModal = document.getElementById('playerEditModal');
const playerEditList = document.getElementById('playerEditList');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const closeEditBtn = document.getElementById('closeEditBtn');
const editTeamLabel = document.getElementById('editTeamLabel');

const addPlayerModal = document.getElementById('addPlayerModal');
const newPlayerNumber = document.getElementById('newPlayerNumber');
const newPlayerName = document.getElementById('newPlayerName');
const savePlayerBtn = document.getElementById('savePlayerBtn');
const cancelAddPlayerBtn = document.getElementById('cancelAddPlayerBtn');

const timeoutModal = document.getElementById('timeoutModal');
const halftimeModal = document.getElementById('halftimeModal');
const activeEventPrompt = document.getElementById('activeEventPrompt');
const activePromptMessage = document.getElementById('activePromptMessage');
const stopEventBtn = document.getElementById('stopEventBtn');

// DOM Elements - Foul Modal
const foulModal = document.createElement('div');
foulModal.id = 'foulModal';
foulModal.className = 'modal hidden';
document.body.append(foulModal);

// DOM Elements - Buttons
const resetBtn = document.getElementById('resetBtn');
const openProjectionBtn = document.getElementById('openProjectionBtn');
const timeoutBtn = document.getElementById('timeoutBtn');
const pregameBtn = document.getElementById('pregameBtn');
const pregameModal = document.getElementById('pregameModal');
const infoLink = document.getElementById('infoLink');
const infoModal = document.getElementById('infoModal');
const closeInfoModal = document.getElementById('closeInfoModal');
const startVideoBtn = document.getElementById('startVideoBtn');

// State
let lastScoreText = 'Geen recente score';
let socket = null;
let socketQueue = [];

// Pregame state
let pregameTeamOrder = [];
let pregameCurrentTeamIndex = 0;
let pregamePlayerIndex = -1; // -1 means show team name next
let pregameVideoPlayed = false;
// precomputed sorted lists used for pregame presentation (desc: groot->klein)
let pregameSortedPlayers = { home: [], away: [] };

function sendPregameAction(action) {
  window.setFirebase(window.ref(window.db, 'pregameAction'), action);
  sendSocketMessage({ type: 'pregame-action', action });
}

function openPregameModal() {
  if (!pregameModal) return;
  document.getElementById('pregameHomeLabel').textContent = homeNameInput.value;
  document.getElementById('pregameAwayLabel').textContent = awayNameInput.value;
  // Allow starting the pregame at any time and keep Start Video available
  const startBtn = document.getElementById('startPregameBtn');
  if (startBtn) startBtn.disabled = false;
  if (startVideoBtn) {
    // keep the Start Video button visible and enabled so the video can be replayed
    startVideoBtn.style.display = '';
    startVideoBtn.disabled = false;
  }
  pregameModal.classList.remove('hidden');
}

function closePregameModal() {
  if (!pregameModal) return;
  pregameModal.classList.add('hidden');
}

function preparePregame() {
  // prepare on projection: use black screen style for the title
  sendPregameAction({ type: 'preparePregame', screenMode: 'black' });
}

function startPregameSequence() {
  // determine starting team
  const startTeamInput = document.querySelector('input[name="pregame-team"]:checked');
  const startTeam = startTeamInput ? startTeamInput.value : 'home';
  pregameTeamOrder = startTeam === 'home' ? ['home', 'away'] : ['away', 'home'];
  pregameCurrentTeamIndex = 0;
  pregamePlayerIndex = -1;
  // Prepare sorted player lists for presentation: show players from groot naar klein (desc)
  try {
    // Pregame presentation: sort players from klein -> groot (ascending)
    pregameSortedPlayers.home = (homePlayers || []).slice().sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
    pregameSortedPlayers.away = (awayPlayers || []).slice().sort((a, b) => (parseInt(a.number, 10) || 0) - (parseInt(b.number, 10) || 0));
  } catch (e) {
    pregameSortedPlayers.home = (homePlayers || []).slice();
    pregameSortedPlayers.away = (awayPlayers || []).slice();
  }
  // show first team name
  const teamKey = pregameTeamOrder[pregameCurrentTeamIndex];
  const teamName = teamKey === 'home' ? homeNameInput.value : awayNameInput.value;
  sendPregameAction({ type: 'startPregameShow', screenMode: 'main' });
  sendPregameAction({ type: 'showTeamName', teamName });
  // Update UI: make start button become the step button and hide the separate next button
  const startBtn = document.getElementById('startPregameBtn');
  const nextBtn = document.getElementById('nextPlayerBtn');
  if (startBtn) {
    startBtn.textContent = 'Volgende speler';
    startBtn.onclick = nextPregamePlayer;
  }
  if (nextBtn) nextBtn.classList.add('hidden');

  // Update live text in modal
  const liveEl = document.getElementById('pregameLiveText');
  if (liveEl) liveEl.textContent = `Toon: ${teamName}`;
}

function nextPregamePlayer() {
  const teamKey = pregameTeamOrder[pregameCurrentTeamIndex];
  const players = teamKey === 'home' ? (pregameSortedPlayers.home || []) : (pregameSortedPlayers.away || []);
  if (pregamePlayerIndex === -1) {
    // show first player
    pregamePlayerIndex = 0;
  } else {
    pregamePlayerIndex += 1;
  }

  if (pregamePlayerIndex < players.length) {
    const player = players[pregamePlayerIndex];
    const teamName = teamKey === 'home' ? homeNameInput.value : awayNameInput.value;
    sendPregameAction({ type: 'showPlayer', player, teamName });
    const liveEl = document.getElementById('pregameLiveText');
    if (liveEl) liveEl.textContent = `Toon: ${teamName} - ${player.number} ${player.name}`;
    return;
  }

  // finished current team, move to next team
  pregameCurrentTeamIndex += 1;
  pregamePlayerIndex = -1;
  if (pregameCurrentTeamIndex < pregameTeamOrder.length) {
    const nextTeamKey = pregameTeamOrder[pregameCurrentTeamIndex];
    const nextTeamName = nextTeamKey === 'home' ? homeNameInput.value : awayNameInput.value;
    sendPregameAction({ type: 'showTeamName', teamName: nextTeamName });
    return;
  }

  // finished all
  // finished all — show finish button in modal. Do NOT auto-close projection.
  const nextBtnEl = document.getElementById('nextPlayerBtn');
  if (nextBtnEl) nextBtnEl.classList.add('hidden');
  const finishBtn = document.getElementById('finishPregameBtn');
  if (finishBtn) {
    finishBtn.classList.remove('hidden');
    finishBtn.onclick = () => {
      sendPregameAction({ type: 'pregameComplete' });
      closePregameModal();
      if (pregameBtn) pregameBtn.style.display = 'none';
      finishBtn.classList.add('hidden');
      const startBtn = document.getElementById('startPregameBtn');
      if (startBtn) {
        startBtn.textContent = 'START PREGAME';
        startBtn.onclick = startPregameSequence;
      }
      const liveEl = document.getElementById('pregameLiveText');
      if (liveEl) liveEl.textContent = 'Toon: -';
    };
  }
}

const initialHomePlayers = [
  { number: 4, name: 'Speler A', points: 0, fouls: 0, team: 'home', onField: false },
  { number: 5, name: 'Speler B', points: 0, fouls: 0, team: 'home', onField: false },
  { number: 6, name: 'Speler C', points: 0, fouls: 0, team: 'home', onField: false },
];

const initialAwayPlayers = [
  { number: 4, name: 'Speler A', points: 0, fouls: 0, team: 'away', onField: false },
  { number: 5, name: 'Speler B', points: 0, fouls: 0, team: 'away', onField: false },
  { number: 6, name: 'Speler C', points: 0, fouls: 0, team: 'away', onField: false },
];

let homePlayers = [];
let awayPlayers = [];
let currentPeriod = '1';
let selectedPlayer = null;
let selectedTeam = null;
let pendingSubstitute = null; // { player, team } when a bench player is selected for substitution
let editingTeam = null;
let activeEventType = null;
let foulShootingPlayer = null; // player shooting free throws

// Access Code Functions
function hideLoginOverlay() {
  if (loginOverlay) {
    loginOverlay.classList.add('hidden');
  }
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

// Player Box Creation
function createPlayerBox(player, team) {
  const box = document.createElement('div');
  box.className = 'player-box';
  const teamColor = team === 'home' ? homeColorInput.value : awayColorInput.value;
  // default subtle border; selected state will get the team color
  box.style.borderColor = 'rgba(255,255,255,0.12)';
  
  if (selectedPlayer === player && selectedTeam === team) {
    box.classList.add('selected');
    box.style.borderColor = teamColor;
  }

  const number = document.createElement('div');
  number.className = 'player-box-number';
  number.textContent = player.number;
  // Visual indicator: team color when on field, default when on bench
  if (player.onField) {
    number.style.background = teamColor;
    number.style.color = '#000';
    number.style.borderRadius = '8px';
    number.style.padding = '8px 10px';
  } else {
    number.style.background = 'transparent';
    number.style.color = '#fff';
  }

  const name = document.createElement('div');
  name.className = 'player-box-name';
  name.textContent = player.name;

  // small green dot when player is on the field
  if (player.onField) {
    const dot = document.createElement('span');
    dot.className = 'control-on-field-dot';
    // place dot next to the number for better visibility in compact columns
    number.appendChild(dot);
  }

  box.append(number, name);
  
  // Card click implements activation/substitution/selection so whole card is clickable
  box.addEventListener('click', (e) => {
    e.stopPropagation();
    const players = team === 'home' ? homePlayers : awayPlayers;
    const onFieldCount = players.filter(p => p.onField).length;

    if (!player.onField) {
      // bench clicked
      if (onFieldCount < 5) {
        // activate immediately
        player.onField = true;
        pendingSubstitute = null;
        selectedPlayer = player;
        selectedTeam = team;
        updateSelectedPlayerDisplay();
        renderPlayerGrids();
        pushStateToFirebase();
        return;
      }

      // already 5 on field => mark as pending substitute
      pendingSubstitute = { player, team };
      selectedPlayer = player;
      selectedTeam = team;
      updateSelectedPlayerDisplay();
      renderPlayerGrids();
      return;
    }

    // on-field clicked
    if (pendingSubstitute && pendingSubstitute.team === team && pendingSubstitute.player !== player) {
      const invaller = pendingSubstitute.player;
      invaller.onField = true;
      player.onField = false;
      pendingSubstitute = null;
      selectedPlayer = invaller;
      selectedTeam = team;
      updateSelectedPlayerDisplay();
      renderPlayerGrids();
      pushStateToFirebase();
      return;
    }

    // otherwise select the on-field player for scoring/fouls
    selectedPlayer = player;
    selectedTeam = team;
    updateSelectedPlayerDisplay();
    renderPlayerGrids();
  });

  // Card click selects player for scoring/fouls
  box.addEventListener('click', () => selectPlayer(player, team));
  
  return box;
}

function toggleOnField(clickedPlayer, team) {
  const players = team === 'home' ? homePlayers : awayPlayers;

  // If a pending substitute exists for this team and clicked player is on-field -> swap
  if (pendingSubstitute && pendingSubstitute.team === team && clickedPlayer.onField && pendingSubstitute.player !== clickedPlayer) {
    const invaller = pendingSubstitute.player;
    invaller.onField = true;
    clickedPlayer.onField = false;
    pendingSubstitute = null;
    selectedPlayer = invaller;
    selectedTeam = team;
    updateSelectedPlayerDisplay();
    renderPlayerGrids();
    pushStateToFirebase();
    return;
  }

  // If clicked player is not on field -> try to put them on field (if slots available)
  if (!clickedPlayer.onField) {
    const onFieldCount = players.filter(p => p.onField).length;
    if (onFieldCount >= 5) {
      alert('Maximum 5 spelers op het veld');
      return;
    }
    clickedPlayer.onField = true;
    selectedPlayer = clickedPlayer;
    selectedTeam = team;
    updateSelectedPlayerDisplay();
    renderPlayerGrids();
    pushStateToFirebase();
    return;
  }

  // If clicked player is on-field -> select them (do not remove from field)
  selectedPlayer = clickedPlayer;
  selectedTeam = team;
  updateSelectedPlayerDisplay();
  renderPlayerGrids();
}

function selectPlayer(player, team) {
  selectedPlayer = player;
  selectedTeam = team;
  updateSelectedPlayerDisplay();
  renderPlayerGrids();
}

function updateSelectedPlayerDisplay() {
  if (selectedPlayer && selectedTeam) {
    selectedPlayerNumberEl.textContent = selectedPlayer.number;
    selectedPlayerNameEl.textContent = selectedPlayer.name;
    selectedPlayerFoulsEl.textContent = selectedPlayer.fouls;
    selectedPlayerPointsEl.textContent = selectedPlayer.points;
    const color = selectedTeam === 'home' ? homeColorInput.value : awayColorInput.value;
    if (selectedPlayerInfoEl) {
      selectedPlayerInfoEl.style.border = `2px solid ${color}`;
      selectedPlayerInfoEl.style.color = '#fff';
    }
  } else {
    selectedPlayerNumberEl.textContent = '--';
    selectedPlayerNameEl.textContent = 'Selecteer speler';
    selectedPlayerFoulsEl.textContent = '0';
    selectedPlayerPointsEl.textContent = '0';
    if (selectedPlayerInfoEl) {
      selectedPlayerInfoEl.style.border = '2px solid transparent';
      selectedPlayerInfoEl.style.color = '';
    }
  }
}

function renderPlayerGrids() {
  // Clear both on-field and bench containers
  if (homeOnFieldEl) homeOnFieldEl.innerHTML = '';
  if (homeBenchEl) homeBenchEl.innerHTML = '';
  if (awayOnFieldEl) awayOnFieldEl.innerHTML = '';
  if (awayBenchEl) awayBenchEl.innerHTML = '';

  // Sort players by number ascending for consistent order
  const sortedHome = homePlayers.slice().sort((a, b) => a.number - b.number);
  const sortedAway = awayPlayers.slice().sort((a, b) => a.number - b.number);

  // Helper to render team columns: left = on-field (if any) otherwise half of bench, right = bench or remaining half
  function renderTeam(sortedList, leftEl, rightEl, teamKey) {
    const on = sortedList.filter(p => p.onField);
    const bench = sortedList.filter(p => !p.onField);

    let leftList = [];
    let rightList = [];

    if (on.length > 0) {
      leftList = on;
      rightList = bench;
    } else {
      // split bench into two roughly equal columns
      const half = Math.ceil(bench.length / 2);
      leftList = bench.slice(0, half);
      rightList = bench.slice(half);
    }

    leftList.forEach(p => { if (leftEl) leftEl.append(createPlayerBox(p, teamKey)); });
    rightList.forEach(p => { if (rightEl) rightEl.append(createPlayerBox(p, teamKey)); });

    // Compact layout when many players
    if (leftEl) leftEl.classList.toggle('compact', sortedList.length >= 12);
    if (rightEl) rightEl.classList.toggle('compact', sortedList.length >= 12);
  }

  renderTeam(sortedHome, homeOnFieldEl, homeBenchEl, 'home');
  renderTeam(sortedAway, awayOnFieldEl, awayBenchEl, 'away');
}

// Scoring Functions
function addPoints(points) {
  if (!selectedPlayer) {
    alert('Selecteer eerst een speler');
    return;
  }
  if (!selectedPlayer.onField) {
    alert('Speler moet op het veld staan om punten toe te kennen');
    return;
  }
  
  selectedPlayer.points += points;
  lastScoreText = `${selectedPlayer.name} - ${points}PT`;
  updateSelectedPlayerDisplay();
  renderPlayerGrids();
  pushStateToFirebase();
  showPopup(selectedPlayer, `${points}PT`);
}

function addFoul(foulType) {
  if (!selectedPlayer) {
    alert('Selecteer eerst een speler');
    return;
  }
  if (!selectedPlayer.onField) {
    alert('Speler moet op het veld staan om een fout toe te kennen');
    return;
  }
  
  if (selectedPlayer.fouls < 5 && foulType === 'P') {
    selectedPlayer.fouls += 1;
    lastScoreText = `${selectedPlayer.name} - FOUT`;
  }
  
  // Store which team committed foul for shooter selection
  foulShootingPlayer = null;
  
  // Show free throw shooter selection for P1/P2/P3
  if (foulType === 'P1' || foulType === 'P2' || foulType === 'P3') {
    showFoulModal(foulType);
    return;
  }
  
  updateSelectedPlayerDisplay();
  renderPlayerGrids();
  pushStateToFirebase();
  showPopup(selectedPlayer, foulType);
}

function showFoulModal(foulType) {
  const otherTeam = selectedTeam === 'home' ? 'away' : 'home';
  const otherTeamPlayers = otherTeam === 'home' ? homePlayers : awayPlayers;
  const otherTeamName = otherTeam === 'home' ? homeNameInput.value : awayNameInput.value;

  const foulTypeText = {
    'P1': '1 vrijworp',
    'P2': '2 vrijworpen',
    'P3': '3 vrijworpen'
  }[foulType];

  // Only show on-field players of the other team, sorted by number ascending
  const onFieldPlayers = otherTeamPlayers.filter(p => p.onField).slice().sort((a, b) => a.number - b.number);
  const hasOnField = onFieldPlayers.length > 0;

  foulModal.innerHTML = `
    <div class="modal-content">
      <h3>${foulTypeText} - Kies schutter</h3>
      <p>${otherTeamName} mag de vrijworp(en) nemen. ${hasOnField ? 'Kies een speler:' : 'Er staan momenteel geen spelers op het veld.'}</p>
      <div class="foul-player-list">
        ${hasOnField ? onFieldPlayers.map((p) => `
          <button type="button" class="foul-player-option" data-player-id="${p.number}">
            <div class="foul-player-number">${p.number}</div>
            <div class="foul-player-name">${p.name}</div>
          </button>
        `).join('') : ''}
      </div>
      <div class="modal-actions">
        <button id="foulCancelBtn" class="action-button">Weigeren</button>
      </div>
    </div>
  `;

  foulModal.classList.remove('hidden');

  // Setup event listeners for player selection
  foulModal.querySelectorAll('.foul-player-option').forEach(el => {
    el.addEventListener('click', () => {
      const playerNum = parseInt(el.dataset.playerId, 10);
      const shooter = otherTeamPlayers.find(p => p.number === playerNum);
      if (shooter) {
        foulShootingPlayer = shooter;
        completeFoul(foulType);
      }
    });
  });

  const cancelBtn = foulModal.querySelector('#foulCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      foulShootingPlayer = null;
      foulModal.classList.add('hidden');
    });
  }
}

function completeFoul(foulType) {
  if (selectedPlayer.fouls < 5) {
    selectedPlayer.fouls += 1;
  }
  
  const foulTypeMap = {
    'P1': '1 vrijworp',
    'P2': '2 vrijworpen',
    'P3': '3 vrijworpen'
  };
  
  const shooterText = foulShootingPlayer 
    ? `${foulTypeMap[foulType]} voor nummer ${foulShootingPlayer.number}: ${foulShootingPlayer.name}`
    : foulTypeMap[foulType];
  
  lastScoreText = `${selectedPlayer.name} - FOUT`;
  
  foulModal.classList.add('hidden');
  updateSelectedPlayerDisplay();
  renderPlayerGrids();
  pushStateToFirebase();
  
  // Show popup with shooter info
  const popupData = {
    player: selectedPlayer,
    type: 'FOUT',
    foulType: foulType,
    shooter: foulShootingPlayer,
    shooterText: shooterText
  };
  try {
    console.log('[control] write popup -> Firebase', popupData);
  } catch (e) {}
  try {
    window.setFirebase(window.ref(window.db, 'popup'), popupData);
  } catch (e) {
    console.warn('Failed to write popup to Firebase', e);
  }
  sendSocketMessage({ type: 'popup', popupData });
  
  foulShootingPlayer = null;
}

// Edit Modal Functions
function openEditModal(team) {
  editingTeam = team;

  const players = team === 'home' ? homePlayers : awayPlayers;

  editTeamLabel.textContent =
    (team === 'home' ? homeNameInput.value : awayNameInput.value) +
    ' - Spelers bewerken';

  playerEditList.innerHTML = '';

  players.forEach((player, index) => {
    const box = document.createElement('div');
    box.className = 'player-box';

    const number = document.createElement('div');
    number.className = 'player-box-number';
    number.textContent = player.number;

    const name = document.createElement('div');
    name.className = 'player-box-name';
    name.textContent = player.name;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-icon-btn';
    editBtn.title = 'Speler bewerken';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openInlineEditor(box, index, team);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-icon-btn';
    deleteBtn.title = 'Speler verwijderen';
    deleteBtn.textContent = '🗑';
    deleteBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (!confirm('Weet je zeker dat je deze speler wil verwijderen?')) return;
      players.splice(index, 1);
      renderPlayerGrids();
      pushStateToFirebase();
      openEditModal(team);
    });

    box.append(number, name, editBtn, deleteBtn);

    // voeg toe aan lijst
    playerEditList.appendChild(box);
    });

  // Hide the add-player button when team has 12 players
  if (addPlayerBtn) addPlayerBtn.style.display = players.length >= 12 ? 'none' : '';
  // show the player edit modal
  if (playerEditModal) playerEditModal.classList.remove('hidden');
}

// Inline editor inside the player edit modal
function openInlineEditor(containerEl, playerIndex, team) {
  const players = team === 'home' ? homePlayers : awayPlayers;
  const player = players[playerIndex];
  if (!player) return;

  containerEl.innerHTML = '';
  const editRow = document.createElement('div');
  editRow.className = 'player-edit-row';

  const numberInput = document.createElement('input');
  numberInput.type = 'number';
  numberInput.min = '1';
  numberInput.max = '99';
  numberInput.value = player.number;
  numberInput.id = `edit-number-${playerIndex}`;
  numberInput.className = 'edit-number';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = player.name;
  nameInput.id = `edit-name-${playerIndex}`;
  nameInput.className = 'edit-name';

  const actions = document.createElement('div');
  actions.className = 'player-edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'action-button save-edit-btn';
  saveBtn.textContent = 'Opslaan';
  saveBtn.addEventListener('click', () => {
    const newNum = parseInt(numberInput.value, 10);
    const newName = nameInput.value.trim();
    if (!newNum || !newName) {
      alert('Voer alstublieft een nummer en naam in');
      return;
    }
    // prevent duplicate numbers in same team
    const dup = players.find((p, idx) => idx !== playerIndex && (p.number === newNum || p.name.toLowerCase() === newName.toLowerCase()));
    if (dup) {
      alert('Er bestaat al een speler met hetzelfde nummer of naam in deze ploeg');
      return;
    }
    player.number = newNum;
    player.name = newName;
    renderPlayerGrids();
    pushStateToFirebase();
    // re-open modal list to reflect changes
    openEditModal(team);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'action-button cancel-edit-btn';
  cancelBtn.textContent = 'Annuleer';
  cancelBtn.addEventListener('click', () => {
    openEditModal(team);
  });

  actions.append(saveBtn, cancelBtn);
  editRow.append(numberInput, nameInput, actions);
  containerEl.appendChild(editRow);
  // focus name input
  setTimeout(() => nameInput.focus(), 50);
}

function closeEditModals() {
  playerEditModal.classList.add('hidden');
  addPlayerModal.classList.add('hidden');
  editingTeam = null;
}

// Firebase listeners: keep control in sync with remote state without overwriting on load
function setupFirebaseListeners() {
  if (!window.db || !window.ref || !window.onValue) {
    setTimeout(setupFirebaseListeners, 150);
    return;
  }

  window.onValue(window.ref(window.db, 'state'), (snapshot) => {
    const state = snapshot.val();
    if (!state) return;
    homePlayers = (state.homePlayers || []).map(p => ({ ...p }));
    awayPlayers = (state.awayPlayers || []).map(p => ({ ...p }));
    currentPeriod = state.period || currentPeriod;
    lastScoreText = state.lastScoreText || lastScoreText;
    if (homeNameInput) homeNameInput.value = state.homeName || homeNameInput.value;
    if (awayNameInput) awayNameInput.value = state.awayName || awayNameInput.value;
    if (homeColorInput) homeColorInput.value = state.homeTeamColor || homeColorInput.value;
    if (awayColorInput) awayColorInput.value = state.awayTeamColor || awayColorInput.value;
    renderPlayerGrids();
    updateSelectedPlayerDisplay();
    updateControlScoreboard();
    if (pregameBtn) pregameBtn.style.display = (currentPeriod === '1') ? '' : 'none';
  });

  // popup - show locally as well (and clear)
  window.onValue(window.ref(window.db, 'popup'), (snapshot) => {
    const data = snapshot.val();
    if (data) {
      showPopup(data.player, data.type);
      try { window.setFirebase(window.ref(window.db, 'popup'), null); } catch (e) {}
    }
  });

  // handle stop actions from projection/control
  window.onValue(window.ref(window.db, 'timeoutAction'), (snapshot) => {
    const action = snapshot.val();
    if (action && action.type === 'stop') {
      hideActivePrompt();
      try { window.setFirebase(window.ref(window.db, 'timeoutAction'), null); } catch (e) {}
    }
  });

  window.onValue(window.ref(window.db, 'halftimeAction'), (snapshot) => {
    const action = snapshot.val();
    if (action && action.type === 'stop') {
      hideActivePrompt();
      try { window.setFirebase(window.ref(window.db, 'halftimeAction'), null); } catch (e) {}
    }
  });

  // Listen for pregame actions from projection (e.g., video done or team name prompts)
  try {
    window.onValue(window.ref(window.db, 'pregameAction'), (snapshot) => {
      const action = snapshot.val();
      if (!action || !action.type) return;
      // projection signals video finished -> enable 'Start pregame'
      if (action.type === 'videoDone' || action.type === 'videoComplete') {
        const startBtn = document.getElementById('startPregameBtn');
        if (startBtn) startBtn.disabled = false;
        pregameVideoPlayed = true;
        // keep Start Video visible and enabled so it can be replayed
        if (startVideoBtn) {
          startVideoBtn.disabled = false;
          startVideoBtn.style.display = '';
        }
      }
      // projection asks to show a team name in the pregame prompt
      if (action.type === 'showTeamName' && action.teamName) {
        const liveEl = document.getElementById('pregameLiveText');
        if (liveEl) liveEl.textContent = `Toon: ${action.teamName}`;
      }
      // projection or control signalled that pregame finished - ensure next button hidden
      if (action.type === 'pregameComplete') {
        const nextBtn = document.getElementById('nextPlayerBtn');
        if (nextBtn) nextBtn.classList.add('hidden');
        const startBtn2 = document.getElementById('startPregameBtn');
        if (startBtn2) {
          startBtn2.textContent = 'START PREGAME';
          startBtn2.onclick = startPregameSequence;
          startBtn2.disabled = false;
        }
        const finishBtn = document.getElementById('finishPregameBtn');
        if (finishBtn) finishBtn.classList.add('hidden');
        // keep Start Video available after pregame completes so it can be replayed
      }
    });
  } catch (e) {
    // ignore if firebase not ready
  }
}

// Load saved state from localStorage if present (prevents reset on refresh)
function loadLocalStateIfExists() {
  try {
    const saved = localStorage.getItem(storageKey('bva-match-state'));
    if (!saved) return false;
    const s = JSON.parse(saved);
    homePlayers = (s.homePlayers || initialHomePlayers).map(p => ({ ...p }));
    awayPlayers = (s.awayPlayers || initialAwayPlayers).map(p => ({ ...p }));
    if (s.homeName && homeNameInput) homeNameInput.value = s.homeName;
    if (s.awayName && awayNameInput) awayNameInput.value = s.awayName;
    if (s.homeTeamColor && homeColorInput) homeColorInput.value = s.homeTeamColor;
    if (s.awayTeamColor && awayColorInput) awayColorInput.value = s.awayTeamColor;
    currentPeriod = s.period || currentPeriod;
    lastScoreText = s.lastScoreText || lastScoreText;
    return true;
  } catch (e) {
    return false;
  }
}

// Firebase & State
    

function showPopup(player, type) {
  const popupData = { player, type };
  try {
    console.log('[control] write popup -> Firebase', popupData);
  } catch (e) {}
  try {
    window.setFirebase(window.ref(window.db, 'popup'), popupData);
  } catch (e) {
    console.warn('Failed to write popup to Firebase', e);
  }
  sendSocketMessage({ type: 'popup', popupData });
}

function sendSocketMessage(message) {
  if (!socket) return;
  const payload = JSON.stringify(message);
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
  } else {
    socketQueue.push(payload);
  }
}

function updateControlScoreboard() {
  const homeScore = homePlayers.reduce((sum, p) => sum + p.points, 0);
  const awayScore = awayPlayers.reduce((sum, p) => sum + p.points, 0);

  const homeScoreEl = document.getElementById('controlHomeScore') || document.querySelector('.home-score-card .score-value');
  const awayScoreEl = document.getElementById('controlAwayScore') || document.querySelector('.away-score-card .score-value');
  const homeNameEl = document.getElementById('controlHomeName');
  const awayNameEl = document.getElementById('controlAwayName');

  if (homeScoreEl) homeScoreEl.textContent = homeScore;
  if (awayScoreEl) awayScoreEl.textContent = awayScore;
  if (homeNameEl) {
    homeNameEl.textContent = homeNameInput.value;
    // do not color the team name background anymore (only text update)
    homeNameEl.style.background = '';
    homeNameEl.style.color = '';
  }
  if (awayNameEl) {
    awayNameEl.textContent = awayNameInput.value;
    awayNameEl.style.background = '';
    awayNameEl.style.color = '';
  }
}

function resetMatch() {
  if (confirm('Weet je zeker dat je de wedstrijd wil resetten?')) {
    homePlayers = initialHomePlayers.map((p) => ({ ...p, points: 0, fouls: 0 }));
    awayPlayers = initialAwayPlayers.map((p) => ({ ...p, points: 0, fouls: 0 }));
    selectedPlayer = null;
    selectedTeam = null;
    renderPlayerGrids();
    updateSelectedPlayerDisplay();
    pushStateToFirebase();
  }
}

function getProjectionLink() {
  return `${window.location.origin}${window.location.pathname.replace(/\/[^\/]*$/, '/')}projection.html`;
}

// Timeout/Halftime Functions
function showTimeoutModal() {
  // Update radio labels to current team names
  const homeLabel = document.getElementById('homeTeamLabel');
  const awayLabel = document.getElementById('awayTeamLabel');
  if (homeLabel) homeLabel.textContent = homeNameInput.value || 'Thuis';
  if (awayLabel) awayLabel.textContent = awayNameInput.value || 'Uit';

  document.querySelector('input[name="timeout-team"][value="home"]').checked = true;
  timeoutModal.classList.remove('hidden');
}

function hideTimeoutModal() {
  timeoutModal.classList.add('hidden');
}

function startTimeout() {
  const selectedTeamInput = document.querySelector('input[name="timeout-team"]:checked');
  if (!selectedTeamInput) {
    alert('Selecteer een team');
    return;
  }
  
  const team = selectedTeamInput.value;
  const teamName = team === 'home' ? homeNameInput.value : awayNameInput.value;
  
  // Move all players to the bench immediately when timeout starts
  benchAllPlayers();

  const timeoutData = { team, teamName, duration: 60, remaining: 60 };
  window.setFirebase(window.ref(window.db, 'timeoutData'), timeoutData);
  sendSocketMessage({ type: 'timeout-data', timeoutData });
  try { localStorage.setItem(storageKey('timeout-data'), JSON.stringify(timeoutData)); } catch (e) {}
  
  hideTimeoutModal();
  showActivePrompt('timeout', teamName);
}

function stopTimeout() {
  window.setFirebase(window.ref(window.db, 'timeoutAction'), { type: 'stop' });
  sendSocketMessage({ type: 'timeout-action', action: { type: 'stop' } });
  hideActivePrompt();
}

function stopHalftime() {
  window.setFirebase(window.ref(window.db, 'halftimeAction'), { type: 'stop' });
  sendSocketMessage({ type: 'halftime-action', action: { type: 'stop' } });
  hideActivePrompt();
}

function showActivePrompt(type, teamName = '') {
  activeEventType = type;
  activePromptMessage.textContent = type === 'timeout' ? `Time-out: ${teamName}` : 'Halftime gestart';
  stopEventBtn.textContent = type === 'timeout' ? 'Stop time-out' : 'Stop halftime';
  activeEventPrompt.classList.remove('hidden');
}

function hideActivePrompt() {
  activeEventType = null;
  activeEventPrompt.classList.add('hidden');
}

function showHalftimeModal() {
  halftimeModal.classList.remove('hidden');
}

function hideHalftimeModal() {
  halftimeModal.classList.add('hidden');
}

// Move all players to the bench and clear selection
function benchAllPlayers() {
  homePlayers.forEach(p => { p.onField = false; });
  awayPlayers.forEach(p => { p.onField = false; });
  // Clear selection to avoid awarding points to bench players
  selectedPlayer = null;
  selectedTeam = null;
  updateSelectedPlayerDisplay();
  renderPlayerGrids();
  pushStateToFirebase();
}

function startHalftimeFromModal() {
  const halftimeData = { totalSeconds: 15 * 60, remaining: 15 * 60 };
  window.setFirebase(window.ref(window.db, 'halftimeData'), halftimeData);
  sendSocketMessage({ type: 'halftime-data', halftimeData });
  try { localStorage.setItem(storageKey('halftime-data'), JSON.stringify(halftimeData)); } catch (e) {}

  // Also emit an explicit halftime action to ensure projection reacts immediately
  const action = { type: 'start', halftimeData };
  try { window.setFirebase(window.ref(window.db, 'halftimeAction'), action); } catch (e) {}
  sendSocketMessage({ type: 'halftime-action', action });
  hideHalftimeModal();
  showActivePrompt('halftime');
}

// Event Listeners
function setupEventListeners() {
  // Access code
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
      if (accessError) accessError.classList.add('hidden');
    });
  }

  // Scoring buttons
  document.querySelectorAll('.points-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const points = parseInt(btn.dataset.points);
      addPoints(points);
    });
  });

  document.querySelectorAll('.foul-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const foulType = btn.dataset.foul;
      addFoul(foulType);
    });
  });

  // Team edit buttons
  document.getElementById('homeEditBtn').addEventListener('click', () => openEditModal('home'));
  document.getElementById('awayEditBtn').addEventListener('click', () => openEditModal('away'));

  // Edit modal buttons
  closeEditBtn.addEventListener('click', closeEditModals);
  document.getElementById('closeEditModal').addEventListener('click', closeEditModals);
  
  addPlayerBtn.addEventListener('click', () => {
    const players = editingTeam === 'home' ? homePlayers : awayPlayers;
    const nextNum = (players && players.length) ? (Math.max(...players.map(p => p.number)) + 1) : 1;
    newPlayerNumber.value = nextNum;
    newPlayerName.value = '';
    savePlayerBtn.onclick = () => {
      savePlayerBtn.disabled = true;
      const newNum = parseInt(newPlayerNumber.value);
      const newName = newPlayerName.value.trim();

      if (!newNum || !newName) {
        alert('Vul nummer en naam in');
        savePlayerBtn.disabled = false;
        return;
      }

      const players = editingTeam === 'home' ? homePlayers : awayPlayers;
      if (players.length >= 12) {
        alert('Maximaal 12 spelers per ploeg toegestaan');
        savePlayerBtn.disabled = false;
        return;
      }

      // Prevent duplicate number or name
      const dup = players.find(p => p.number === newNum || p.name.toLowerCase() === newName.toLowerCase());
      if (dup) {
        alert('Er bestaat al een speler met hetzelfde nummer of naam');
        savePlayerBtn.disabled = false;
        return;
      }

      players.push({ number: newNum, name: newName, points: 0, fouls: 0, team: editingTeam, onField: false });

      renderPlayerGrids();
      pushStateToFirebase();
      openEditModal(editingTeam);
      addPlayerModal.classList.add('hidden');
      savePlayerBtn.disabled = false;
    };
    addPlayerModal.classList.remove('hidden');
  });

  cancelAddPlayerBtn.addEventListener('click', () => {
    addPlayerModal.classList.add('hidden');
  });

  // Team name and color changes
  homeNameInput.addEventListener('input', pushStateToFirebase);
  awayNameInput.addEventListener('input', pushStateToFirebase);
  homeColorInput.addEventListener('change', () => {
    renderPlayerGrids();
    pushStateToFirebase();
  });
  awayColorInput.addEventListener('change', () => {
    renderPlayerGrids();
    pushStateToFirebase();
  });

  // Period buttons
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const period = e.target.dataset.period;
      // Always set the current period and update UI/state
      currentPeriod = period;
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      pushStateToFirebase();
      if (pregameBtn) pregameBtn.style.display = (currentPeriod === '1') ? '' : 'none';
      // If halftime period selected, open halftime modal (period already set)
      // When period changes, send all players to the bench so the projection shows an empty field
      benchAllPlayers();
      // If halftime period selected, open halftime modal (period already set)
      if (period === '3') {
        showHalftimeModal();
        return;
      }
    });
  });

  // Timeout
  if (timeoutBtn) timeoutBtn.addEventListener('click', showTimeoutModal);
  document.getElementById('cancelTimeoutBtn').addEventListener('click', hideTimeoutModal);
  document.getElementById('startTimeoutBtn').addEventListener('click', startTimeout);

  // Halftime
  document.getElementById('cancelHalftimeBtn').addEventListener('click', hideHalftimeModal);
  document.getElementById('startHalftimeBtn').addEventListener('click', startHalftimeFromModal);

  // Stop event
  if (stopEventBtn) stopEventBtn.addEventListener('click', () => {
    if (activeEventType === 'timeout') stopTimeout();
    else if (activeEventType === 'halftime') stopHalftime();
  });

  // Reset and Open Projection
  if (resetBtn) resetBtn.addEventListener('click', resetMatch);
  if (openProjectionBtn) openProjectionBtn.addEventListener('click', () => {
    window.open(getProjectionLink(), 'projection');
  });
  if (pregameBtn) pregameBtn.addEventListener('click', openPregameModal);
  const prepareBtn = document.getElementById('preparePregameBtn');
  const startBtn = document.getElementById('startPregameBtn');
  const nextBtn = document.getElementById('nextPlayerBtn');
  const cancelPregameBtn = document.getElementById('cancelPregameBtn');
  if (prepareBtn) prepareBtn.onclick = preparePregame;
  if (startBtn) startBtn.onclick = startPregameSequence;
  if (startVideoBtn) startVideoBtn.addEventListener('click', () => {
    // send action to projection to start the PREGAME video
    sendPregameAction({ type: 'startVideo' });
    // briefly disable to prevent accidental double clicks, but allow replay
    try { startVideoBtn.disabled = true; } catch (e) {}
    setTimeout(() => { try { startVideoBtn.disabled = false; } catch (e) {} }, 500);
  });
  if (nextBtn) nextBtn.onclick = nextPregamePlayer;
  if (cancelPregameBtn) cancelPregameBtn.onclick = closePregameModal;

  // Info modal
  if (infoLink) infoLink.addEventListener('click', () => infoModal.classList.remove('hidden'));
  if (closeInfoModal) closeInfoModal.addEventListener('click', () => infoModal.classList.add('hidden'));
}

// Initialize
function init() {
  const loaded = loadLocalStateIfExists();
  if (!loaded) {
    homePlayers = initialHomePlayers.map((p) => ({ ...p }));
    awayPlayers = initialAwayPlayers.map((p) => ({ ...p }));
  }
  
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.period === currentPeriod) {
      btn.classList.add('active');
    }
  });

  setupEventListeners();
  // Attach Firebase listeners (will populate control if remote state exists)
  setupFirebaseListeners();
  renderPlayerGrids();
  updateSelectedPlayerDisplay();
  if (pregameBtn) pregameBtn.style.display = (currentPeriod === '1') ? '' : 'none';
}

// Start initialization
if (window.db && window.ref && window.setFirebase) {
  init();
} else {
  console.warn('Firebase not initialized yet, waiting...');
  setTimeout(init, 100);
}
