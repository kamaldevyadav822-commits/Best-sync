/* =========================================================
   BeatSync — player.js
   Complete Mobile Performance Optimized Version
   ========================================================= */

'use strict';

/* =========================================================
   SOCKET
========================================================= */

const socket = io();

/* =========================================================
   HELPERS
========================================================= */

function qs(param) {
  const url = new URL(window.location.href);
  return url.searchParams.get(param);
}

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function niceTime(seconds) {
  seconds = Number(seconds) || 0;

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return (
    String(minutes).padStart(2, '0') +
    ':' +
    String(remaining).padStart(2, '0')
  );
}

/* =========================================================
   DISABLE PAGE ZOOM
========================================================= */

/*
   Add/update viewport dynamically so this also works if the
   HTML file does not currently contain the correct viewport.
*/

(function configureViewport() {
  let viewport = document.querySelector(
    'meta[name="viewport"]'
  );

  if (!viewport) {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    document.head.appendChild(viewport);
  }

  viewport.setAttribute(
    'content',
    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
  );
})();

/*
   Prevent pinch zoom on browsers that expose gesture events.
*/

document.addEventListener(
  'gesturestart',
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  'gesturechange',
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

document.addEventListener(
  'gestureend',
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

/*
   Prevent multi-touch pinch zoom on Android/iOS.

   Normal one-finger scrolling remains enabled.
*/

document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches && event.touches.length > 1) {
      event.preventDefault();
    }
  },
  { passive: false }
);

/*
   Prevent double-tap zoom without breaking normal clicks.
*/

let lastTouchTime = 0;

document.addEventListener(
  'touchend',
  (event) => {
    const now = Date.now();

    if (now - lastTouchTime < 280) {
      event.preventDefault();
    }

    lastTouchTime = now;
  },
  { passive: false }
);

/* =========================================================
   PERFORMANCE CSS
========================================================= */

(function injectPerformanceStyles() {
  if (document.getElementById(
    'beatsync-performance-style'
  )) {
    return;
  }

  const style = document.createElement('style');

  style.id =
    'beatsync-performance-style';

  style.textContent = `
    /*
       Mobile performance mode.

       Heavy blur/backdrop-filter is one of the biggest GPU
       costs on low/mid-range Android devices.
    */

    @media (max-width: 768px) {

      html,
      body {
        max-width: 100%;
        overflow-x: hidden;
        overscroll-behavior-x: none;
        touch-action: pan-y;
      }

      *,
      *::before,
      *::after {
        -webkit-tap-highlight-color: transparent;
      }

      button,
      a,
      input,
      textarea,
      select {
        touch-action: manipulation;
      }

      /*
         Disable expensive backdrop blur on mobile.
      */

      .backdrop-blur,
      .backdrop-blur-sm,
      .backdrop-blur-md,
      .backdrop-blur-lg,
      .backdrop-blur-xl,
      .backdrop-blur-2xl,
      .backdrop-blur-3xl {
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }

      /*
         Reduce expensive shadows on mobile.
      */

      .shadow-2xl {
        box-shadow:
          0 8px 24px rgba(0, 0, 0, 0.28) !important;
      }

      .shadow-xl {
        box-shadow:
          0 6px 20px rgba(0, 0, 0, 0.25) !important;
      }

      /*
         Avoid continuous GPU compositing on every element.
      */

      img {
        content-visibility: auto;
      }

      /*
         Smooth scrolling only where it is useful.
      */

      #chatWindow,
      #playlistBox,
      #resultsBox {
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      /*
         Search results.
      */

      #searchWrapper.beatsync-mobile-search-host {
        position: relative !important;
        z-index: 5000 !important;
      }

      #searchWrapper.beatsync-mobile-search-host #resultsBox {
        position: absolute !important;
        left: 0 !important;
        right: 0 !important;
        top: calc(100% + 8px) !important;
        width: 100% !important;

        max-height: 55vh !important;

        overflow-y: auto !important;
        overflow-x: hidden !important;

        z-index: 5000 !important;

        background: rgba(15, 23, 42, 0.98);

        border-radius: 16px;

        border: 1px solid
          rgba(255, 255, 255, 0.08);

        box-shadow:
          0 12px 30px
          rgba(0, 0, 0, 0.35);

        /*
           Intentionally no backdrop-filter.
        */
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /*
         Reduce animated transforms on mobile.
      */

      .beatsync-search-result,
      .beatsync-playlist-item {
        transform: translateZ(0);
      }

      /*
         Prevent accidental horizontal layout overflow.
      */

      #mainGrid,
      main,
      section,
      aside {
        max-width: 100%;
      }

      /*
         YouTube iframe.
      */

      #ytPlayer,
      #ytPlayer iframe {
        max-width: 100%;
      }
    }

    /*
       General touch optimization.
    */

    button,
    [role="button"] {
      -webkit-user-select: none;
      user-select: none;
    }

    input,
    textarea {
      -webkit-user-select: text;
      user-select: text;
    }
  `;

  document.head.appendChild(style);
})();

/* =========================================================
   DOM
========================================================= */

const roomBadge =
  el('roomBadge');

const roleBadge =
  el('roleBadge');

const onlineCount =
  el('onlineCount');

const btnLeave =
  el('btnLeave');

const searchWrapper =
  el('searchWrapper');

const searchPro =
  el('searchPro');

const btnSearch =
  el('btnSearch');

const resultsBox =
  el('resultsBox');

