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

// ========== STATE ==========
let currentRoomId = null;
let role = "NONE";

// ========== UTILS ==========
function setStatus(el, msg, type = "") {
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

    // move to next input if filled
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
  const code = roomCells.map(c => c.value || "").join("");
  hiddenRoomCodeInput.value = code;
  return code;
}

function clearRoomCells() {
  roomCells.forEach(c => (c.value = ""));
  updateHiddenRoomCode();
}

// ========== ONLINE COUNT ==========
socket.on("stats:update", ({ online }) => {
  const n = online || 0;
  onlineCount.textContent = `${n} people listening now`;
});

// ========== CREATE ROOM (HOST) ==========
btnCreateRoom.addEventListener("click", () => {
  socket.emit("room:create", (resp) => {
    if (!resp.ok) {
      setStatus(roomStatus, "Failed to create room.", "error");
      return;
    }
    currentRoomId = resp.roomId;
    role = "HOST";
    updateRoleUI();

    // fill 4 boxes
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

// ========== JOIN ROOM (GUEST) ==========
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
    setStatus(roomStatus, `Joined room ${resp.roomId}.`, "success");

    // Sync with host state
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

// ========== TRACK + PLAYER CONTROLS ==========

// Host sets track
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
  if (role === "HOST") return; // host is source of truth

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
