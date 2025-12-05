// ========== SOCKET ==========
const socket = io();

// ========== DOM ELEMENTS ==========
const roomCells = [
  document.getElementById("roomCell-0"),
  document.getElementById("roomCell-1"),
  document.getElementById("roomCell-2"),
  document.getElementById("roomCell-3")
];

const hiddenRoomCodeInput = document.getElementById("roomCodeInput");
const btnJoinRoom = document.getElementById("btnJoinRoom");
const btnCreateRoom = document.getElementById("btnCreateRoom");
const roomStatus = document.getElementById("roomStatus");
const onlineCount = document.getElementById("onlineCount");

const usernameLabel = document.getElementById("usernameLabel");
const btnRegenerateName = document.getElementById("btnRegenerateName");

const roomPanel = document.getElementById("roomPanel");

const trackUrlInput = document.getElementById("trackUrlInput");
const btnSetTrack = document.getElementById("btnSetTrack");
const trackStatus = document.getElementById("trackStatus");

const audioPlayer = document.getElementById("audioPlayer");
const btnPlay = document.getElementById("btnPlay");
const btnPause = document.getElementById("btnPause");
const btnSyncNow = document.getElementById("btnSyncNow");

const badgeRoom = document.getElementById("badgeRoom");
const badgeRole = document.getElementById("badgeRole");
const roleInfo = document.getElementById("roleInfo");
const timeInfo = document.getElementById("timeInfo");
const globalStatus = document.getElementById("globalStatus");

// Music tab
const trackSearchInput = document.getElementById("trackSearchInput");
const btnLoadDefaults = document.getElementById("btnLoadDefaults");
const tracksList = document.getElementById("tracksList");

// Tabs
const tabButtons = document.querySelectorAll(".tab-btn");
const tabSession = document.getElementById("tab-session");
const tabMusic = document.getElementById("tab-music");
const tabFun = document.getElementById("tab-fun");

// ========== STATE ==========
let currentRoomId = null;
let role = "NONE";

// Default demo tracks (royalty-free samples)
const defaultTracks = [
  {
    id: "sample3",
    title: "Sample 3s Beat",
    artist: "SampleLib",
    url: "https://www.samplelib.com/lib/preview/mp3/sample-3s.mp3"
  },
  {
    id: "sample6",
    title: "Sample 6s Groove",
    artist: "SampleLib",
    url: "https://www.samplelib.com/lib/preview/mp3/sample-6s.mp3"
  },
  {
    id: "sample9",
    title: "Sample 9s Chill",
    artist: "SampleLib",
    url: "https://www.samplelib.com/lib/preview/mp3/sample-9s.mp3"
  }
];
let currentTrackList = [];

// ========== UTILS ==========
function setStatus(el, msg, type = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.className = "text-[11px] text-slate-400 mt-1 min-h-[14px]";
  if (type === "error") el.classList.add("text-red-400");
  if (type === "success") el.classList.add("text-emerald-400");
}

function formatTime(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return String(m).padStart(2, "0") + ":" + String(rs).padStart(2, "0");
}

function updateRoleUI() {
  badgeRoom.textContent = currentRoomId || "—";
  badgeRole.textContent = role;
  badgeRole.style.color =
    role === "HOST" ? "#22c55e" :
    role === "GUEST" ? "#60a5fa" :
    "#fbbf24";

  roleInfo.textContent =
    role === "NONE" ? "Not connected" : `Connected as ${role}`;

  const host = role === "HOST";
  trackUrlInput.disabled = !host;
  btnSetTrack.disabled = !host;
}

// ========== RANDOM USERNAME ==========
const adjectives = [
  "funny", "silent", "noisy", "clever", "wild",
  "sleepy", "hyper", "cosmic", "lucky", "weird"
];
const animals = [
  "ostrich", "panda", "wolf", "otter", "eagle",
  "tiger", "cat", "dog", "fox", "dolphin"
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateUsername() {
  const name = `${randomItem(adjectives)}-${randomItem(animals)}`;
  usernameLabel.textContent = name;
  return name;
}

generateUsername();
btnRegenerateName.addEventListener("click", () => {
  generateUsername();
});

// ========== ROOM CODE INPUT (AUTO SWITCH) ==========
roomCells.forEach((cell, index) => {
  cell.addEventListener("input", (e) => {
    let val = e.target.value.replace(/[^0-9]/g, "");
    e.target.value = val;

    if (val && index < roomCells.length - 1) {
      roomCells[index + 1].focus();
      roomCells[index + 1].select();
    }
    updateHiddenRoomCode();
  });

  cell.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !e.target.value && index > 0) {
      roomCells[index - 1].focus();
      roomCells[index - 1].select();
    }
  });
});

