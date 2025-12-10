// player.js — Updated: chat bubbles aligned left/right, clear search on add/play, search visible only in music tab

const socket = io();

// helpers
function qs(p) { const u=new URL(window.location.href); return u.searchParams.get(p); }
function el(id) { return document.getElementById(id); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, (m)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function niceTime(s){ s=Number(s)||0; const m=Math.floor(s/60); const r=Math.floor(s%60); return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`; }

// DOM
const roomBadge = el('roomBadge'), roleBadge = el('roleBadge'), onlineCount = el('onlineCount'), btnLeave = el('btnLeave');
const searchWrapper = el('searchWrapper'), searchPro = el('searchPro'), btnSearch = el('btnSearch'), resultsBox = el('resultsBox');
const musicSection = el('musicSection'), chatFull = el('chatFull'), chatWindow = el('chatWindow');
const msgInput = el('msgInput'), btnSend = el('btnSend');
const musicTabBtn = el('musicTabBtn'), chatTabBtn = el('chatTabBtn');
const playlistBox = el('playlistBox'), playBig = el('playBig'), prevBtn = el('prev'), nextBtn = el('next');
const titleEl = el('title'), artistEl = el('artist'), coverEl = el('cover');
const seek = el('seek'), curT = el('curT'), durT = el('durT');

let currentRoom = qs('room') || null;
let role = (qs('role') || 'GUEST').toUpperCase();
let name = decodeURIComponent(qs('name') || 'guest');
let createFlag = (qs('create') === '1' || qs('create') === 'true');
let isHost = role === 'HOST';

roomBadge.textContent = currentRoom || '—';
roleBadge.textContent = role;

// playlist state
let playlist = [];
let currentIndex = -1;

// YouTube
let ytPlayer = null;
let ytReady = false;
let waitingForReady = null;

const DRIFT_SEEK_THRESHOLD = 0.6;
const HEARTBEAT_INTERVAL_MS = 4000;

// ---- UI helpers ----
function renderPlaylist(){
  if (!playlist.length) { playlistBox.innerHTML = '<div class="text-slate-500">Empty playlist</div>'; return; }
  playlistBox.innerHTML = playlist.map((t,i) => {
    const active = i === currentIndex ? 'ring-2 ring-indigo-500' : '';
    return `<div class="p-2 rounded-md bg-slate-800 flex items-center justify-between ${active}">
      <div>
        <div class="font-semibold text-sm">${escapeHtml(t.title)}</div>
        <div class="text-xs text-slate-400">${escapeHtml(t.channelTitle||'')}</div>
      </div>
      <div class="flex gap-2">
        <button class="smallPlay px-2 py-1 rounded-md bg-emerald-500 text-xs" data-i="${i}">▶</button>
        <button class="smallRem px-2 py-1 rounded-md bg-red-600 text-xs" data-i="${i}">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ---- YouTube player functions ----
function createYTPlayer(videoId){
  if (ytPlayer) { try { ytPlayer.loadVideoById(videoId); } catch(e){} return; }
  ytPlayer = new YT.Player('ytPlayer', {
    height: '100%',
    width: '100%',
    videoId: videoId,
    playerVars: { controls: 1, modestbranding: 1, rel: 0, playsinline: 1 },
    events: {
      onReady: (e)=>{ ytReady=true; if (waitingForReady){ waitingForReady(); waitingForReady=null; } },
      onStateChange: onPlayerStateChange
    }
  });
}

function loadForGuest(videoId, startAt=0, autoplay=false){
  if (!ytReady) { waitingForReady = ()=>{ try { ytPlayer.loadVideoById({videoId, startSeconds: Math.floor(startAt)}); if (autoplay) ytPlayer.playVideo(); } catch(e){} }; if (!ytPlayer) createYTPlayer(videoId); return; }
  try { ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startAt) }); if (autoplay) ytPlayer.playVideo(); } catch(e){}
}

function hostLoad(videoId, startAt=0, autoplay=false){
  if (!ytReady) { waitingForReady = ()=>{ try { ytPlayer.loadVideoById({videoId, startSeconds: Math.floor(startAt)}); if (autoplay) ytPlayer.playVideo(); } catch(e){} }; if (!ytPlayer) createYTPlayer(videoId); return; }
  try { ytPlayer.loadVideoById({ videoId, startSeconds: Math.floor(startAt) }); if (autoplay) ytPlayer.playVideo(); } catch(e){}
}

