// player.js — YouTube-based player + playlist + host-driven sync with drift correction

const socket = io();

// query helpers
function qs(p) {
  const u = new URL(window.location.href);
  return u.searchParams.get(p);
}
function el(id) { return document.getElementById(id); }
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function niceTime(s) {
  s = Number(s)||0;
  const m = Math.floor(s/60);
  const r = Math.floor(s%60);
  return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
}

// DOM
const roomBadge = el('roomBadge');
const roleBadge = el('roleBadge');
const onlineCount = el('onlineCount');
const btnLeave = el('btnLeave');

const playBig = el('playBig');
const prevBtn = el('prev'); const nextBtn = el('next');
const titleEl = el('title'); const artistEl = el('artist');
const coverEl = el('cover');
const seek = el('seek'); const curT = el('curT'); const durT = el('durT');

const playlistBox = el('playlistBox');
const searchPro = el('searchPro'); const btnSearch = el('btnSearch'); const resultsBox = el('resultsBox');

const chatFull = el('chatFull');
const chatWindow = el('chatWindow');
const msgInput = el('msgInput');
const btnSend = el('btnSend');

const musicTabBtn = el('musicTabBtn');
const chatTabBtn = el('chatTabBtn');
const mainGrid = el('mainGrid');

// state
let currentRoom = qs('room') || null;
let role = (qs('role') || 'GUEST').toUpperCase();
let name = decodeURIComponent(qs('name') || 'guest');
let createFlag = (qs('create') === '1' || qs('create') === 'true');
let isHost = role === 'HOST';

roomBadge.textContent = currentRoom || '—';
roleBadge.textContent = role;

// playlist holds youtube video objects: { id, title, channelTitle }
let playlist = [];
let currentIndex = -1;

// YouTube player globals (YT API will set onYouTubeIframeAPIReady)
let ytPlayer = null;
let ytReady = false;
let waitingForReady = null;

// drift correction config
const DRIFT_SEEK_THRESHOLD = 0.6; // seconds: if difference > threshold, seek to host target
const DRIFT_SMALL_THRESHOLD = 0.25; // no-op if within this
const HEARTBEAT_INTERVAL_MS = 4000; // host sends periodic state

// local clock sync: we will use server timestamps provided in 'player:sync' (ts in ms) and Date.now()
// compute offset = Date.now() - received_ts when getting the event; use it to estimate network delay
// clients will compute targetTime = currentTime + (Date.now() - ts)/1000

// -------------------- YouTube IFrame API integration --------------------
function createYTPlayer(videoId) {
  if (ytPlayer) {
    try { ytPlayer.loadVideoById(videoId); } catch(e){ console.warn(e); }
    return;
  }
  // create iframe player
  ytPlayer = new YT.Player('ytPlayer', {
    height: '100%',
    width: '100%',
    videoId: videoId,
    playerVars: {
      controls: 1,
      disablekb: 1,
      rel: 0,
      modestbranding: 1,
      playsinline: 1
    },
    events: {
      onReady: (e) => {
        ytReady = true;
        if (waitingForReady) {
          waitingForReady();
          waitingForReady = null;
        }
      },
      onStateChange: onPlayerStateChange
    }
  });
}

// Guest: ensure player exists and load video
function loadVideoForGuest(videoId, startAt = 0, autoplay = false) {
  if (!ytReady) {
    // create player or wait
    waitingForReady = () => {
      try { ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startAt) }); } catch(e){ console.warn(e); }
      if (autoplay) {
        try { ytPlayer.playVideo(); } catch(e){ console.warn(e); }
      }
    };
    if (!ytPlayer) createYTPlayer(videoId);
    return;
  }
  try {
    ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startAt) });
    if (autoplay) ytPlayer.playVideo();
  } catch (e) { console.warn(e); }
}

// Host: play video and control events will be sent on user actions
function hostLoadVideo(videoId, startAt = 0, autoplay = false) {
  if (!ytReady) {
    waitingForReady = () => {
      try {
        ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startAt) });
        if (autoplay) ytPlayer.playVideo();
      } catch(e){ console.warn(e); }
    };
    if (!ytPlayer) createYTPlayer(videoId);
    return;
  }
  try {
    ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startAt) });
    if (autoplay) ytPlayer.playVideo();
  } catch(e){ console.warn(e); }
}