function updateHiddenRoomCode() {
  const code = roomCells.map((c) => c.value || "").join("");
  hiddenRoomCodeInput.value = code;
  return code;
}

function clearRoomCells() {
  roomCells.forEach((c) => (c.value = ""));
  updateHiddenRoomCode();
}

// ========== ONLINE COUNT ==========
socket.on("stats:update", ({ online }) => {
  const n = online || 0;
  onlineCount.textContent = `${n} people listening now`;
});

// ========== ROOM PANEL VISIBILITY ==========
function showRoomPanel() {
  roomPanel.classList.remove("hidden");
}

// ========== TABS ==========
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    tabButtons.forEach((b) => {
      b.classList.remove("border-indigo-500", "text-slate-100");
      b.classList.add("border-transparent", "text-slate-500");
    });
    btn.classList.add("border-indigo-500", "text-slate-100");
    btn.classList.remove("text-slate-500");

    tabSession.classList.add("hidden");
    tabMusic.classList.add("hidden");
    tabFun.classList.add("hidden");

    if (tab === "session") tabSession.classList.remove("hidden");
    if (tab === "music") tabMusic.classList.remove("hidden");
    if (tab === "fun") tabFun.classList.remove("hidden");
  });
});

// ========== TRACK LIST RENDER ==========
function renderTrackList(list) {
  currentTrackList = list.slice();
  if (!list.length) {
    tracksList.innerHTML =
      `<div class="text-center text-slate-500 text-[11px] py-6">
        No tracks yet. Load default tracks or search.
       </div>`;
    return;
  }

  tracksList.innerHTML = list
    .map(
      (t) => `
      <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900/70 border border-slate-800">
        <div class="flex-1">
          <div class="text-xs font-semibold text-slate-100">${t.title}</div>
          <div class="text-[11px] text-slate-500">${t.artist}</div>
        </div>
        <button
          class="px-3 py-1 rounded-full bg-slate-100 text-slate-900 text-[11px] font-semibold hover:bg-white"
          data-track-id="${t.id}">
          Play
        </button>
      </div>
    `
    )
    .join("");
}

// Default tracks button
btnLoadDefaults.addEventListener("click", () => {
  renderTrackList(defaultTracks);
});

// Search filter (client-side)
trackSearchInput.addEventListener("input", () => {
  const q = trackSearchInput.value.trim().toLowerCase();
  if (!q) {
    renderTrackList(defaultTracks);
    return;
  }
  const filtered = defaultTracks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
  );
  renderTrackList(filtered);
});

// Track click: host plays
tracksList.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-track-id]");
  if (!btn) return;
  const id = btn.getAttribute("data-track-id");
  const track = currentTrackList.find((t) => t.id === id);
  if (!track) return;

  if (role !== "HOST") {
    setStatus(globalStatus, "Only host can start a track.", "error");
    return;
  }
  if (!currentRoomId) {
    setStatus(globalStatus, "Create or join a room first.", "error");
    return;
  }

  // load URL and sync
  trackUrlInput.value = track.url;
  audioPlayer.src = track.url;
  audioPlayer.currentTime = 0;
  audioPlayer.pause();

  socket.emit("player:setTrack", { roomId: currentRoomId, url: track.url });
  setStatus(trackStatus, `Loaded: ${track.title}`, "success");

  // auto play + sync
  audioPlayer.play().catch(() => {});
  socket.emit("player:stateChange", {
    roomId: currentRoomId,
    isPlaying: true,
    currentTime: audioPlayer.currentTime || 0
  });
});

// ========== CREATE ROOM ==========
btnCreateRoom.addEventListener("click", () => {
  socket.emit("room:create", (resp) => {
    if (!resp.ok) {
      setStatus(roomStatus, "Failed to create room.", "error");
      return;
    }
    currentRoomId = resp.roomId;
    role = "HOST";
    updateRoleUI();
    showRoomPanel();

    clearRoomCells();
    resp.roomId.split("").forEach((ch, i) => {
      if (roomCells[i]) roomCells[i].value = ch;
    });
    updateHiddenRoomCode();

    setStatus(
      roomStatus,
      `Room ${resp.roomId} created. Share this code with friends.`,
      "success"
    );
  });
});

