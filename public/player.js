/* =========================================================
   BeatSync — player.js
   Complete updated version
   - Realtime YouTube search
   - Mobile search dropdown
   - Premium SVG icons
   - Playlist
   - Chat
   - Room sync
   - YouTube player
   - Autoplay / next track
   ========================================================= */

const socket = io();

/* =========================================================
   HELPERS
   ========================================================= */

const el = (id) => document.getElementById(id);

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatTime = (seconds = 0) => {
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(sec / 60);
  const remaining = sec % 60;

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
};

/* =========================================================
   PREMIUM SVG ICONS
   ========================================================= */

function icon(name, size = 20) {
  const common = `
    width="${size}"
    height="${size}"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.9"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  `;

  const icons = {
    play: `<svg ${common}><path d="M8 5.5v13l10-6.5z"/></svg>`,

    plus: `<svg ${common}><path d="M12 5v14M5 12h14"/></svg>`,

    trash: `<svg ${common}><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>`,

    search: `<svg ${common}><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>`,

    loader: `<svg ${common} class="bs-spin"><circle cx="12" cy="12" r="8"/></svg>`,

    alert: `<svg ${common}><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>`,

    music: `<svg ${common}><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>`,

    check: `<svg ${common}><path d="m5 12 4 4L19 6"/></svg>`
  };

  return icons[name] || "";
}

/* =========================================================
   DOM
   ========================================================= */

const roomBadge = el("roomBadge");
const roleBadge = el("roleBadge");
const onlineCount = el("onlineCount");

const btnLeave = el("btnLeave");

const searchWrapper = el("searchWrapper");
const searchPro = el("searchPro");
const btnSearch = el("btnSearch");
const resultsBox = el("resultsBox");

const chatMini = el("chatMini");
const miniChat = el("miniChat");

const mainGrid = el("mainGrid");

const ytPlayer = el("ytPlayer");
const playlistBox = el("playlistBox");

const chatFull = el("chatFull");
const chatWindow = el("chatWindow");
const msgInput = el("msgInput");
const btnSend = el("btnSend");

const musicTabBtn = el("musicTabBtn");
const chatTabBtn = el("chatTabBtn");

const titleEl = el("trackTitle") || el("title");
const artistEl = el("trackArtist") || el("artist");

/* =========================================================
   ROOM / USER STATE
   ========================================================= */

const params = new URLSearchParams(window.location.search);

let roomId =
  params.get("room") ||
  params.get("roomId") ||
  localStorage.getItem("beatSyncRoom") ||
  "";

let userName =
  localStorage.getItem("beatSyncName") ||
  "Guest";

let role =
  localStorage.getItem("beatSyncRole") ||
  "user";

let createFlag =
  localStorage.getItem("beatSyncCreate") === "true";

let host =
  role === "host" ||
  role === "admin";

let playlist = [];

let currentTrack = null;

let player = null;

let playerReady = false;

let isApplyingRemoteState = false;

let pendingPlay = false;

/* =========================================================
   SEARCH STATE
   ========================================================= */

let searchTimer = null;
let searchRequestId = 0;

/* =========================================================
   INITIAL UI
   ========================================================= */

if (roomBadge) {
  roomBadge.textContent = roomId
    ? `ROOM ${roomId}`
    : "ROOM";
}

if (roleBadge) {
  roleBadge.textContent = host
    ? "HOST"
    : "MEMBER";
}

if (onlineCount) {
  onlineCount.textContent = "0";
}

/* =========================================================
   DYNAMIC PREMIUM CSS
   ========================================================= */

