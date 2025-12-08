// player.js — professional player + chat page logic

const socket = io();

// small helpers
function qs(p) {
  const u = new URL(window.location.href);
  return u.searchParams.get(p);
}
function niceTime(s) {
  s = Number(s) || 0;
  const m = Math.floor(s/60);
  const r = Math.floor(s%60);
  return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
}
function el(id) { return document.getElementById(id); }
function qsel(selector, ctx = document) { return ctx.querySelector(selector); }

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

const musicTabBtn = el('musicTabBtn') || null;
const chatTabBtn = el('chatTabBtn') || null;
const chatFull = el('chatFull');
const chatWindow = el('chatWindow');
const msgInput = el('msgInput');
const btnSend = el('btnSend');

const musicTabBottom = el('musicTabBtn') || null;

// state
let currentRoom = qs('room') || null;
let role = qs('role') || 'GUEST';
let name = qs('name') || 'guest';
let createFlag = qs('create') === '1' || qs('create') === 'true';

let playlist = []; // {id,title,artist,audio,duration}
let idx = -1;
let audio = new Audio();
audio.crossOrigin = "anonymous";
let isHost = role === 'HOST';

// UI init
roomBadge.textContent = currentRoom || '—';
roleBadge.textContent = role;
onlineCount.textContent = '0 online';

// --- socket connection & room flow ---
// After establishing the socket connection, either create room (if createFlag) or join using provided room
socket.on('connect', () => {
  // create or join
  if (createFlag) {
    socket.emit('room:create', (resp) => {
      if (!resp.ok) { alert('Create failed'); return; }
      currentRoom = resp.roomId;
      role = 'HOST';
      isHost = true;
      // update url so it's shareable
      const newUrl = `${location.pathname}?room=${resp.roomId}&role=HOST&name=${encodeURIComponent(name)}`;
      history.replaceState({}, '', newUrl);
      roomBadge.textContent = resp.roomId;
      roleBadge.textContent = 'HOST';
      // clear flags
      // server already joined this socket to room
    });
  } else {
    // join path
    if (!currentRoom) {
      alert('No room specified. Go back to join page.');
      return;
    }
    socket.emit('room:join', { roomId: currentRoom }, (resp) => {
      if (!resp.ok) {
        alert('Failed to join: ' + (resp.error || 'unknown'));
        return;
      }
      // server has given current state (track/chat)
      // if host was playing, we'll receive player data; otherwise set playlist empty
      if (resp.state && resp.state.currentTrackUrl) {
        audio.src = resp.state.currentTrackUrl;
        audio.currentTime = resp.state.currentTime || 0;
        if (resp.state.isPlaying) audio.play().catch(()=>{});
      }
      if (resp.chat) {
        window._chat = resp.chat.slice();
        renderChat(window._chat);
      } else window._chat = [];
    });
  }
});

// update online
socket.on('stats:update', ({online}) => {
  onlineCount.textContent = (online||0) + ' online';
});

// --- player controls (host is source of truth) ---
function setMeta(t) {
  if (!t) {
    titleEl.textContent = 'No track';
    artistEl.textContent = '—';
    coverEl.textContent = '♪';
    durT.textContent = niceTime(0);
    curT.textContent = niceTime(0);
    seek.value = 0;
    return;
  }
  titleEl.textContent = t.title;
  artistEl.textContent = t.artist;
  coverEl.textContent = (t.title||'♪').charAt(0).toUpperCase();
  durT.textContent = niceTime(t.duration||0);
}

function playIndex(i) {
  if (i < 0 || i >= playlist.length) { idx = -1; setMeta(null); audio.pause(); return; }
  idx = i;
  const t = playlist[idx];
  audio.src = t.audio;
  audio.currentTime = 0;
  audio.play().catch(()=>{});
  setMeta(t);
  renderPlaylist();
}

playBig.addEventListener('click', () => {
  if (!audio.src) return alert('No track loaded');
  if (audio.paused) {
    audio.play().catch(()=>{});
    if (isHost) socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: audio.currentTime||0 });
    playBig.innerHTML = '❚❚';
  } else {
    audio.pause();
    if (isHost) socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: false, currentTime: audio.currentTime||0 });
    playBig.innerHTML = '▶';
  }
});