// ========== JOIN ROOM ==========
btnJoinRoom.addEventListener("click", () => {
  const code = updateHiddenRoomCode();
  if (!code || code.length !== 4 || !/^[0-9]{4}$/.test(code)) {
    setStatus(roomStatus, "Enter full 4-digit room code.", "error");
    return;
  }

  socket.emit("room:join", { roomId: code }, (resp) => {
    if (!resp.ok) {
      if (resp.error === "ROOM_NOT_FOUND") {
        setStatus(roomStatus, "Room not found.", "error");
      } else if (resp.error === "ROOM_FULL") {
        setStatus(roomStatus, "Room is full.", "error");
      } else {
        setStatus(roomStatus, "Failed to join room.", "error");
      }
      return;
    }

    currentRoomId = resp.roomId;
    role = "GUEST";
    updateRoleUI();
    showRoomPanel();
    setStatus(roomStatus, `Joined room ${resp.roomId}.`, "success");

    if (resp.state && resp.state.currentTrackUrl) {
      audioPlayer.src = resp.state.currentTrackUrl;
    }
    if (resp.state) {
      audioPlayer.currentTime = resp.state.currentTime || 0;
      if (resp.state.isPlaying) {
        audioPlayer.play().catch(() => {});
      } else {
        audioPlayer.pause();
      }
    }
  });
});

// ========== TRACK URL + PLAYER CONTROLS ==========

// Host sets custom track URL
btnSetTrack.addEventListener("click", () => {
  if (role !== "HOST") {
    setStatus(trackStatus, "Only host can set the track.", "error");
    return;
  }
  if (!currentRoomId) {
    setStatus(trackStatus, "Create a room first.", "error");
    return;
  }
  const url = trackUrlInput.value.trim();
  if (!url) {
    setStatus(trackStatus, "Enter a track URL.", "error");
    return;
  }

  audioPlayer.src = url;
  audioPlayer.currentTime = 0;
  audioPlayer.pause();

  socket.emit("player:setTrack", { roomId: currentRoomId, url });
  setStatus(trackStatus, "Track set and shared with room.", "success");
});

// Host play
btnPlay.addEventListener("click", () => {
  if (!currentRoomId) {
    setStatus(globalStatus, "Join or create a room first.", "error");
    return;
  }
  if (!audioPlayer.src) {
    setStatus(globalStatus, "No track loaded.", "error");
    return;
  }

  audioPlayer.play().catch(() => {});
  if (role === "HOST") {
    socket.emit("player:stateChange", {
      roomId: currentRoomId,
      isPlaying: true,
      currentTime: audioPlayer.currentTime || 0
    });
  }
});

// Host pause
btnPause.addEventListener("click", () => {
  if (!currentRoomId) return;

  audioPlayer.pause();
  if (role === "HOST") {
    socket.emit("player:stateChange", {
      roomId: currentRoomId,
      isPlaying: false,
      currentTime: audioPlayer.currentTime || 0
    });
  }
});

// Host seek -> sync
audioPlayer.addEventListener("seeked", () => {
  if (role === "HOST" && currentRoomId) {
    socket.emit("player:stateChange", {
      roomId: currentRoomId,
      isPlaying: !audioPlayer.paused,
      currentTime: audioPlayer.currentTime || 0
    });
  }
});

// Force sync
btnSyncNow.addEventListener("click", () => {
  if (role !== "HOST" || !currentRoomId) return;
  socket.emit("player:stateChange", {
    roomId: currentRoomId,
    isPlaying: !audioPlayer.paused,
    currentTime: audioPlayer.currentTime || 0
  });
  setStatus(globalStatus, "Sync signal sent.", "success");
});

// Time label
setInterval(() => {
  timeInfo.textContent = formatTime(audioPlayer.currentTime);
}, 500);

// Incoming from server
socket.on("player:trackChanged", ({ url, currentTime, isPlaying }) => {
  if (!url) return;
  audioPlayer.src = url;
  audioPlayer.currentTime = currentTime || 0;
  if (isPlaying) {
    audioPlayer.play().catch(() => {});
  } else {
    audioPlayer.pause();
  }
  setStatus(globalStatus, "Track updated by host.", "success");
});

socket.on("player:sync", ({ isPlaying, currentTime }) => {
  if (role === "HOST") return;

  if (typeof currentTime === "number") {
    audioPlayer.currentTime = currentTime;
  }
  if (isPlaying) {
    audioPlayer.play().catch(() => {});
  } else {
    audioPlayer.pause();
  }
  setStatus(globalStatus, "Synced with host.", "success");
});

socket.on("room:closed", () => {
  setStatus(globalStatus, "Host left. Room closed.", "error");
  currentRoomId = null;
  role = "NONE";
  updateRoleUI();
});