const musicSection =
  el('musicSection') ||
  document.querySelector('.music-column') ||
  el('mainGrid');

const mainGrid =
  el('mainGrid');

const chatFull =
  el('chatFull');

const chatWindow =
  el('chatWindow');

const msgInput =
  el('msgInput');

const btnSend =
  el('btnSend');

const musicTabBtn =
  el('musicTabBtn');

const chatTabBtn =
  el('chatTabBtn');

const playlistBox =
  el('playlistBox');

const playBig =
  el('playBig');

const prevBtn =
  el('prev');

const nextBtn =
  el('next');

const titleEl =
  el('title');

const artistEl =
  el('artist');

const coverEl =
  el('cover');

const seek =
  el('seek');

const curT =
  el('curT');

const durT =
  el('durT');

/* =========================================================
   ROOM STATE
========================================================= */

let currentRoom =
  qs('room') || null;

let role =
  (qs('role') || 'GUEST')
    .toUpperCase();

let name = '';

try {
  name =
    decodeURIComponent(
      qs('name') || 'guest'
    );
} catch (error) {
  name =
    qs('name') || 'guest';
}

let createFlag =
  qs('create') === '1' ||
  qs('create') === 'true';

let isHost =
  role === 'HOST';

/* =========================================================
   INITIAL UI
========================================================= */

if (roomBadge) {
  roomBadge.textContent =
    currentRoom || '—';
}

if (roleBadge) {
  roleBadge.textContent =
    role;
}

/* =========================================================
   PLAYER STATE
========================================================= */

let playlist = [];

let currentIndex = -1;

let ytPlayer = null;

let ytReady = false;

let youtubeApiReady = false;

let waitingForReady = null;

let searchRequestId = 0;

let searchTimer = null;

let searchPlaceholder = null;

/*
   Original search-results location.
*/

let searchOriginalParent = null;

/* =========================================================
   CONSTANTS
========================================================= */

const DRIFT_SEEK_THRESHOLD =
  0.75;

const HEARTBEAT_INTERVAL_MS =
  4000;

/*
   UI timer doesn't need 500ms on mobile.

   750ms gives a noticeably lower repaint rate while keeping
   the progress display smooth enough.
*/

const PLAYER_UI_INTERVAL_MS =
  750;

/* =========================================================
   MOBILE DETECTION
========================================================= */

function isMobileDevice() {
  return (
    window.innerWidth <= 768 ||
    window.matchMedia(
      '(pointer: coarse)'
    ).matches
  );
}

/* =========================================================
   SEARCH RESULT PLACEMENT
========================================================= */

function setupSearchResultPlacement() {
  if (
    !resultsBox ||
    !searchWrapper
  ) {
    return;
  }

  if (!searchPlaceholder) {
    searchOriginalParent =
      resultsBox.parentNode;

    searchPlaceholder =
      document.createComment(
        'BeatSync search results'
      );

    if (searchOriginalParent) {
      searchOriginalParent.insertBefore(
        searchPlaceholder,
        resultsBox
      );
    }
  }

  syncSearchResultPlacement();
}

function syncSearchResultPlacement() {
  if (
    !resultsBox ||
    !searchWrapper ||
    !searchPlaceholder
  ) {
    return;
  }

  const mobile =
    isMobileDevice();

  if (mobile) {
    if (
      !searchWrapper.contains(
        resultsBox
      )
    ) {
      searchWrapper.appendChild(
        resultsBox
      );
    }

    searchWrapper.classList.add(
      'beatsync-mobile-search-host'
    );

    resultsBox.style.position =
      'absolute';

    resultsBox.style.left =
      '0';

    resultsBox.style.right =
      '0';

    resultsBox.style.top =
      'calc(100% + 8px)';

    resultsBox.style.width =
      '100%';

    resultsBox.style.maxHeight =
      '55vh';

    resultsBox.style.overflowY =
      'auto';

    resultsBox.style.zIndex =
      '5000';

    resultsBox.style.webkitOverflowScrolling =
      'touch';

  } else {
    if (
      searchPlaceholder.parentNode
    ) {
      if (
        resultsBox.parentNode !==
        searchPlaceholder.parentNode
      ) {
        searchPlaceholder.parentNode.insertBefore(
          resultsBox,
          searchPlaceholder.nextSibling
        );
      }
    }

    searchWrapper.classList.remove(
      'beatsync-mobile-search-host'
    );

    resultsBox.style.position =
      '';

    resultsBox.style.left =
      '';

    resultsBox.style.right =
      '';

    resultsBox.style.top =
      '';

    resultsBox.style.width =
      '';

    resultsBox.style.maxHeight =
      '';

    resultsBox.style.overflowY =
      '';

    resultsBox.style.zIndex =
      '';

    resultsBox.style.webkitOverflowScrolling =
      '';
  }
}

if (searchWrapper) {
  searchWrapper.style.position =
    'relative';
}

setupSearchResultPlacement();

/* =========================================================
   THROTTLED RESIZE
========================================================= */

let resizeFrame = 0;

window.addEventListener(
  'resize',
  () => {
    if (resizeFrame) {
      return;
    }

    resizeFrame =
      requestAnimationFrame(
        () => {
          resizeFrame = 0;

          syncSearchResultPlacement();
        }
      );
  },
  { passive: true }
);

/* =========================================================
   YOUTUBE PLAYER
========================================================= */

/*
   The iframe is initialized as soon as the YouTube API is
   ready.

   This is important for Android because creating the iframe
   only after a tap can lose the user-gesture playback window.
*/