function onPlayerStateChange(event){
  if (!isHost) return;
  const st = event.data;
  try {
    const ct = ytPlayer.getCurrentTime();
    if (st === YT.PlayerState.PLAYING) socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: true, currentTime: Math.floor(ct) });
    else if (st === YT.PlayerState.PAUSED) socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: false, currentTime: Math.floor(ct) });
    else if (st === YT.PlayerState.ENDED) socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: false, currentTime: Math.floor(ct) });
  } catch(e){}
}

// seek UI update
setInterval(()=> {
  if (!ytPlayer || !ytReady) return;
  try {
    const dur = ytPlayer.getDuration() || 0;
    const cur = ytPlayer.getCurrentTime() || 0;
    if (dur) { seek.value = Math.floor((cur/dur)*100); curT.textContent = niceTime(cur); durT.textContent = niceTime(dur); }
  } catch(e){}
}, 500);

// ---- playlist click handling ----
playlistBox.addEventListener('click', (e) => {
  const p = e.target.closest('.smallPlay');
  const r = e.target.closest('.smallRem');
  if (p) {
    const i = Number(p.dataset.i);
    if (!isHost) return alert('Only host can control playback');
    currentIndex = i;
    const t = playlist[currentIndex];
    hostLoad(t.id, 0, true);
    socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id: t.id } });
    renderPlaylist();
  } else if (r) {
    const i = Number(r.dataset.i);
    playlist.splice(i,1);
    if (i === currentIndex) { currentIndex = -1; if (ytPlayer && isHost) { try { ytPlayer.stopVideo(); } catch(e){} } }
    else if (i < currentIndex) currentIndex--;
    renderPlaylist();
  }
});

function addToPlaylist(item) {
  playlist.push(item);
  renderPlaylist();
  // clear search results & search box
  resultsBox.innerHTML = '';
  searchPro.value = '';
  // if nothing playing & host, auto play
  if (currentIndex === -1 && isHost) {
    currentIndex = playlist.length - 1;
    const t = playlist[currentIndex];
    hostLoad(t.id, 0, true);
    socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id: t.id } });
  }
}

// ---- search (server proxy) ----
btnSearch.addEventListener('click', doSearch);
searchPro.addEventListener('keydown', (e)=>{ if (e.key==='Enter') doSearch(); });

async function doSearch(){
  const q = (searchPro.value||'').trim();
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
  } catch(e){ console.error(e); resultsBox.innerHTML = '<div class="text-red-400">Search failed</div>'; }
}

// handle add/play from results
resultsBox.addEventListener('click', (e) => {
  const add = e.target.closest('.addBtn');
  const pnow = e.target.closest('.playNow');
  if (add) {
    const id = add.dataset.id, title = add.dataset.title, channel = add.dataset.channel;
    addToPlaylist({ id, title, channelTitle: channel });
  } else if (pnow) {
    const id = pnow.dataset.id;
    if (!isHost) return alert('Only host can start playback');
    socket.emit('player:setTrack', { roomId: currentRoom, track: { type: 'youtube', id } });
    hostLoad(id, 0, true);
    // clear results and search box after playNow as well
    resultsBox.innerHTML = '';
    searchPro.value = '';
  }
});

// ---- socket events: sync / track / chat ----
socket.on('stats:update', ({online}) => { onlineCount.textContent = (online||0) + ' online'; });

socket.on('player:trackChanged', ({ track, currentTime, isPlaying } = {}) => {
  if (!track) return;
  if (track.type === 'youtube') {
    loadForGuest(track.id, currentTime || 0, !!isPlaying);
    titleEl.textContent = 'YouTube video';
    artistEl.textContent = '';
  }
});

socket.on('player:sync', ({ isPlaying, currentTime, ts } = {}) => {
  if (!ytReady || !ytPlayer) return;
  const now = Date.now();
  const elapsed = now - (ts || now);
  const targetTime = (Number(currentTime) || 0) + (elapsed/1000);

  if (!isHost) {
    try {
      const local = ytPlayer.getCurrentTime() || 0;
      const diff = Math.abs(local - targetTime);
      if (diff > DRIFT_SEEK_THRESHOLD) {
        ytPlayer.seekTo(Math.floor(targetTime), true);
      }
      if (isPlaying) ytPlayer.playVideo().catch(()=>{});
      else ytPlayer.pauseVideo();
    } catch(e){ console.warn(e); }
  }
});