prevBtn.addEventListener('click', () => {
  if (!isHost) return alert('Only host can control playback');
  if (playlist.length===0) return;
  let next = idx - 1; if (next<0) next = 0;
  playIndex(next);
  socket.emit('player:setTrack', { roomId: currentRoom, url: playlist[idx].audio });
  socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: 0 });
});
nextBtn.addEventListener('click', () => {
  if (!isHost) return alert('Only host can control playback');
  if (playlist.length===0) return;
  let next = idx + 1; if (next>=playlist.length) return;
  playIndex(next);
  socket.emit('player:setTrack', { roomId: currentRoom, url: playlist[idx].audio });
  socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: 0 });
});

audio.addEventListener('timeupdate', () => {
  const dur = audio.duration||0;
  const cur = audio.currentTime||0;
  if (dur) {
    seek.value = (cur/dur)*100;
    curT.textContent = niceTime(cur);
  }
});
seek.addEventListener('input', (e) => {
  const p = Number(e.target.value||0);
  const dur = audio.duration||0;
  if (dur) {
    audio.currentTime = (p/100)*dur;
    if (isHost) socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: !audio.paused, currentTime: audio.currentTime||0 });
  }
});
audio.addEventListener('ended', () => {
  // auto advance
  if (idx+1 < playlist.length) {
    playIndex(idx+1);
    if (isHost) {
      socket.emit('player:setTrack', { roomId: currentRoom, url: playlist[idx].audio });
      socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: 0 });
    }
  } else {
    // end of playlist
    idx = -1;
  }
});

// react to server player events (guests)
socket.on('player:trackChanged', ({url,currentTime,isPlaying}) => {
  if (!url) return;
  audio.src = url;
  audio.currentTime = currentTime || 0;
  if (isPlaying) audio.play().catch(()=>{});
  else audio.pause();
});
socket.on('player:sync', ({isPlaying:sp, currentTime:ct}) => {
  if (typeof ct === 'number') audio.currentTime = ct;
  if (sp) audio.play().catch(()=>{});
  else audio.pause();
});

// --- playlist UI ---
function renderPlaylist() {
  if (playlist.length===0) {
    playlistBox.innerHTML = '<div class="text-slate-500">Empty playlist</div>';
    return;
  }
  playlistBox.innerHTML = playlist.map((t,i) => {
    const active = (i===idx) ? 'ring-2 ring-indigo-500' : '';
    return `<div class="p-2 rounded-md bg-slate-800 flex items-center justify-between ${active}">
      <div>
        <div class="font-semibold text-sm">${escapeHtml(t.title)}</div>
        <div class="text-xs text-slate-400">${escapeHtml(t.artist)} • ${niceTime(t.duration)}</div>
      </div>
      <div class="flex gap-2">
        <button class="smallPlay px-2 py-1 rounded-md bg-emerald-500 text-xs" data-i="${i}">▶</button>
        <button class="smallRem px-2 py-1 rounded-md bg-red-600 text-xs" data-i="${i}">✕</button>
      </div>
    </div>`;
  }).join('');
}

playlistBox.addEventListener('click', (ev) => {
  const p = ev.target.closest('.smallPlay');
  const r = ev.target.closest('.smallRem');
  if (p) {
    const i = Number(p.dataset.i);
    if (!isHost) return alert('Only host can control playback');
    playIndex(i);
    socket.emit('player:setTrack', { roomId: currentRoom, url: playlist[idx].audio });
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: 0 });
  } else if (r) {
    const i = Number(r.dataset.i);
    playlist.splice(i,1);
    if (i===idx) { audio.pause(); idx=-1; }
    renderPlaylist();
  }
});

function addToPlaylist(t) {
  playlist.push(t);
  renderPlaylist();
  if (idx===-1 && isHost) {
    playIndex(playlist.length-1);
    socket.emit('player:setTrack', { roomId: currentRoom, url: playlist[idx].audio });
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: 0 });
  }
}