function createYTPlayer(videoId = '') {
  if (ytPlayer) {
    return;
  }

  if (
    !youtubeApiReady ||
    typeof YT === 'undefined' ||
    !YT.Player
  ) {
    return;
  }

  const config = {
    height: '100%',
    width: '100%',

    playerVars: {
      controls: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1,
      iv_load_policy: 3,
      fs: 1
    },

    events: {
      onReady: (event) => {
        ytReady = true;

        if (waitingForReady) {
          const callback =
            waitingForReady;

          waitingForReady =
            null;

          try {
            callback(event);
          } catch (error) {
            console.error(
              'YouTube ready callback error:',
              error
            );
          }
        }
      },

      onStateChange:
        onPlayerStateChange,

      onError: (event) => {
        console.warn(
          'YouTube error:',
          event?.data
        );
      }
    }
  };

  if (videoId) {
    config.videoId =
      videoId;
  }

  try {
    ytPlayer =
      new YT.Player(
        'ytPlayer',
        config
      );
  } catch (error) {
    console.error(
      'YouTube player creation failed:',
      error
    );

    ytPlayer = null;
    ytReady = false;
  }
}

/* =========================================================
   LOAD VIDEO — GUEST
========================================================= */

function loadForGuest(
  videoId,
  startAt = 0,
  autoplay = false
) {
  if (!videoId) {
    return;
  }

  const performLoad =
    () => {
      if (!ytPlayer) {
        return;
      }

      try {
        ytPlayer.loadVideoById({
          videoId,
          startSeconds:
            Math.max(
              0,
              Number(startAt) || 0
            )
        });

        if (autoplay) {
          ytPlayer.playVideo();
        }
      } catch (error) {
        console.warn(
          'Guest video load error:',
          error
        );
      }
    };

  if (
    !ytReady ||
    !ytPlayer
  ) {
    waitingForReady =
      performLoad;

    if (!ytPlayer) {
      createYTPlayer();
    }

    return;
  }

  performLoad();
}

/* =========================================================
   LOAD VIDEO — HOST
========================================================= */

function hostLoad(
  videoId,
  startAt = 0,
  autoplay = false
) {
  if (!videoId) {
    return;
  }

  const performLoad =
    () => {
      if (!ytPlayer) {
        return;
      }

      try {
        ytPlayer.loadVideoById({
          videoId,
          startSeconds:
            Math.max(
              0,
              Number(startAt) || 0
            )
        });

        /*
           Direct call.

           Do NOT use:
           playVideo().catch(...)
        */

        if (autoplay) {
          ytPlayer.playVideo();
        }

      } catch (error) {
        console.warn(
          'Host video load error:',
          error
        );
      }
    };

  if (
    !ytReady ||
    !ytPlayer
  ) {
    waitingForReady =
      performLoad;

    if (!ytPlayer) {
      createYTPlayer();
    }

    return;
  }

  performLoad();
}

/* =========================================================
   TRACK INFO
========================================================= */

function setTrackInfo(track) {
  if (!track) {
    return;
  }

  if (titleEl) {
    titleEl.textContent =
      track.title ||
      'YouTube video';
  }

  if (artistEl) {
    artistEl.textContent =
      track.channelTitle ||
      track.artist ||
      '';
  }

  if (
    coverEl &&
    track.thumbnail
  ) {
    /*
       Lazy image update.
    */

    if (
      coverEl.src !==
      track.thumbnail
    ) {
      coverEl.src =
        track.thumbnail;
    }
  }
}

/* =========================================================
   PLAYER STATE CHANGE
========================================================= */

function onPlayerStateChange(
  event
) {
  if (!isHost) {
    return;
  }

  if (!ytPlayer) {
    return;
  }

  const state =
    event?.data;

  let currentTime = 0;

  try {
    currentTime =
      ytPlayer.getCurrentTime() ||
      0;
  } catch (error) {
    currentTime = 0;
  }

  if (
    typeof YT !== 'undefined' &&
    state ===
      YT.PlayerState.PLAYING
  ) {
    socket.emit(
      'player:stateChange',
      {
        roomId:
          currentRoom,

        isPlaying:
          true,

        currentTime:
          Math.floor(
            currentTime
          )
      }
    );

    return;
  }

  if (
    typeof YT !== 'undefined' &&
    state ===
      YT.PlayerState.PAUSED
  ) {
    socket.emit(
      'player:stateChange',
      {
        roomId:
          currentRoom,

        isPlaying:
          false,

        currentTime:
          Math.floor(
            currentTime
          )
      }
    );

    return;
  }

  if (
    typeof YT !== 'undefined' &&
    state ===
      YT.PlayerState.ENDED
  ) {
    socket.emit(
      'player:stateChange',
      {
        roomId:
          currentRoom,

        isPlaying:
          false,

        currentTime:
          Math.floor(
            currentTime
          )
      }
    );

    /*
       Playlist auto-next.
    */

    if (
      playlist.length > 0 &&
      currentIndex >= 0 &&
      currentIndex <
        playlist.length - 1
    ) {
      currentIndex++;

      const nextTrack =
        playlist[
          currentIndex
        ];

      if (nextTrack) {
        hostLoad(
          nextTrack.id,
          0,
          true
        );

        setTrackInfo(
          nextTrack
        );

        socket.emit(
          'player:setTrack',
          {
            roomId:
              currentRoom,

            track: {
              type:
                'youtube',

              id:
                nextTrack.id
            }
          }
        );

        renderPlaylist();
      }
    }
  }
}