// player state mapping
function onPlayerStateChange(event) {
  // YT states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering
  const state = event.data;
  if (!isHost) return; // guests shouldn't send sync
  // get current time and send host stateChange
  if (state === YT.PlayerState.PLAYING) {
    const ct = ytPlayer.getCurrentTime();
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: Math.floor(ct) });
  } else if (state === YT.PlayerState.PAUSED) {
    const ct = ytPlayer.getCurrentTime();
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: false, currentTime: Math.floor(ct) });
  } else if (state === YT.PlayerState.ENDED) {
    // ended — host will advance playlist programmatically (we also listen for ended)
    const ct = ytPlayer.getCurrentTime();
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: false, currentTime: Math.floor(ct) });
  }
}

// helper: get current playback time (use ytPlayer API)
function getLocalPlaybackTime() {
  if (!ytReady || !ytPlayer) return 0;
  try { return ytPlayer.getCurrentTime() || 0; } catch(e){ return 0; }
}

// helper: play/pause for host control buttons
playBig.addEventListener('click', () => {
  if (!ytPlayer) return alert('No track loaded');
  if (!isHost) {
    // guest: control disabled
    return;
  }
  const state = ytPlayer.getPlayerState();
  if (state !== YT.PlayerState.PLAYING) {
    ytPlayer.playVideo();
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: Math.floor(getLocalPlaybackTime()) });
    playBig.innerHTML = '❚❚';
  } else {
    ytPlayer.pauseVideo();
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: false, currentTime: Math.floor(getLocalPlaybackTime()) });
    playBig.innerHTML = '▶';
  }
});

prevBtn.addEventListener('click', () => {
  if (!isHost) return alert('Only host can control playback');
  if (currentIndex <= 0) return;
  currentIndex -= 1;
  const t = playlist[currentIndex];
  hostLoadVideo(t.id, 0, true);
  socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id: t.id } });
});

nextBtn.addEventListener('click', () => {
  if (!isHost) return alert('Only host can control playback');
  if (currentIndex + 1 >= playlist.length) return;
  currentIndex += 1;
  const t = playlist[currentIndex];
  hostLoadVideo(t.id, 0, true);
  socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id: t.id } });
});

// seek slider
seek.addEventListener('input', (e) => {
  const p = Number(e.target.value || 0);
  if (!ytReady || !ytPlayer) return;
  const dur = ytPlayer.getDuration() || 0;
  if (!dur) return;
  const newSec = (p / 100) * dur;
  if (isHost) {
    ytPlayer.seekTo(newSec, true);
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: Math.floor(newSec) });
  } else {
    // guest: just seek locally
    try { ytPlayer.seekTo(newSec, true); } catch(e){ }
  }
});

// periodic UI update for seekbar
setInterval(() => {
  if (!ytReady || !ytPlayer) return;
  try {
    const dur = ytPlayer.getDuration() || 0;
    const cur = ytPlayer.getCurrentTime() || 0;
    if (dur) {
      seek.value = Math.floor((cur / dur) * 100);
      curT.textContent = niceTime(cur);
      durT.textContent = niceTime(dur);
    }
  } catch (e) {}
}, 500);

// playlist rendering
function renderPlaylist() {
  if (!playlist.length) {
    playlistBox.innerHTML = '<div class="text-slate-500">Empty playlist</div>';
    return;
  }
  playlistBox.innerHTML = playlist.map((t, i) => {
    const active = i === currentIndex ? 'ring-2 ring-indigo-500' : '';
    return `<div class="p-2 rounded-md bg-slate-800 flex items-center justify-between ${active}">
      <div>
        <div class="font-semibold text-sm">${escapeHtml(t.title)}</div>
        <div class="text-xs text-slate-400">${escapeHtml(t.channelTitle)}</div>
      </div>
      <div class="flex gap-2">
        <button class="smallPlay px-2 py-1 rounded-md bg-emerald-500 text-xs" data-i="${i}">▶</button>
        <button class="smallRem px-2 py-1 rounded-md bg-red-600 text-xs" data-i="${i}">✕</button>
      </div>
    </div>`;
  }).join('');
}
playlistBox.addEventListener('click', (e) => {
  const p = e.target.closest('.smallPlay');
  const r = e.target.closest('.smallRem');
  if (p) {
    const i = Number(p.dataset.i);
    if (!isHost) return alert('Only host can control playback');
    currentIndex = i;
    const t = playlist[currentIndex];
    hostLoadVideo(t.id, 0, true);
    socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id: t.id } });
  } else if (r) {
    const i = Number(r.dataset.i);
    playlist.splice(i,1);
    if (i === currentIndex) {
      currentIndex = -1;
      // stop player
      if (ytPlayer && isHost) { ytPlayer.stopVideo(); }
    } else if (i < currentIndex) currentIndex--;
    renderPlaylist();
  }
});