// --- search (Jamendo) ---
// server provides /api/search which proxies Jamendo; if it fails, we'll show demo results
async function searchJamendo(q) {
  try {
    const resp = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=12`);
    if (!resp.ok) throw new Error('search failed');
    const j = await resp.json();
    return j.results || [];
  } catch (e) {
    console.warn('search error', e);
    return [];
  }
}

btnSearch.addEventListener('click', async () => {
  const q = (searchPro.value||'').trim();
  if (!q) return;
  resultsBox.innerHTML = '<div class="text-slate-500">Searching…</div>';
  const items = await searchJamendo(q);
  if (!items.length) resultsBox.innerHTML = '<div class="text-slate-500">No results</div>';
  else {
    resultsBox.innerHTML = items.map(t => {
      return `<div class="p-2 rounded-md bg-slate-800 flex items-center justify-between">
        <div>
          <div class="font-semibold text-sm">${escapeHtml(t.title)}</div>
          <div class="text-xs text-slate-400">${escapeHtml(t.artist)} • ${niceTime(t.duration)}</div>
        </div>
        <div class="flex gap-2">
          <button class="addBtn px-2 py-1 rounded-md bg-emerald-500 text-xs" data-audio="${encodeURIComponent(t.audio)}" data-title="${encodeURIComponent(t.title)}" data-artist="${encodeURIComponent(t.artist)}" data-duration="${t.duration}">＋</button>
          <button class="playNow px-2 py-1 rounded-md bg-slate-700 text-xs" data-audio="${encodeURIComponent(t.audio)}" data-title="${encodeURIComponent(t.title)}" data-artist="${encodeURIComponent(t.artist)}">▶</button>
        </div>
      </div>`;
    }).join('');
  }
});

// handle add/play from results
resultsBox.addEventListener('click', (e) => {
  const add = e.target.closest('.addBtn');
  const pnow = e.target.closest('.playNow');
  if (add) {
    const audioUrl = decodeURIComponent(add.dataset.audio||'');
    const title = decodeURIComponent(add.dataset.title||'');
    const artist = decodeURIComponent(add.dataset.artist||'');
    const duration = Number(add.dataset.duration||0);
    addToPlaylist({ id: Date.now().toString(36), title, artist, audio: audioUrl, duration });
  } else if (pnow) {
    if (!isHost) return alert('Only host can start playback');
    const audioUrl = decodeURIComponent(pnow.dataset.audio||'');
    const title = decodeURIComponent(pnow.dataset.title||'');
    const artist = decodeURIComponent(pnow.dataset.artist||'');
    audio.src = audioUrl;
    audio.currentTime = 0;
    audio.play().catch(()=>{});
    socket.emit('player:setTrack', { roomId: currentRoom, url: audioUrl });
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: 0 });
    setMeta({ title, artist, duration: 0, audio: audioUrl });
  }
});

// basic chat (full screen)
btnSend.addEventListener('click', sendMsg);
msgInput.addEventListener('keydown', (e) => { if (e.key==='Enter') sendMsg(); });

function renderChat(messages) {
  chatWindow.innerHTML = (messages||[]).map(m => {
    const ts = new Date(m.ts||Date.now());
    return `<div><div class="font-semibold">${escapeHtml(m.userName)}</div><div class="text-slate-300">${escapeHtml(m.text)}</div><div class="text-xs text-slate-500">${ts.getHours()}:${String(ts.getMinutes()).padStart(2,'0')}</div></div>`;
  }).join('');
}

function sendMsg() {
  const text = (msgInput.value||'').trim();
  if (!text) return;
  socket.emit('chat:send', { roomId: currentRoom, userName: name || 'guest', text }, (resp) => {
    if (resp && resp.ok) {
      msgInput.value = '';
    } else alert('Send failed');
  });
}

// receive chat messages
socket.on('chat:new', (m) => {
  if (!m || m.roomId !== currentRoom) return;
  if (!window._chat) window._chat = [];
  window._chat.push(m);
  renderChat(window._chat);
});

// UI tab control: full-screen chat
const bottomMusicBtn = el('musicTabBtn');
const bottomChatBtn = el('chatTabBtn');

function showMusic() {
  document.getElementById('mainGrid').classList.remove('hidden');
  chatFull.classList.add('hidden');
  bottomMusicBtn.classList.add('bg-slate-800'); bottomChatBtn.classList.remove('bg-slate-800');
}
function showChat() {
  document.getElementById('mainGrid').classList.add('hidden');
  chatFull.classList.remove('hidden');
  bottomChatBtn.classList.add('bg-slate-800'); bottomMusicBtn.classList.remove('bg-slate-800');
}

bottomMusicBtn.addEventListener('click', showMusic);
bottomChatBtn.addEventListener('click', showChat);

// helper escapes
function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// small UX: leave button
btnLeave.addEventListener('click', () => {
  window.location.href = '/join.html';
});

// initial small demo playlist if Jamendo not present
if (!searchPro) {}
// End of file