/* =========================================================
   PLAYER UI TIMER
========================================================= */

/*
   Reduced from 500ms to 750ms to lower mobile repaint cost.
*/

setInterval(
  () => {
    if (
      !ytPlayer ||
      !ytReady
    ) {
      return;
    }

    try {
      const duration =
        ytPlayer.getDuration() ||
        0;

      const current =
        ytPlayer.getCurrentTime() ||
        0;

      if (!duration) {
        return;
      }

      if (seek) {
        seek.value =
          String(
            Math.floor(
              (
                current /
                duration
              ) * 100
            )
          );
      }

      if (curT) {
        curT.textContent =
          niceTime(
            current
          );
      }

      if (durT) {
        durT.textContent =
          niceTime(
            duration
          );
      }

    } catch (error) {
      /*
         Ignore transient iframe errors.
      */
    }
  },
  PLAYER_UI_INTERVAL_MS
);

/* =========================================================
   PLAYLIST
========================================================= */

function renderPlaylist() {
  if (!playlistBox) {
    return;
  }

  if (!playlist.length) {
    playlistBox.innerHTML =
      `
        <div
          class="
            text-slate-500
            text-sm
            text-center
            py-4
          "
        >
          Playlist is empty
        </div>
      `;

    return;
  }

  /*
     Build once instead of repeatedly manipulating individual
     DOM nodes.
  */

  const html =
    playlist
      .map(
        (track, index) => {
          const active =
            index === currentIndex
              ? 'ring-2 ring-indigo-500'
              : '';

          return `
            <div
              class="
                beatsync-playlist-item
                p-2
                rounded-md
                bg-slate-800
                flex
                items-center
                justify-between
                gap-3
                ${active}
              "
              data-index="${index}"
            >

              <div
                class="
                  min-w-0
                  flex-1
                "
              >

                <div
                  class="
                    font-semibold
                    text-sm
                    truncate
                  "
                >
                  ${escapeHtml(
                    track.title
                  )}
                </div>

                <div
                  class="
                    text-xs
                    text-slate-400
                    truncate
                  "
                >
                  ${escapeHtml(
                    track.channelTitle ||
                    ''
                  )}
                </div>

              </div>

              <div
                class="
                  flex
                  items-center
                  gap-2
                  shrink-0
                "
              >

                <button
                  type="button"
                  class="
                    smallPlay
                    px-2
                    py-1
                    rounded-md
                    bg-emerald-500
                    text-xs
                  "
                  data-i="${index}"
                >
                  ▶
                </button>

                <button
                  type="button"
                  class="
                    smallRem
                    px-2
                    py-1
                    rounded-md
                    bg-red-600
                    text-xs
                  "
                  data-i="${index}"
                >
                  ✕
                </button>

              </div>

            </div>
          `;
        }
      )
      .join('');

  playlistBox.innerHTML =
    html;
}

/* =========================================================
   PLAYLIST EVENTS
========================================================= */

if (playlistBox) {
  playlistBox.addEventListener(
    'click',
    (event) => {
      const playButton =
        event.target.closest(
          '.smallPlay'
        );

      const removeButton =
        event.target.closest(
          '.smallRem'
        );

      if (playButton) {
        const index =
          Number(
            playButton.dataset.i
          );

        if (!isHost) {
          alert(
            'Only the host can control playback.'
          );

          return;
        }

        if (
          !Number.isInteger(
            index
          ) ||
          !playlist[index]
        ) {
          return;
        }

        currentIndex =
          index;

        const track =
          playlist[
            currentIndex
          ];

        hostLoad(
          track.id,
          0,
          true
        );

        setTrackInfo(
          track
        );

        socket.emit(
          'player:setTrack',
          {
            roomId:
              currentRoom,

            track: {
              type:
                'youtube',

              id:
                track.id
            }
          }
        );

        renderPlaylist();

        return;
      }

      if (removeButton) {
        const index =
          Number(
            removeButton.dataset.i
          );

        if (
          !Number.isInteger(
            index
          ) ||
          !playlist[index]
        ) {
          return;
        }

        const removingCurrent =
          index ===
          currentIndex;

        playlist.splice(
          index,
          1
        );

        if (removingCurrent) {
          currentIndex =
            -1;

          if (
            ytPlayer &&
            ytReady &&
            isHost
          ) {
            try {
              ytPlayer.stopVideo();
            } catch (error) {
              /* ignore */
            }
          }

        } else if (
          index <
          currentIndex
        ) {
          currentIndex--;
        }

        renderPlaylist();
      }
    }
  );
}

/* =========================================================
   SEARCH
========================================================= */

function clearSearch() {
  if (resultsBox) {
    resultsBox.innerHTML =
      '';
  }

  if (searchPro) {
    searchPro.value =
      '';
  }

  /*
     Invalidate an active search.
  */

  searchRequestId++;

  syncSearchResultPlacement();
}