function addToPlaylist(item) {
  playlist.push(item);
  renderPlaylist();
  // if nothing is playing & user is host, auto-play
  if (currentIndex === -1 && isHost) {
    currentIndex = playlist.length - 1;
    const t = playlist[currentIndex];
    hostLoadVideo(t.id, 0, true);
    socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id: t.id } });
  }
}

// -------------------- Search (server-side proxy to YouTube) --------------------
btnSearch.addEventListener('click', () => doSearch());
searchPro.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

async function doSearch() {
  const q = (searchPro.value || '').trim();
  if (!q) return;
  resultsBox.innerHTML = '<div class="text-slate-500">Searching…</div>';
  try {
    const r = await fetch(`/api/yt/search?q=${encodeURIComponent(q)}&limit=12`);
    if (!r.ok) throw new Error('search failed');
    const j = await r.json();
    const items = j.results || [];
    if (!items.length) resultsBox.innerHTML = '<div class="text-slate-500">No results</div>';
    else {
      resultsBox.innerHTML = items.map(it => {
        return `<div class="p-2 rounded-md bg-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="${escapeHtml(it.thumbnail)}" width="64" height="36" class="rounded-sm"/>
            <div>
              <div class="font-semibold text-sm">${escapeHtml(it.title)}</div>
              <div class="text-xs text-slate-400">${escapeHtml(it.channelTitle)}</div>
            </div>
          </div>
          <div class="flex gap-2">
            <button class="addBtn px-2 py-1 rounded-md bg-emerald-500 text-xs" data-id="${escapeHtml(it.videoId)}" data-title="${escapeHtml(it.title)}" data-channel="${escapeHtml(it.channelTitle)}">＋</button>
            <button class="playNow px-2 py-1 rounded-md bg-slate-700 text-xs" data-id="${escapeHtml(it.videoId)}">▶</button>
          </div>
        </div>`;
      }).join('');
    }
  } catch (e) {
    console.error(e);
    resultsBox.innerHTML = '<div class="text-red-400">Search failed</div>';
  }
}

// handle add/play buttons
resultsBox.addEventListener('click', (e) => {
  const add = e.target.closest('.addBtn');
  const pnow = e.target.closest('.playNow');
  if (add) {
    const id = add.dataset.id;
    const title = add.dataset.title;
    const channel = add.dataset.channel;
    addToPlaylist({ id, title, channelTitle: channel });
  } else if (pnow) {
    const id = pnow.dataset.id;
    // host only can immediately play
    if (!isHost) return alert('Only host can start playback');
    // set track
    socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id } });
    hostLoadVideo(id, 0, true);
  }
});

// -------------------- SOCKET EVENTS: sync/track/chat --------------------
socket.on('stats:update', ({ online }) => { onlineCount.textContent = (online||0) + ' online'; });

socket.on('player:trackChanged', ({ track, currentTime, isPlaying } = {}) => {
  if (!track) return;
  if (track.type === 'youtube') {
    // guests load video at given currentTime
    const startAt = (currentTime || 0);
    loadVideoForGuest(track.id, startAt, !!isPlaying);
    // also update UI meta
    titleEl.textContent = 'YouTube Video';
    artistEl.textContent = '';
  }
});

// player:sync contains { isPlaying, currentTime, ts }
socket.on('player:sync', ({ isPlaying, currentTime, ts } = {}) => {
  if (!ytReady || !ytPlayer) {
    // attempt to apply later
    return;
  }
  // compute approximate network latency elapsed since host sent ts
  const now = Date.now();
  const elapsedMs = now - (ts || now);
  const reportedTime = Number(currentTime) || 0;
  const targetTime = reportedTime + (elapsedMs / 1000);

  // apply drift correction for guests only
  if (!isHost) {
    try {
      const localTime = ytPlayer.getCurrentTime() || 0;
      const diff = Math.abs(localTime - targetTime);
      if (diff > DRIFT_SEEK_THRESHOLD) {
        ytPlayer.seekTo(Math.floor(targetTime), true);
      }
      // playback state
      if (isPlaying) ytPlayer.playVideo().catch(()=>{});
      else ytPlayer.pauseVideo();
    } catch (e) { console.warn(e); }
    return;
  }

  // host may ignore incoming sync
});