// ---- chat handling ----
btnSend.addEventListener('click', sendChat);
msgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

function sendChat(){
  const text = (msgInput.value || '').trim();
  if (!text || !currentRoom) return;
  socket.emit('chat:send', { roomId: currentRoom, userName: name || 'guest', text }, (resp) => {
    if (resp && resp.ok) { msgInput.value = ''; }
    else alert('Send failed');
  });
}

socket.on('chat:new', (m) => {
  if (!m || m.roomId !== currentRoom) return;
  if (!Array.isArray(window._chat)) window._chat = [];
  window._chat.push(m);
  renderChat(window._chat);
});

function renderChat(messages){
  // messages: [{ userName, text, ts }]
  chatWindow.innerHTML = (messages || []).map(m => {
    const d = new Date(m.ts || Date.now());
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const isMe = (String(m.userName || '').trim() === String(name || '').trim());
    if (isMe) {
      return `<div class="flex"><div class="chat-bubble chat-right">${escapeHtml(m.text)}<div class="text-[10px] text-white/80 mt-1 text-right">${hh}:${mm}</div></div></div>`;
    } else {
      return `<div class="flex"><div class="chat-bubble chat-left">${escapeHtml(m.userName)}: ${escapeHtml(m.text)}<div class="text-[10px] text-slate-400 mt-1">${hh}:${mm}</div></div></div>`;
    }
  }).join('');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// ---- join/create flow ----
socket.on('connect', () => {
  if (createFlag) {
    socket.emit('room:create', (resp) => {
      if (!resp.ok) return alert('Failed to create room');
      currentRoom = resp.roomId; role = 'HOST'; isHost = true;
      roomBadge.textContent = currentRoom; roleBadge.textContent = 'HOST';
      history.replaceState({}, '', `${location.pathname}?room=${currentRoom}&role=HOST&name=${encodeURIComponent(name)}`);
    });
    return;
  }

  if (!currentRoom) { alert('No room specified. Go back to join page.'); return; }

  socket.emit('room:join', { roomId: currentRoom }, async (resp) => {
    if (!resp.ok) { alert('Failed to join room: ' + (resp.error || 'unknown')); return; }

    // apply player state if present
    if (resp.state && resp.state.currentTrack) {
      const ct = resp.state.currentTrack;
      if (ct.type === 'youtube') loadForGuest(ct.id, resp.state.currentTime || 0, !!resp.state.isPlaying);
    }

    // chat history
    if (Array.isArray(resp.chat) && resp.chat.length) window._chat = resp.chat.slice();
    else {
      try {
        const r = await fetch(`/api/room-chat?room=${encodeURIComponent(currentRoom)}`);
        if (r.ok) { const j = await r.json(); window._chat = Array.isArray(j.chat) ? j.chat.slice() : []; } else window._chat = [];
      } catch(e) { window._chat = []; }
    }
    renderChat(window._chat || []);
  });
});

// ---- tab controls (search visible only on music) ----
function showMusic(){
  musicSection.classList.remove('hidden');
  chatFull.classList.add('hidden');
  musicTabBtn.classList.add('bg-slate-800');
  chatTabBtn.classList.remove('bg-slate-800');
  // show search bar
  if (searchWrapper) searchWrapper.style.display = 'block';
  if (!window._chat) window._chat = [];
}
function showChat(){
  musicSection.classList.add('hidden');
  chatFull.classList.remove('hidden');
  chatTabBtn.classList.add('bg-slate-800');
  musicTabBtn.classList.remove('bg-slate-800');
  // hide search bar when in chat
  if (searchWrapper) searchWrapper.style.display = 'none';
  if (!window._chat) window._chat = [];
  renderChat(window._chat);
}

musicTabBtn.addEventListener('click', showMusic);
chatTabBtn.addEventListener('click', showChat);

// ---- leave ----
btnLeave.addEventListener('click', () => { window.location.href = '/join.html'; });

// ---- heartbeat for hosts ----
setInterval(() => {
  if (!isHost || !ytReady || !ytPlayer || !currentRoom) return;
  try {
    const cur = Math.floor(ytPlayer.getCurrentTime() || 0);
    const playing = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    socket.emit('player:stateChange', { roomId: currentRoom, isPlaying: playing, currentTime: cur });
  } catch(e){}
}, HEARTBEAT_INTERVAL_MS);

// ---- YouTube API ready callback ----
window.onYouTubeIframeAPIReady = function(){ console.log('YouTube API ready'); };