async function doSearch() {
  const query =
    (
      searchPro?.value ||
      ''
    ).trim();

  if (!query) {
    clearSearch();
    return;
  }

  const requestId =
    ++searchRequestId;

  if (resultsBox) {
    resultsBox.innerHTML =
      `
        <div
          class="
            text-slate-400
            text-sm
            text-center
            py-4
          "
        >
          Searching…
        </div>
      `;
  }

  syncSearchResultPlacement();

  try {
    const response =
      await fetch(
        `/api/yt/search?q=${encodeURIComponent(
          query
        )}&limit=12`,
        {
          method: 'GET',
          cache: 'no-store',
          headers: {
            Accept:
              'application/json'
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
        'Search request failed'
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

    const items =
      Array.isArray(data)
        ? data
        : Array.isArray(
            data.results
          )
          ? data.results
          : [];

    if (!items.length) {
      if (resultsBox) {
        resultsBox.innerHTML =
          `
            <div
              class="
                text-slate-400
                text-sm
                text-center
                py-4
              "
            >
              No results found
            </div>
          `;
      }

      syncSearchResultPlacement();

      return;
    }

    if (!resultsBox) {
      return;
    }

    /*
       Keep result markup lightweight.
    */

    resultsBox.innerHTML =
      items
        .map(
          (item, index) => {
            const videoId =
              item.videoId ||
              item.id ||
              '';

            const title =
              item.title ||
              'YouTube video';

            const channel =
              item.channelTitle ||
              item.channel ||
              '';

            const thumbnail =
              item.thumbnail ||
              item.thumbnailUrl ||
              (
                videoId
                  ? `https://i.ytimg.com/vi/${encodeURIComponent(
                      videoId
                    )}/mqdefault.jpg`
                  : ''
              );

            return `
              <div
                class="
                  beatsync-search-result
                  p-2
                  rounded-md
                  bg-slate-800
                  flex
                  items-center
                  justify-between
                  gap-3
                  mb-2
                "
                data-video-id="${escapeHtml(
                  videoId
                )}"
              >

                <button
                  type="button"
                  class="
                    search-result-main
                    flex
                    items-center
                    gap-3
                    min-w-0
                    flex-1
                    text-left
                  "
                  data-video-id="${escapeHtml(
                    videoId
                  )}"
                >

                  ${
                    thumbnail
                      ? `
                        <img
                          src="${escapeHtml(
                            thumbnail
                          )}"
                          width="64"
                          height="36"
                          loading="lazy"
                          decoding="async"
                          class="
                            w-16
                            h-9
                            rounded-md
                            object-cover
                            shrink-0
                          "
                          alt=""
                        >
                      `
                      : ''
                  }

                  <span
                    class="
                      min-w-0
                      overflow-hidden
                    "
                  >

                    <span
                      class="
                        block
                        font-semibold
                        text-sm
                        truncate
                      "
                    >
                      ${escapeHtml(
                        title
                      )}
                    </span>

                    <span
                      class="
                        block
                        text-xs
                        text-slate-400
                        truncate
                        mt-0.5
                      "
                    >
                      ${escapeHtml(
                        channel
                      )}
                    </span>

                  </span>

                </button>

                <div
                  class="
                    flex
                    items-center
                    gap-2
                    shrink-0
                  "
                >

                  <button
                    type="button"
                    class="
                      addBtn
                      w-9
                      h-9
                      rounded-full
                      bg-emerald-500
                      text-white
                      flex
                      items-center
                      justify-center
                      text-lg
                    "
                    data-id="${escapeHtml(
                      videoId
                    )}"
                    data-title="${escapeHtml(
                      title
                    )}"
                    data-channel="${escapeHtml(
                      channel
                    )}"
                    data-thumbnail="${escapeHtml(
                      thumbnail
                    )}"
                  >
                    +
                  </button>

                  <button
                    type="button"
                    class="
                      playNow
                      w-9
                      h-9
                      rounded-full
                      bg-slate-700
                      text-white
                      flex
                      items-center
                      justify-center
                    "
                    data-id="${escapeHtml(
                      videoId
                    )}"
                    data-title="${escapeHtml(
                      title
                    )}"
                    data-channel="${escapeHtml(
                      channel
                    )}"
                    data-thumbnail="${escapeHtml(
                      thumbnail
                    )}"
                  >
                    ▶
                  </button>

                </div>

              </div>
            `;
          }
        )
        .join('');

    syncSearchResultPlacement();

  } catch (error) {
    console.error(
      'BeatSync search error:',
      error
    );

    if (
      requestId !==
      searchRequestId
    ) {
      return;
    }

    if (resultsBox) {
      resultsBox.innerHTML =
        `
          <div
            class="
              text-red-400
              text-sm
              text-center
              py-4
            "
          >
            Search failed. Please try again.
          </div>
        `;
    }

    syncSearchResultPlacement();
  }
}

/* =========================================================
   SEARCH BUTTON
========================================================= */

if (btnSearch) {
  btnSearch.addEventListener(
    'click',
    (event) => {
      event.preventDefault();

      doSearch();
    }
  );
}

/* =========================================================
   SEARCH INPUT
========================================================= */

if (searchPro) {
  searchPro.setAttribute(
    'autocomplete',
    'off'
  );

  searchPro.setAttribute(
    'autocorrect',
    'off'
  );

  searchPro.setAttribute(
    'autocapitalize',
    'none'
  );

  searchPro.setAttribute(
    'spellcheck',
    'false'
  );

  searchPro.setAttribute(
    'enterkeyhint',
    'search'
  );

  searchPro.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Enter' ||
        event.keyCode === 13
      ) {
        event.preventDefault();

        clearTimeout(
          searchTimer
        );

        doSearch();
      }
    }
  );

  /*
     Lightweight realtime search.

     Waits 400ms after typing stops.
  */

  searchPro.addEventListener(
    'input',
    () => {
      clearTimeout(
        searchTimer
      );

      const query =
        searchPro.value.trim();

      if (
        query.length < 2
      ) {
        if (resultsBox) {
          resultsBox.innerHTML =
            '';
        }

        return;
      }

      searchTimer =
        setTimeout(
          () => {
            doSearch();
          },
          400
        );
    },
    { passive: true }
  );
}