// -------------------- CHAT --------------------
btnSend.addEventListener('click', sendChat);
msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
  const text = (msgInput.value || '').trim();
  if (!text || !currentRoom) return;
  socket.emit('chat:send', { roomId: currentRoom, userName: name || 'guest', text }, (resp) => {
    if (resp && resp.ok) msgInput.value = '';
    else alert('Send failed');
  });
}

socket.on('chat:new', (m) => {
  if (!m || m.roomId !== currentRoom) return;
  if (!window._chat) window._chat = [];
  window._chat.push(m);
  renderChat(window._chat);
});

function renderChat(messages) {
  chatWindow.innerHTML = (messages || []).map(m => {
    const d = new Date(m.ts || Date.now());
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `<div><div class="font-semibold">${escapeHtml(m.userName)}</div><div class="text-slate-300">${escapeHtml(m.text)}</div><div class="text-xs text-slate-500">${hh}:${mm}</div></div>`;
  }).join('');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// -------------------- ROOM JOIN / CREATE flow --------------------
socket.on('connect', () => {
  if (createFlag) {
    socket.emit('room:create', (resp) => {
      if (!resp.ok) return alert('Failed to create room');
      currentRoom = resp.roomId;
      role = 'HOST';
      isHost = true;
      roomBadge.textContent = currentRoom;
      roleBadge.textContent = 'HOST';
      // update history
      history.replaceState({}, '', `${location.pathname}?room=${currentRoom}&role=HOST&name=${encodeURIComponent(name)}`);
    });
    return;
  }

  if (!currentRoom) {
    alert('No room specified. Go back to join page.');
    return;
  }

  socket.emit('room:join', { roomId: currentRoom }, async (resp) => {
    if (!resp.ok) {
      alert('Failed to join room: ' + (resp.error || 'unknown'));
      return;
    }

    // apply player state if present
    if (resp.state && resp.state.currentTrack) {
      const ct = resp.state.currentTrack;
      if (ct.type === 'youtube') {
        // load video for guest
        loadVideoForGuest(ct.id, resp.state.currentTime || 0, !!resp.state.isPlaying);
      }
    }

    // populate chat history
    if (Array.isArray(resp.chat) && resp.chat.length) {
      window._chat = resp.chat.slice();
    } else {
      // fallback to /api/room-chat
      try {
        const r = await fetch(`/api/room-chat?room=${encodeURIComponent(currentRoom)}`);
        if (r.ok) {
          const j = await r.json();
          window._chat = Array.isArray(j.chat) ? j.chat.slice() : [];
        } else window._chat = [];
      } catch (e) {
        window._chat = [];
      }
    }
    renderChat(window._chat || []);
  });
});

// -------------------- TAB controls: show music or chat --------------------
function showMusic() {
  mainGrid.classList.remove('hidden');
  chatFull.classList.add('hidden');
  musicTabBtn.classList.add('bg-slate-800');
  chatTabBtn.classList.remove('bg-slate-800');
}
function showChat() {
  mainGrid.classList.add('hidden');
  chatFull.classList.remove('hidden');
  chatTabBtn.classList.add('bg-slate-800');
  musicTabBtn.classList.remove('bg-slate-800');
  // ensure chat rendered
  if (!window._chat) window._chat = [];
  renderChat(window._chat || []);
}

musicTabBtn.addEventListener('click', showMusic);
chatTabBtn.addEventListener('click', showChat);

// leave
btnLeave.addEventListener('click', () => {
  window.location.href = '/join.html';
});

// -------------------- Host heartbeat (periodic state push) --------------------
setInterval(() => {
  if (!isHost || !ytReady || !ytPlayer || !currentRoom) return;
  try {
    const cur = Math.floor(ytPlayer.getCurrentTime() || 0);
    const playing = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: playing, currentTime: cur });
  } catch (e) {}
}, HEARTBEAT_INTERVAL_MS);

// -------------------- YouTube API ready callback --------------------
// This function called by the YouTube iframe API when it has loaded
window.onYouTubeIframeAPIReady = function() {
  // If there's an initial track (maybe host created or guest join), create player with that ID or blank
  // We'll leave player empty; it will be created/loaded when needed.
  // createYTPlayer(); // don't create without id; create when needed
  // mark ready flag only when a player instance is created
  console.log('YouTube API ready');
};

// -------------------- small UX helpers --------------------
function toast(msg) { console.log('TOAST:', msg); }

// -------------------- end --------------------