(function injectPremiumPlayerStyles() {
  if (document.getElementById("beatsync-player-runtime-css")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "beatsync-player-runtime-css";

  style.textContent = `

    /* =====================================================
       PLAYLIST
       ===================================================== */

    .playlist-item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px;
      margin-bottom: 9px;
      border-radius: 18px;
      background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.07);
      transition:
        transform .2s ease,
        background .2s ease,
        border-color .2s ease,
        box-shadow .2s ease;
      overflow: hidden;
    }

    .playlist-item:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,.075);
      border-color: rgba(255,255,255,.13);
      box-shadow: 0 10px 30px rgba(0,0,0,.14);
    }

    .playlist-item.active {
      background: rgba(255,255,255,.09);
      border-color: rgba(255,255,255,.18);
    }

    .playlist-item .track-main {
      min-width: 0;
      flex: 1;
      cursor: pointer;
    }

    .playlist-item .track-title {
      display: block;
      font-size: 14px;
      font-weight: 650;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .playlist-item .track-subtitle {
      display: block;
      margin-top: 3px;
      font-size: 11px;
      opacity: .58;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .playlist-item .track-thumb,
    .search-result-item .result-thumb {
      width: 54px;
      height: 54px;
      flex: 0 0 54px;
      border-radius: 14px;
      object-fit: cover;
      background: rgba(255,255,255,.06);
    }

    /* =====================================================
       ICON BUTTONS
       ===================================================== */

    .icon-action {
      width: 38px;
      height: 38px;
      flex: 0 0 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,.09);
      border-radius: 12px;
      background: rgba(255,255,255,.055);
      color: inherit;
      cursor: pointer;
      transition:
        transform .18s ease,
        background .18s ease,
        border-color .18s ease;
    }

    .icon-action:hover {
      transform: scale(1.05);
      background: rgba(255,255,255,.11);
      border-color: rgba(255,255,255,.18);
    }

    .icon-action:active {
      transform: scale(.94);
    }

    .icon-action svg {
      display: block;
    }

    .result-icon {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
    }

    /* =====================================================
       SEARCH RESULTS
       ===================================================== */

    .search-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px;
      margin-bottom: 9px;
      border-radius: 18px;
      background: rgba(255,255,255,.045);
      border: 1px solid rgba(255,255,255,.065);
      transition:
        transform .2s ease,
        background .2s ease,
        border-color .2s ease;
    }

    .search-result-item:hover {
      transform: translateY(-1px);
      background: rgba(255,255,255,.075);
      border-color: rgba(255,255,255,.13);
    }

    .search-result-main {
      min-width: 0;
      flex: 1;
      cursor: pointer;
    }

    .search-result-title {
      display: block;
      font-size: 13px;
      font-weight: 650;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .search-result-channel {
      display: block;
      margin-top: 4px;
      font-size: 11px;
      opacity: .55;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .search-state {
      width: 100%;
      padding: 18px 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 9px;
      text-align: center;
      border-radius: 16px;
      color: inherit;
      opacity: .65;
      font-size: 13px;
    }

    .search-state svg {
      flex: 0 0 auto;
    }

    /* =====================================================
       LOADER
       ===================================================== */

    .bs-spin {
      animation: bsSpin .8s linear infinite;
    }

    @keyframes bsSpin {
      to {
        transform: rotate(360deg);
      }
    }

    /* =====================================================
       MOBILE SEARCH DROPDOWN
       Results appear directly below search bar.
       ===================================================== */

    @media (max-width: 768px) {

      #searchWrapper {
        position: relative;
        z-index: 1000;
      }

      #resultsBox {
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        right: 0;

        width: 100%;
        max-height: min(62vh, 520px);

        overflow-y: auto;
        overflow-x: hidden;

        padding: 6px;

        border-radius: 20px;

        background: rgba(18, 18, 24, 0.94);

        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);

        border: 1px solid rgba(255,255,255,.10);

        box-shadow:
          0 20px 60px rgba(0,0,0,.35),
          0 5px 20px rgba(0,0,0,.20);

        scrollbar-width: thin;
      }

      #resultsBox:empty {
        display: none;
      }

      #resultsBox .search-result-item {
        width: 100%;
        margin-bottom: 7px;
      }

      #resultsBox .search-result-item:last-child {
        margin-bottom: 0;
      }
    }

    /* =====================================================
       SMALL ANDROID SCREENS
       ===================================================== */

    @media (max-width: 480px) {

      #resultsBox {
        top: calc(100% + 6px);
        max-height: 58vh;
        padding: 5px;
        border-radius: 17px;
      }

      #resultsBox .search-result-item {
        padding: 7px;
        gap: 8px;
        border-radius: 14px;
      }

      #resultsBox .result-thumb {
        width: 46px;
        height: 46px;
        flex-basis: 46px;
      }

      #resultsBox .result-icon {
        width: 34px;
        height: 34px;
        flex-basis: 34px;
      }

      #resultsBox .search-result-title {
        font-size: 12px;
      }

      #resultsBox .search-result-channel {
        font-size: 10px;
      }
    }

    /* =====================================================
       EXTRA SMALL DEVICES
       ===================================================== */

    @media (max-width: 360px) {

      #resultsBox {
        max-height: 55vh;
      }

      #resultsBox .result-thumb {
        width: 42px;
        height: 42px;
        flex-basis: 42px;
      }

      #resultsBox .result-icon {
        width: 32px;
        height: 32px;
        flex-basis: 32px;
      }
    }
  `;

  document.head.appendChild(style);
})();

/* =========================================================
   PLAYLIST RENDER
   ========================================================= */

function renderPlaylist() {
  if (!playlistBox) {
    return;
  }

  playlistBox.innerHTML = "";

  if (!playlist.length) {
    playlistBox.innerHTML = `
      <div class="search-state">
        ${icon("music", 18)}
        <span>Your playlist is empty</span>
      </div>
    `;

    return;
  }

  playlist.forEach((track, index) => {

    const item = document.createElement("div");

    item.className =
      "playlist-item" +
      (
        currentTrack &&
        currentTrack.videoId === track.videoId
          ? " active"
          : ""
      );

    const thumbnail =
      track.thumbnail ||
      `https://i.ytimg.com/vi/${encodeURIComponent(
        track.videoId || ""
      )}/hqdefault.jpg`;

    item.innerHTML = `
      <img
        class="track-thumb"
        src="${escapeHtml(thumbnail)}"
        alt=""
        loading="lazy"
      >

      <div class="track-main">

        <span class="track-title">
          ${escapeHtml(
            track.title || "Unknown track"
          )}
        </span>

        <span class="track-subtitle">
          ${escapeHtml(
            track.channel ||
            track.artist ||
            "YouTube"
          )}
        </span>

      </div>

      <button
        class="icon-action play-track"
        type="button"
        title="Play"
        aria-label="Play"
        data-index="${index}"
      >
        ${icon("play", 18)}
      </button>

      <button
        class="icon-action delete-track"
        type="button"
        title="Remove"
        aria-label="Remove"
        data-index="${index}"
      >
        ${icon("trash", 17)}
      </button>
    `;

    playlistBox.appendChild(item);
  });
}

/* =========================================================
   YOUTUBE PLAYER
   ========================================================= */

function loadYouTubeVideo(
  videoId,
  shouldPlay = true
) {
  if (!videoId) {
    return;
  }

  pendingPlay = shouldPlay;

  if (!playerReady || !player) {
    return;
  }

  isApplyingRemoteState = true;

  try {

    player.loadVideoById(
      videoId
    );

    if (!shouldPlay) {
      player.pauseVideo();
    }

  } catch (error) {

    console.error(
      "YouTube load error:",
      error
    );

  }

  setTimeout(() => {
    isApplyingRemoteState = false;
  }, 250);
}

function playCurrentTrack() {

  if (
    !currentTrack ||
    !playerReady ||
    !player
  ) {
    return;
  }

  try {
    player.playVideo();
  } catch (error) {
    console.error(
      "YouTube play error:",
      error
    );
  }
}

function pauseCurrentTrack() {

  if (
    !playerReady ||
    !player
  ) {
    return;
  }

  try {
    player.pauseVideo();
  } catch (error) {
    console.error(
      "YouTube pause error:",
      error
    );
  }
}

function setTrack(
  track,
  shouldPlay = true,
  broadcast = true
) {

  if (
    !track ||
    !track.videoId
  ) {
    return;
  }

  currentTrack = {

    videoId:
      track.videoId,

    title:
      track.title ||
      "Unknown track",

    channel:
      track.channel ||
      track.artist ||
      "YouTube",

    artist:
      track.artist ||
      track.channel ||
      "YouTube",

    thumbnail:
      track.thumbnail ||
      `https://i.ytimg.com/vi/${encodeURIComponent(
        track.videoId
      )}/hqdefault.jpg`
  };

  if (titleEl) {
    titleEl.textContent =
      currentTrack.title;
  }

  if (artistEl) {
    artistEl.textContent =
      currentTrack.artist ||
      currentTrack.channel ||
      "YouTube";
  }

  renderPlaylist();

  loadYouTubeVideo(
    currentTrack.videoId,
    shouldPlay
  );

  if (
    broadcast &&
    roomId
  ) {

    socket.emit(
      "player:setTrack",
      {
        roomId,
        track: currentTrack,
        userName
      }
    );

  }
}

/* =========================================================
   PLAYLIST ACTIONS
   ========================================================= */

function removeFromPlaylist(index) {

  const numericIndex =
    Number(index);

  if (
    Number.isNaN(numericIndex) ||
    numericIndex < 0 ||
    numericIndex >= playlist.length
  ) {
    return;
  }

  const removed =
    playlist.splice(
      numericIndex,
      1
    )[0];

  renderPlaylist();

  if (
    removed &&
    currentTrack &&
    removed.videoId ===
      currentTrack.videoId &&
    playlist.length
  ) {

    const nextTrack =
      playlist[numericIndex] ||
      playlist[0];

    if (host) {
      setTrack(
        nextTrack,
        true,
        true
      );
    }
  }
}

function playPlaylistIndex(index) {

  const numericIndex =
    Number(index);

  if (
    Number.isNaN(numericIndex) ||
    numericIndex < 0 ||
    numericIndex >= playlist.length
  ) {
    return;
  }

  const track =
    playlist[numericIndex];

  setTrack(
    track,
    true,
    host
  );
}

/* =========================================================
   PLAYLIST CLICK HANDLING
   ========================================================= */

if (playlistBox) {

  playlistBox.addEventListener(
    "click",
    (event) => {

      const playButton =
        event.target.closest(
          ".play-track"
        );

      const deleteButton =
        event.target.closest(
          ".delete-track"
        );

      if (playButton) {

        event.stopPropagation();

        playPlaylistIndex(
          playButton.dataset.index
        );

        return;
      }

      if (deleteButton) {

        event.stopPropagation();

        removeFromPlaylist(
          deleteButton.dataset.index
        );

        return;
      }

      const item =
        event.target.closest(
          ".playlist-item"
        );

      if (!item) {
        return;
      }

      const play =
        item.querySelector(
          ".play-track"
        );

      if (play) {

        playPlaylistIndex(
          play.dataset.index
        );

      }

    }
  );
}

/* =========================================================
   ADD TO PLAYLIST
   ========================================================= */

function addToPlaylist(
  track,
  autoPlay = true
) {

  if (
    !track ||
    !track.videoId
  ) {
    return;
  }

  const exists =
    playlist.some(
      item =>
        item.videoId ===
        track.videoId
    );

  if (!exists) {

    playlist.push({

      videoId:
        track.videoId,

      title:
        track.title ||
        "Unknown track",

      channel:
        track.channel ||
        track.artist ||
        "YouTube",

      artist:
        track.artist ||
        track.channel ||
        "YouTube",

      thumbnail:
        track.thumbnail ||
        `https://i.ytimg.com/vi/${encodeURIComponent(
          track.videoId
        )}/hqdefault.jpg`

    });

  }

  renderPlaylist();

  clearSearch();

  if (
    autoPlay &&
    !currentTrack &&
    host
  ) {

    setTrack(
      playlist[
        playlist.length - 1
      ],
      true,
      true
    );

  }
}

/* =========================================================
   SEARCH
   ========================================================= */

async function doSearch(
  queryOverride = null
) {

  const query =
    (
      queryOverride !== null
        ? queryOverride
        : searchPro?.value || ""
    ).trim();

  if (!resultsBox) {
    return;
  }

  if (query.length < 2) {

    resultsBox.innerHTML = "";

    return;
  }

  const requestId =
    ++searchRequestId;

  resultsBox.innerHTML = `
    <div class="search-state">
      ${icon("loader", 18)}
      <span>Searching...</span>
    </div>
  `;

  try {

    const response =
      await fetch(
        `/api/yt/search?q=${encodeURIComponent(
          query
        )}&limit=12`,
        {
          headers: {
            Accept:
              "application/json"
          }
        }
      );

    if (
      requestId !==
      searchRequestId
    ) {
      return;
    }

    if (!response.ok) {

      throw new Error(
        `Search request failed: ${response.status}`
      );

    }

    const data =
      await response.json();

    if (
      requestId !==
      searchRequestId
    ) {
      return;
    }

    const results =
      Array.isArray(data)
        ? data
        : Array.isArray(
            data.results
          )
          ? data.results
          : Array.isArray(
              data.items
            )
            ? data.items
            : [];

    renderSearchResults(
      results
    );

  } catch (error) {

    console.error(
      "Search error:",
      error
    );

    if (
      requestId !==
      searchRequestId
    ) {
      return;
    }

    resultsBox.innerHTML = `
      <div class="search-state">
        ${icon("alert", 18)}
        <span>
          Unable to load results
        </span>
      </div>
    `;

  }
}

/* =========================================================
   LIVE SEARCH DEBOUNCE
   ========================================================= */

function scheduleLiveSearch() {

  clearTimeout(
    searchTimer
  );

  const query =
    searchPro?.value.trim() ||
    "";

  if (!query) {

    ++searchRequestId;

    if (resultsBox) {
      resultsBox.innerHTML = "";
    }

    return;
  }

  if (query.length < 2) {

    ++searchRequestId;

    if (resultsBox) {

      resultsBox.innerHTML = `
        <div class="search-state">
          <span>
            Type at least 2 characters
          </span>
        </div>
      `;

    }

    return;
  }

  searchTimer =
    setTimeout(
      () => {
        doSearch(query);
      },
      280
    );
}

/* =========================================================
   CLEAR SEARCH
   ========================================================= */

function clearSearch() {

  clearTimeout(
    searchTimer
  );

  ++searchRequestId;

  if (searchPro) {
    searchPro.value = "";
  }

  if (resultsBox) {
    resultsBox.innerHTML = "";
  }
}

/* =========================================================
   RENDER SEARCH RESULTS
   ========================================================= */

function renderSearchResults(
  results
) {

  if (!resultsBox) {
    return;
  }

  if (
    !Array.isArray(results) ||
    !results.length
  ) {

    resultsBox.innerHTML = `
      <div class="search-state">
        ${icon("search", 18)}
        <span>
          No songs found
        </span>
      </div>
    `;

    return;
  }

  resultsBox.innerHTML = "";

  results.forEach(
    (result) => {

      const videoId =
        result.videoId ||
        result.id?.videoId ||
        result.id ||
        "";

      if (!videoId) {
        return;
      }

      const title =
        result.title ||
        result.snippet?.title ||
        "Unknown track";

      const channel =
        result.channel ||
        result.channelTitle ||
        result.snippet?.channelTitle ||
        "YouTube";

      const thumbnail =
        result.thumbnail ||
        result.thumbnails?.medium?.url ||
        result.thumbnails?.default?.url ||
        result.snippet?.thumbnails?.medium?.url ||
        result.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${encodeURIComponent(
          videoId
        )}/hqdefault.jpg`;

      const track = {

        videoId,

        title,

        channel,

        artist: channel,

        thumbnail

      };

      const item =
        document.createElement(
          "div"
        );

      item.className =
        "search-result-item";

      item.innerHTML = `

        <img
          class="result-thumb"
          src="${escapeHtml(
            thumbnail
          )}"
          alt=""
          loading="lazy"
        >

        <div class="search-result-main">

          <span class="search-result-title">
            ${escapeHtml(title)}
          </span>

          <span class="search-result-channel">
            ${escapeHtml(channel)}
          </span>

        </div>

        <button
          class="icon-action result-icon result-play"
          type="button"
          title="Play"
          aria-label="Play"
        >
          ${icon("play", 17)}
        </button>

        <button
          class="icon-action result-icon result-add"
          type="button"
          title="Add to playlist"
          aria-label="Add to playlist"
        >
          ${icon("plus", 18)}
        </button>

      `;

      item.dataset.track =
        JSON.stringify(
          track
        );

      resultsBox.appendChild(
        item
      );

    }
  );
}

/* =========================================================
   SEARCH INPUT EVENTS
   ========================================================= */

if (searchPro) {

  searchPro.addEventListener(
    "input",
    scheduleLiveSearch
  );

  searchPro.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
        "Enter"
      ) {

        event.preventDefault();

        clearTimeout(
          searchTimer
        );

        doSearch(
          searchPro.value.trim()
        );

      }

      if (
        event.key ===
        "Escape"
      ) {

        clearSearch();

      }

    }
  );

}

if (btnSearch) {

  btnSearch.addEventListener(
    "click",
    () => {

      doSearch(
        searchPro?.value.trim() ||
        ""
      );

    }
  );

}

/* =========================================================
   SEARCH RESULT ACTIONS
   ========================================================= */

if (resultsBox) {

  resultsBox.addEventListener(
    "click",
    (event) => {

      const item =
        event.target.closest(
          ".search-result-item"
        );

      if (!item) {
        return;
      }

      let track;

      try {

        track =
          JSON.parse(
            item.dataset.track ||
            "{}"
          );

      } catch {

        return;

      }

      const addButton =
        event.target.closest(
          ".result-add"
        );

      const playButton =
        event.target.closest(
          ".result-play"
        );

      if (addButton) {

        event.stopPropagation();

        addToPlaylist(
          track,
          false
        );

        return;
      }

      if (
        playButton ||
        event.target.closest(
          ".search-result-main"
        ) ||
        event.target.closest(
          ".result-thumb"
        )
      ) {

        event.stopPropagation();

        addToPlaylist(
          track,
          false
        );

        setTrack(
          track,
          true,
          host
        );

        clearSearch();

      }

    }
  );

}

/* =========================================================
   SOCKET — STATS
   ========================================================= */

socket.on(
  "stats:update",
  (data = {}) => {

    if (!roomId) {
      return;
    }

    if (
      data.roomId &&
      String(data.roomId) !==
        String(roomId)
    ) {
      return;
    }

    const count =
      data.online ??
      data.onlineCount ??
      data.count ??
      data.users;

    if (
      onlineCount &&
      count !== undefined
    ) {

      onlineCount.textContent =
        String(count);

    }

  }
);

/* =========================================================
   SOCKET — TRACK CHANGE
   ========================================================= */

socket.on(
  "player:trackChanged",
  (data = {}) => {

    if (
      data.roomId &&
      String(data.roomId) !==
        String(roomId)
    ) {
      return;
    }

    const track =
      data.track ||
      data;

    if (
      !track?.videoId
    ) {
      return;
    }

    currentTrack =
      track;

    if (titleEl) {
      titleEl.textContent =
        track.title ||
        "Unknown track";
    }

    if (artistEl) {
      artistEl.textContent =
        track.artist ||
        track.channel ||
        "YouTube";
    }

    renderPlaylist();

    loadYouTubeVideo(
      track.videoId,
      false
    );

  }
);

/* =========================================================
   SOCKET — PLAYER SYNC
   ========================================================= */

socket.on(
  "player:sync",
  (data = {}) => {

    if (
      data.roomId &&
      String(data.roomId) !==
        String(roomId)
    ) {
      return;
    }

    if (!data) {
      return;
    }

    isApplyingRemoteState =
      true;

    try {

      if (
        data.track &&
        data.track.videoId
      ) {

        currentTrack =
          data.track;

        if (titleEl) {

          titleEl.textContent =
            data.track.title ||
            "Unknown track";

        }

        if (artistEl) {

          artistEl.textContent =
            data.track.artist ||
            data.track.channel ||
            "YouTube";

        }

        renderPlaylist();

        loadYouTubeVideo(
          data.track.videoId,
          false
        );

      }

      if (
        playerReady &&
        player &&
        typeof data.currentTime ===
          "number"
      ) {

        try {

          player.seekTo(
            data.currentTime,
            true
          );

        } catch {}

      }

      if (
        playerReady &&
        player
      ) {

        if (
          data.state ===
          "playing"
        ) {

          player.playVideo();

        } else if (
          data.state ===
          "paused"
        ) {

          player.pauseVideo();

        }

      }

    } catch (error) {

      console.error(
        "Remote sync error:",
        error
      );

    }

    setTimeout(
      () => {
        isApplyingRemoteState =
          false;
      },
      500
    );

  }
);

/* =========================================================
   SOCKET — PLAYER STATE
   ========================================================= */

socket.on(
  "player:stateChange",
  (data = {}) => {

    if (
      isApplyingRemoteState
    ) {
      return;
    }

    if (
      data.roomId &&
      String(data.roomId) !==
        String(roomId)
    ) {
      return;
    }

    if (
      !playerReady ||
      !player
    ) {
      return;
    }

    try {

      if (
        data.state ===
        "playing"
      ) {

        player.playVideo();

      }

      if (
        data.state ===
        "paused"
      ) {

        player.pauseVideo();

      }

    } catch {}

  }
);

/* =========================================================
   SOCKET — SET TRACK
   ========================================================= */

socket.on(
  "player:setTrack",
  (data = {}) => {

    if (
      data.roomId &&
      String(data.roomId) !==
        String(roomId)
    ) {
      return;
    }

    if (
      !data.track ||
      !data.track.videoId
    ) {
      return;
    }

    currentTrack =
      data.track;

    if (titleEl) {

      titleEl.textContent =
        currentTrack.title ||
        "Unknown track";

    }

    if (artistEl) {

      artistEl.textContent =
        currentTrack.artist ||
        currentTrack.channel ||
        "YouTube";

    }

    renderPlaylist();

    loadYouTubeVideo(
      currentTrack.videoId,
      true
    );

  }
);

/* =========================================================
   CHAT
   ========================================================= */

function appendChatMessage(
  message = {}
) {

  if (!chatWindow) {
    return;
  }

  const text =
    message.text ||
    message.message ||
    "";

  if (!text) {
    return;
  }

  const sender =
    message.userName ||
    message.name ||
    "User";

  const own =
    String(sender) ===
    String(userName);

  const wrapper =
    document.createElement(
      "div"
    );

  wrapper.className =
    `chat-message ${
      own
        ? "sent"
        : "received"
    }`;

  wrapper.innerHTML = `

    <div class="chat-bubble">

      ${
        !own
          ? `
            <div class="chat-sender">
              ${escapeHtml(sender)}
            </div>
          `
          : ""
      }

      <div class="chat-text">
        ${escapeHtml(text)}
      </div>

    </div>

  `;

  chatWindow.appendChild(
    wrapper
  );

  chatWindow.scrollTop =
    chatWindow.scrollHeight;
}

socket.on(
  "chat:new",
  (message = {}) => {

    if (
      message.roomId &&
      String(message.roomId) !==
        String(roomId)
    ) {
      return;
    }

    appendChatMessage(
      message
    );

    if (miniChat) {

      miniChat.textContent =
        message.text ||
        message.message ||
        "";

    }

  }
);

function sendChat() {

  const text =
    msgInput?.value.trim() ||
    "";

  if (
    !text ||
    !roomId
  ) {
    return;
  }

  socket.emit(
    "chat:send",
    {
      roomId,
      userName,
      text
    }
  );

  if (msgInput) {

    msgInput.value = "";

    msgInput.focus();

  }
}

if (btnSend) {

  btnSend.addEventListener(
    "click",
    sendChat
  );

}

if (msgInput) {

  msgInput.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key ===
          "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        sendChat();

      }

    }
  );

}

/* =========================================================
   ROOM CREATE / JOIN
   ========================================================= */

socket.on(
  "room:create",
  (data = {}) => {

    if (!data.roomId) {
      return;
    }

    roomId =
      String(data.roomId);

    host = true;

    role = "host";

    localStorage.setItem(
      "beatSyncRoom",
      roomId
    );

    localStorage.setItem(
      "beatSyncRole",
      "host"
    );

    if (roomBadge) {

      roomBadge.textContent =
        `ROOM ${roomId}`;

    }

    if (roleBadge) {

      roleBadge.textContent =
        "HOST";

    }

  }
);

socket.on(
  "room:join",
  (data = {}) => {

    if (
      data.roomId &&
      String(data.roomId) ===
        String(roomId)
    ) {

      if (data.role) {

        role =
          data.role;

        host =
          role === "host" ||
          role === "admin";

        localStorage.setItem(
          "beatSyncRole",
          role
        );

      }

      if (roleBadge) {

        roleBadge.textContent =
          host
            ? "HOST"
            : "MEMBER";

      }

    }

  }
);

/* =========================================================
   SOCKET CONNECT
   ========================================================= */

socket.on(
  "connect",
  () => {

    if (!roomId) {
      return;
    }

    socket.emit(
      "room:join",
      {
        roomId,
        userName,
        role,
        create: createFlag
      }
    );

  }
);

/* =========================================================
   TAB SYSTEM
   ========================================================= */

function setMusicTab() {

  if (musicTabBtn) {

    musicTabBtn.classList.add(
      "active"
    );

  }

  if (chatTabBtn) {

    chatTabBtn.classList.remove(
      "active"
    );

  }

  if (mainGrid) {

    mainGrid.style.display =
      "";

  }

  if (chatFull) {

    chatFull.style.display =
      "none";

  }

  if (searchWrapper) {

    searchWrapper.style.display =
      "";

  }

  if (chatMini) {

    chatMini.style.display =
      "";

  }

}

function setChatTab() {

  if (chatTabBtn) {

    chatTabBtn.classList.add(
      "active"
    );

  }

  if (musicTabBtn) {

    musicTabBtn.classList.remove(
      "active"
    );

  }

  if (mainGrid) {

    mainGrid.style.display =
      "none";

  }

  if (chatFull) {

    chatFull.style.display =
      "";

  }

  if (searchWrapper) {

    searchWrapper.style.display =
      "none";

  }

  if (chatMini) {

    chatMini.style.display =
      "none";

  }

}

if (musicTabBtn) {

  musicTabBtn.addEventListener(
    "click",
    setMusicTab
  );

}

if (chatTabBtn) {

  chatTabBtn.addEventListener(
    "click",
    setChatTab
  );

}

/* =========================================================
   LEAVE ROOM
   ========================================================= */

if (btnLeave) {

  btnLeave.addEventListener(
    "click",
    () => {

      try {

        socket.emit(
          "room:leave",
          {
            roomId,
            userName
          }
        );

      } catch {}

      localStorage.removeItem(
        "beatSyncRoom"
      );

      localStorage.removeItem(
        "beatSyncRole"
      );

      window.location.href =
        "/";

    }
  );

}

/* =========================================================
   HEARTBEAT / PLAYER SYNC
   ========================================================= */

setInterval(
  () => {

    if (
      !roomId ||
      !host ||
      !playerReady ||
      !player ||
      isApplyingRemoteState
    ) {
      return;
    }

    try {

      const state =
        player.getPlayerState();

      const currentTime =
        player.getCurrentTime();

      socket.emit(
        "player:sync",
        {
          roomId,

          state:
            state === 1
              ? "playing"
              : "paused",

          currentTime,

          track:
            currentTrack ||
            null
        }
      );

    } catch {}

  },
  1000
);

/* =========================================================
   AUTO NEXT TRACK
   ========================================================= */

function playNextTrack() {

  if (
    !host ||
    !playlist.length
  ) {
    return;
  }

  let currentIndex = -1;

  if (currentTrack) {

    currentIndex =
      playlist.findIndex(
        item =>
          item.videoId ===
          currentTrack.videoId
      );

  }

  const nextIndex =
    currentIndex >= 0
      ? currentIndex + 1
      : 0;

  if (
    nextIndex >=
    playlist.length
  ) {
    return;
  }

  setTrack(
    playlist[nextIndex],
    true,
    true
  );
}

/* =========================================================
   YOUTUBE PLAYER STATE
   ========================================================= */

function onYouTubePlayerStateChange(
  event
) {

  if (!player) {
    return;
  }

  if (
    event.data ===
    YT.PlayerState.PLAYING
  ) {

    if (
      host &&
      !isApplyingRemoteState
    ) {

      socket.emit(
        "player:stateChange",
        {
          roomId,
          state: "playing"
        }
      );

    }

  }

  if (
    event.data ===
    YT.PlayerState.PAUSED
  ) {

    if (
      host &&
      !isApplyingRemoteState
    ) {

      socket.emit(
        "player:stateChange",
        {
          roomId,
          state: "paused"
        }
      );

    }

  }

  if (
    event.data ===
    YT.PlayerState.ENDED
  ) {

    if (host) {

      playNextTrack();

    }

  }

}

/* =========================================================
   YOUTUBE API READY
   ========================================================= */

function onYouTubeIframeAPIReady() {

  if (!ytPlayer) {
    return;
  }

  player =
    new YT.Player(
      ytPlayer,
      {

        width: "100%",

        height: "100%",

        videoId: "",

        playerVars: {

          autoplay: 0,

          controls: 1,

          rel: 0,

          modestbranding: 1,

          playsinline: 1

        },

        events: {

          onReady: () => {

            playerReady =
              true;

            if (
              currentTrack &&
              currentTrack.videoId
            ) {

              loadYouTubeVideo(
                currentTrack.videoId,
                pendingPlay
              );

            }

          },

          onStateChange:
            onYouTubePlayerStateChange,

          onError: (event) => {

            console.warn(
              "YouTube player error:",
              event?.data
            );

          }

        }

      }
    );

}

/* =========================================================
   GLOBAL YOUTUBE CALLBACK
   ========================================================= */

window.onYouTubeIframeAPIReady =
  onYouTubeIframeAPIReady;

/* =========================================================
   INITIAL RENDER
   ========================================================= */

renderPlaylist();

if (!roomId) {

  console.warn(
    "BeatSync: No room ID found."
  );

}