/* =========================================================
   ADD TO PLAYLIST
========================================================= */

function addToPlaylist(item) {
  if (
    !item ||
    !item.id
  ) {
    return;
  }

  /*
     Prevent accidental duplicate entries.
  */

  const duplicate =
    playlist.some(
      (track) =>
        track.id ===
        item.id
    );

  if (!duplicate) {
    playlist.push({
      id:
        item.id,

      title:
        item.title ||
        'YouTube video',

      channelTitle:
        item.channelTitle ||
        '',

      thumbnail:
        item.thumbnail ||
        ''
    });
  }

  renderPlaylist();

  clearSearch();

  /*
     First playlist song starts automatically.
  */

  if (
    currentIndex === -1 &&
    isHost
  ) {
    currentIndex =
      playlist.length - 1;

    const track =
      playlist[
        currentIndex
      ];

    hostLoad(
      track.id,
      0,
      true
    );

    setTrackInfo(
      track
    );

    socket.emit(
      'player:setTrack',
      {
        roomId:
          currentRoom,

        track: {
          type:
            'youtube',

          id:
            track.id
        }
      }
    );

    renderPlaylist();
  }
}

/* =========================================================
   SEARCH RESULT EVENTS
========================================================= */

if (resultsBox) {
  resultsBox.addEventListener(
    'click',
    (event) => {
      const addButton =
        event.target.closest(
          '.addBtn'
        );

      const playButton =
        event.target.closest(
          '.playNow'
        );

      const mainButton =
        event.target.closest(
          '.search-result-main'
        );

      /*
         ADD
      */

      if (addButton) {
        event.preventDefault();
        event.stopPropagation();

        addToPlaylist({
          id:
            addButton.dataset.id,

          title:
            addButton.dataset.title,

          channelTitle:
            addButton.dataset.channel,

          thumbnail:
            addButton.dataset.thumbnail
        });

        return;
      }

      /*
         PLAY BUTTON
      */

      if (playButton) {
        event.preventDefault();
        event.stopPropagation();

        playSearchResult(
          playButton.dataset.id,
          playButton.dataset.title,
          playButton.dataset.channel,
          playButton.dataset.thumbnail
        );

        return;
      }

      /*
         CLICK RESULT
      */

      if (mainButton) {
        event.preventDefault();

        playSearchResult(
          mainButton.dataset.videoId,
          '',
          '',
          ''
        );
      }
    }
  );
}

/* =========================================================
   PLAY SEARCH RESULT
========================================================= */

function playSearchResult(
  videoId,
  title = '',
  channelTitle = '',
  thumbnail = ''
) {
  if (!videoId) {
    return;
  }

  if (!isHost) {
    alert(
      'Only the host can start playback.'
    );

    return;
  }

  const track = {
    id:
      videoId,

    title:
      title ||
      'YouTube video',

    channelTitle:
      channelTitle ||
      '',

    thumbnail:
      thumbnail ||
      ''
  };

  /*
     Search result playback is not automatically added to
     playlist.
  */

  currentIndex =
    -1;

  /*
     Direct user action -> YouTube playback.
  */

  hostLoad(
    videoId,
    0,
    true
  );

  setTrackInfo(
    track
  );

  socket.emit(
    'player:setTrack',
    {
      roomId:
        currentRoom,

      track: {
        type:
          'youtube',

        id:
          videoId
      }
    }
  );

  clearSearch();

  renderPlaylist();
}

/* =========================================================
   SOCKET — ONLINE STATS
========================================================= */

socket.on(
  'stats:update',
  ({ online } = {}) => {
    if (!onlineCount) {
      return;
    }

    onlineCount.textContent =
      `${Number(online) || 0} online`;
  }
);

/* =========================================================
   SOCKET — TRACK CHANGED
========================================================= */

socket.on(
  'player:trackChanged',
  ({
    track,
    currentTime,
    isPlaying
  } = {}) => {
    if (!track) {
      return;
    }

    if (
      track.type ===
        'youtube' &&
      track.id
    ) {
      loadForGuest(
        track.id,
        currentTime || 0,
        !!isPlaying
      );

      setTrackInfo({
        id:
          track.id,

        title:
          track.title ||
          'YouTube video',

        channelTitle:
          track.channelTitle ||
          '',

        thumbnail:
          track.thumbnail ||
          ''
      });
    }
  }
);

/* =========================================================
   SOCKET — PLAYBACK SYNC
========================================================= */

socket.on(
  'player:sync',
  ({
    isPlaying,
    currentTime,
    ts
  } = {}) => {
    if (isHost) {
      return;
    }

    if (
      !ytReady ||
      !ytPlayer
    ) {
      return;
    }

    try {
      const now =
        Date.now();

      const timestamp =
        Number(ts) ||
        now;

      const elapsed =
        Math.max(
          0,
          now -
            timestamp
        );

      const targetTime =
        (
          Number(
            currentTime
          ) || 0
        ) +
        elapsed / 1000;

      const localTime =
        ytPlayer.getCurrentTime() ||
        0;

      const difference =
        Math.abs(
          localTime -
          targetTime
        );

      if (
        difference >
        DRIFT_SEEK_THRESHOLD
      ) {
        ytPlayer.seekTo(
          Math.max(
            0,
            targetTime
          ),
          true
        );
      }

      if (isPlaying) {
        ytPlayer.playVideo();
      } else {
        ytPlayer.pauseVideo();
      }

    } catch (error) {
      console.warn(
        'Sync error:',
        error
      );
    }
  }
);

/* =========================================================
   CHAT
========================================================= */

function sendChat() {
  const text =
    (
      msgInput?.value ||
      ''
    ).trim();

  if (
    !text ||
    !currentRoom
  ) {
    return;
  }

  socket.emit(
    'chat:send',
    {
      roomId:
        currentRoom,

      userName:
        name ||
        'guest',

      text
    },
    (response) => {
      if (
        response &&
        response.ok
      ) {
        if (msgInput) {
          msgInput.value =
            '';

          msgInput.focus();
        }
      } else {
        alert(
          'Message could not be sent.'
        );
      }
    }
  );
}

if (btnSend) {
  btnSend.addEventListener(
    'click',
    (event) => {
      event.preventDefault();

      sendChat();
    }
  );
}

if (msgInput) {
  msgInput.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Enter' &&
        !event.shiftKey
      ) {
        event.preventDefault();

        sendChat();
      }
    }
  );
}

/* =========================================================
   CHAT NEW MESSAGE
========================================================= */

socket.on(
  'chat:new',
  (message) => {
    if (
      !message ||
      message.roomId !==
        currentRoom
    ) {
      return;
    }

    if (
      !Array.isArray(
        window._chat
      )
    ) {
      window._chat = [];
    }

    window._chat.push(
      message
    );

    /*
       Limit in-memory chat history so an extremely long room
       does not keep growing indefinitely on the client.
    */

    if (
      window._chat.length >
      300
    ) {
      window._chat =
        window._chat.slice(
          -300
        );
    }

    renderChat(
      window._chat
    );
  }
);

/* =========================================================
   CHAT RENDER
========================================================= */

function renderChat(
  messages
) {
  if (!chatWindow) {
    return;
  }

  const list =
    Array.isArray(messages)
      ? messages
      : [];

  /*
     Single innerHTML operation.
  */

  chatWindow.innerHTML =
    list
      .map(
        (message) => {
          const date =
            new Date(
              message.ts ||
              Date.now()
            );

          const hours =
            String(
              date.getHours()
            ).padStart(
              2,
              '0'
            );

          const minutes =
            String(
              date.getMinutes()
            ).padStart(
              2,
              '0'
            );

          const sender =
            String(
              message.userName ||
              ''
            ).trim();

          const currentUser =
            String(
              name ||
              ''
            ).trim();

          const isMe =
            sender ===
            currentUser;

          if (isMe) {
            return `
              <div
                class="
                  flex
                  justify-end
                  mb-2
                "
              >

                <div
                  class="
                    chat-bubble
                    chat-right
                    max-w-[82%]
                  "
                >

                  <div>
                    ${escapeHtml(
                      message.text
                    )}
                  </div>

                  <div
                    class="
                      text-[10px]
                      text-white/80
                      mt-1
                      text-right
                    "
                  >
                    ${hours}:${minutes}
                  </div>

                </div>

              </div>
            `;
          }

          return `
            <div
              class="
                flex
                justify-start
                mb-2
              "
            >

              <div
                class="
                  chat-bubble
                  chat-left
                  max-w-[82%]
                "
              >

                <div
                  class="
                    font-semibold
                    text-xs
                  "
                >
                  ${escapeHtml(
                    sender
                  )}
                </div>

                <div>
                  ${escapeHtml(
                    message.text
                  )}
                </div>

                <div
                  class="
                    text-[10px]
                    text-slate-400
                    mt-1
                  "
                >
                  ${hours}:${minutes}
                </div>

              </div>

            </div>
          `;
        }
      )
      .join('');

  /*
     Scroll only once after rendering.
  */

  chatWindow.scrollTop =
    chatWindow.scrollHeight;
}

/* =========================================================
   SHOW MUSIC
========================================================= */

function showMusic() {
  if (chatFull) {
    chatFull.classList.add(
      'hidden'
    );
  }

  if (musicSection) {
    musicSection.classList.remove(
      'hidden'
    );
  }

  if (mainGrid) {
    mainGrid.classList.remove(
      'hidden'
    );
  }

  if (musicTabBtn) {
    musicTabBtn.classList.add(
      'bg-slate-800'
    );
  }

  if (chatTabBtn) {
    chatTabBtn.classList.remove(
      'bg-slate-800'
    );
  }

  if (searchWrapper) {
    searchWrapper.style.display =
      'block';
  }

  syncSearchResultPlacement();

  if (
    !Array.isArray(
      window._chat
    )
  ) {
    window._chat = [];
  }
}

/* =========================================================
   SHOW CHAT
========================================================= */

function showChat() {
  if (musicSection) {
    musicSection.classList.add(
      'hidden'
    );
  }

  /*
     For layouts where mainGrid is the music container.
  */

  if (
    mainGrid &&
    !el('musicSection')
  ) {
    mainGrid.classList.add(
      'hidden'
    );
  }

  if (chatFull) {
    chatFull.classList.remove(
      'hidden'
    );
  }

  if (chatTabBtn) {
    chatTabBtn.classList.add(
      'bg-slate-800'
    );
  }

  if (musicTabBtn) {
    musicTabBtn.classList.remove(
      'bg-slate-800'
    );
  }

  if (searchWrapper) {
    searchWrapper.style.display =
      'none';
  }

  if (
    !Array.isArray(
      window._chat
    )
  ) {
    window._chat = [];
  }

  renderChat(
    window._chat
  );
}

/* =========================================================
   TABS
========================================================= */

if (musicTabBtn) {
  musicTabBtn.addEventListener(
    'click',
    showMusic
  );
}

if (chatTabBtn) {
  chatTabBtn.addEventListener(
    'click',
    showChat
  );
}

/* =========================================================
   LEAVE
========================================================= */

if (btnLeave) {
  btnLeave.addEventListener(
    'click',
    () => {
      window.location.href =
        '/join.html';
    }
  );
}

/* =========================================================
   HOST HEARTBEAT
========================================================= */

setInterval(
  () => {
    if (
      !isHost ||
      !ytReady ||
      !ytPlayer ||
      !currentRoom
    ) {
      return;
    }

    try {
      const currentTime =
        Math.floor(
          ytPlayer.getCurrentTime() ||
          0
        );

      const playerState =
        ytPlayer.getPlayerState();

      const isPlaying =
        typeof YT !== 'undefined' &&
        playerState ===
          YT.PlayerState.PLAYING;

      socket.emit(
        'player:stateChange',
        {
          roomId:
            currentRoom,

          isPlaying,

          currentTime
        }
      );

    } catch (error) {
      /*
         Ignore transient iframe errors.
      */
    }
  },
  HEARTBEAT_INTERVAL_MS
);

/* =========================================================
   SOCKET CONNECT
========================================================= */

socket.on(
  'connect',
  () => {

    /*
       CREATE ROOM
    */

    if (createFlag) {
      socket.emit(
        'room:create',
        (response) => {
          if (
            !response ||
            !response.ok
          ) {
            alert(
              'Failed to create room.'
            );

            return;
          }

          currentRoom =
            response.roomId;

          role =
            'HOST';

          isHost =
            true;

          if (roomBadge) {
            roomBadge.textContent =
              currentRoom;
          }

          if (roleBadge) {
            roleBadge.textContent =
              'HOST';
          }

          const newUrl =
            `${location.pathname}` +
            `?room=${encodeURIComponent(
              currentRoom
            )}` +
            `&role=HOST` +
            `&name=${encodeURIComponent(
              name || 'guest'
            )}`;

          history.replaceState(
            {},
            '',
            newUrl
          );

          if (
            youtubeApiReady &&
            !ytPlayer
          ) {
            createYTPlayer();
          }
        }
      );

      return;
    }

    /*
       JOIN ROOM
    */

    if (!currentRoom) {
      alert(
        'No room specified. Please go back and join a room.'
      );

      return;
    }

    socket.emit(
      'room:join',
      {
        roomId:
          currentRoom
      },
      async (response) => {
        if (
          !response ||
          !response.ok
        ) {
          alert(
            'Failed to join room: ' +
            (
              response?.error ||
              'unknown error'
            )
          );

          return;
        }

        /*
           Restore current track.
        */

        if (
          response.state &&
          response.state.currentTrack
        ) {
          const track =
            response.state.currentTrack;

          if (
            track.type ===
              'youtube' &&
            track.id
          ) {
            loadForGuest(
              track.id,
              response.state.currentTime ||
                0,
              !!response.state.isPlaying
            );
          }
        }

        /*
           Restore chat.
        */

        if (
          Array.isArray(
            response.chat
          )
        ) {
          window._chat =
            response.chat.slice();

        } else {
          try {
            const chatResponse =
              await fetch(
                `/api/room-chat?room=${encodeURIComponent(
                  currentRoom
                )}`,
                {
                  cache:
                    'no-store'
                }
              );

            if (
              chatResponse.ok
            ) {
              const chatData =
                await chatResponse.json();

              window._chat =
                Array.isArray(
                  chatData.chat
                )
                  ? chatData.chat.slice()
                  : [];

            } else {
              window._chat =
                [];
            }

          } catch (error) {
            console.warn(
              'Chat restore failed:',
              error
            );

            window._chat =
              [];
          }
        }

        renderChat(
          window._chat ||
            []
        );
      }
    );
  }
);

/* =========================================================
   YOUTUBE API READY
========================================================= */

window.onYouTubeIframeAPIReady =
  function () {
    youtubeApiReady =
      true;

    console.log(
      'BeatSync: YouTube API ready'
    );

    if (!ytPlayer) {
      createYTPlayer();
    }
  };

/*
   Fallback if the API is already available.
*/

if (
  typeof YT !== 'undefined' &&
  YT.Player
) {
  youtubeApiReady =
    true;

  if (!ytPlayer) {
    createYTPlayer();
  }
}

/* =========================================================
   INITIAL STATE
========================================================= */

if (
  chatFull &&
  !chatFull.classList.contains(
    'hidden'
  )
) {
  /*
     Respect existing HTML state.
  */
} else {
  showMusic();
}

renderPlaylist();

syncSearchResultPlacement();

/* =========================================================
   FINAL PERFORMANCE SETTINGS
========================================================= */

/*
   Prevent browser from attempting to preserve an old scroll
   position when navigating back into the player.
*/

if ('scrollRestoration' in history) {
  try {
    history.scrollRestoration =
      'manual';
  } catch (error) {
    /* ignore */
  }
}

/*
   Hint browser that this page should not horizontally scroll.
*/

document.documentElement.style.overflowX =
  'hidden';

if (document.body) {
  document.body.style.overflowX =
    'hidden';
}

console.log(
  'BeatSync player.js — mobile optimized loaded.'
);