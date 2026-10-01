/* =========================================================
   BeatSync — player.js
   Complete production replacement
   ========================================================= */

const socket = io();

/* ---------------------------------------------------------
   Helpers
--------------------------------------------------------- */

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

  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

/* ---------------------------------------------------------
   DOM
--------------------------------------------------------- */

const roomBadge = el('roomBadge');
const roleBadge = el('roleBadge');
const onlineCount = el('onlineCount');
const btnLeave = el('btnLeave');

const searchWrapper = el('searchWrapper');
const searchPro = el('searchPro');
const btnSearch = el('btnSearch');
const resultsBox = el('resultsBox');

const musicSection =
  el('musicSection') ||
  el('mainGrid') ||
  document.querySelector('.music-column');

const mainGrid = el('mainGrid');

const chatFull = el('chatFull');
const chatWindow = el('chatWindow');

const msgInput = el('msgInput');
const btnSend = el('btnSend');

const musicTabBtn = el('musicTabBtn');
const chatTabBtn = el('chatTabBtn');

const playlistBox = el('playlistBox');

const playBig = el('playBig');
const prevBtn = el('prev');
const nextBtn = el('next');

const titleEl = el('title');
const artistEl = el('artist');
const coverEl = el('cover');

const seek = el('seek');
const curT = el('curT');
const durT = el('durT');

/* ---------------------------------------------------------
   URL / ROOM STATE
--------------------------------------------------------- */

let currentRoom = qs('room') || null;

let role = (qs('role') || 'GUEST').toUpperCase();

let name = '';

try {
  name = decodeURIComponent(qs('name') || 'guest');
} catch (e) {
  name = qs('name') || 'guest';
}

let createFlag =
  qs('create') === '1' ||
  qs('create') === 'true';

let isHost = role === 'HOST';

/* ---------------------------------------------------------
   Initial UI
--------------------------------------------------------- */

if (roomBadge) {
  roomBadge.textContent = currentRoom || '—';
}

if (roleBadge) {
  roleBadge.textContent = role;
}

/* ---------------------------------------------------------
   Player State
--------------------------------------------------------- */

let playlist = [];

let currentIndex = -1;

let ytPlayer = null;

let ytReady = false;

let waitingForReady = null;

let youtubeApiReady = false;

let searchRequestId = 0;

let searchTimer = null;

let searchOriginalParent = null;

let searchOriginalNextSibling = null;

let searchPlaceholder = null;

/*
   Drift threshold in seconds.

   Small differences are ignored.
   Larger differences are corrected.
*/
const DRIFT_SEEK_THRESHOLD = 0.6;

/*
   Host periodically sends the current playback state.
*/
const HEARTBEAT_INTERVAL_MS = 4000;

/* ---------------------------------------------------------
   Mobile Search Result Placement
--------------------------------------------------------- */

/*
   The existing HTML places #resultsBox outside #searchWrapper.

   On mobile we temporarily move it inside #searchWrapper so
   the results can appear directly underneath the search bar.

   On desktop we restore it to its original location.
*/

function setupSearchResultPlacement() {
  if (!resultsBox || !searchWrapper) return;

  if (!searchPlaceholder) {
    searchOriginalParent = resultsBox.parentNode;
    searchOriginalNextSibling = resultsBox.nextSibling;

    searchPlaceholder = document.createComment(
      'BeatSync search results placeholder'
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
  if (!resultsBox || !searchWrapper || !searchPlaceholder) {
    return;
  }

  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    if (!searchWrapper.contains(resultsBox)) {
      searchWrapper.appendChild(resultsBox);
    }

    searchWrapper.classList.add('beatsync-mobile-search-host');

    resultsBox.style.position = 'absolute';
    resultsBox.style.left = '0';
    resultsBox.style.right = '0';
    resultsBox.style.top = 'calc(100% + 8px)';
    resultsBox.style.width = '100%';
    resultsBox.style.maxHeight = '58vh';
    resultsBox.style.overflowY = 'auto';
    resultsBox.style.zIndex = '5000';
    resultsBox.style.webkitOverflowScrolling = 'touch';
  } else {
    if (!searchPlaceholder.parentNode) {
      return;
    }

    if (resultsBox.parentNode !== searchPlaceholder.parentNode) {
      searchPlaceholder.parentNode.insertBefore(
        resultsBox,
        searchPlaceholder.nextSibling
      );
    }

    searchWrapper.classList.remove('beatsync-mobile-search-host');

    resultsBox.style.position = '';
    resultsBox.style.left = '';
    resultsBox.style.right = '';
    resultsBox.style.top = '';
    resultsBox.style.width = '';
    resultsBox.style.maxHeight = '';
    resultsBox.style.overflowY = '';
    resultsBox.style.zIndex = '';
    resultsBox.style.webkitOverflowScrolling = '';
  }
}

if (searchWrapper) {
  searchWrapper.style.position = 'relative';
}

setupSearchResultPlacement();

window.addEventListener(
  'resize',
  syncSearchResultPlacement,
  { passive: true }
);

/* ---------------------------------------------------------
   Mobile Search Styling
--------------------------------------------------------- */

(function injectMobileSearchStyles() {
  const style = document.createElement('style');

  style.id = 'beatsync-mobile-search-styles';

  style.textContent = `
    #searchWrapper.beatsync-mobile-search-host {
      position: relative !important;
      z-index: 5000 !important;
    }

    #searchWrapper.beatsync-mobile-search-host #resultsBox {
      background: rgba(15, 23, 42, 0.97);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 16px;
      padding: 8px;
      box-shadow:
        0 18px 45px rgba(0,0,0,0.45),
        0 0 0 1px rgba(255,255,255,0.03);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    #searchWrapper.beatsync-mobile-search-host #resultsBox > * {
      touch-action: manipulation;
    }

    #searchWrapper.beatsync-mobile-search-host #resultsBox button {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    #searchWrapper.beatsync-mobile-search-host .beatsync-search-result {
      min-height: 64px;
    }

    @media (max-width: 768px) {
      #searchWrapper {
        position: relative !important;
        z-index: 5000 !important;
      }
    }
  `;

  document.head.appendChild(style);
})();

/* ---------------------------------------------------------
   YouTube Player
--------------------------------------------------------- */

/*
   Important Android fix:

   We initialize the YouTube iframe as soon as the YouTube API
   becomes ready instead of waiting until a song is selected.

   This prevents the first user tap from being lost because
   the iframe itself was still being created.
*/

function createYTPlayer(videoId = '') {
  if (ytPlayer) {
    return;
  }

  if (!youtubeApiReady || typeof YT === 'undefined' || !YT.Player) {
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
          const callback = waitingForReady;

          waitingForReady = null;

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

      onStateChange: onPlayerStateChange,

      onError: (event) => {
        console.warn(
          'YouTube player error:',
          event && event.data
        );
      }
    }
  };

  /*
     Only provide videoId when one actually exists.

     This lets the iframe initialize before the first Android
     playback gesture.
  */
  if (videoId) {
    config.videoId = videoId;
  }

  try {
    ytPlayer = new YT.Player(
      'ytPlayer',
      config
    );
  } catch (error) {
    console.error(
      'Unable to create YouTube player:',
      error
    );

    ytPlayer = null;
    ytReady = false;
  }
}

/* ---------------------------------------------------------
   Load Video For Guest
--------------------------------------------------------- */

function loadForGuest(
  videoId,
  startAt = 0,
  autoplay = false
) {
  if (!videoId) return;

  const performLoad = () => {
    if (!ytPlayer) return;

    try {
      ytPlayer.loadVideoById({
        videoId: videoId,
        startSeconds: Math.max(
          0,
          Number(startAt) || 0
        )
      });

      /*
         Do not use .catch() here.

         YouTube IFrame API playVideo() does not return a
         Promise, so .catch() causes errors on mobile browsers.
      */
      if (autoplay) {
        ytPlayer.playVideo();
      }
    } catch (error) {
      console.warn(
        'Guest video load failed:',
        error
      );
    }
  };

  if (!ytReady || !ytPlayer) {
    waitingForReady = performLoad;

    if (!ytPlayer) {
      createYTPlayer();
    }

    return;
  }

  performLoad();
}

/* ---------------------------------------------------------
   Load Video For Host
--------------------------------------------------------- */

function hostLoad(
  videoId,
  startAt = 0,
  autoplay = false
) {
  if (!videoId) return;

  const performLoad = () => {
    if (!ytPlayer) return;

    try {
      ytPlayer.loadVideoById({
        videoId: videoId,
        startSeconds: Math.max(
          0,
          Number(startAt) || 0
        )
      });

      /*
         Calling playVideo() directly here is important for
         mobile playback when this function originates from
         the user's tap/click.
      */
      if (autoplay) {
        ytPlayer.playVideo();
      }
    } catch (error) {
      console.warn(
        'Host video load failed:',
        error
      );
    }
  };

  if (!ytReady || !ytPlayer) {
    waitingForReady = performLoad;

    if (!ytPlayer) {
      createYTPlayer();
    }

    return;
  }

  performLoad();
}

/* ---------------------------------------------------------
   Update Track Information
--------------------------------------------------------- */

function setTrackInfo(track) {
  if (!track) return;

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

  if (coverEl && track.thumbnail) {
    coverEl.src = track.thumbnail;
  }
}

/* ---------------------------------------------------------
   Host Player State
--------------------------------------------------------- */

function onPlayerStateChange(event) {
  const state = event && event.data;

  /*
     Only host controls the shared room state.
  */
  if (!isHost) return;

  if (!ytPlayer) return;

  let currentTime = 0;

  try {
    currentTime =
      ytPlayer.getCurrentTime() || 0;
  } catch (error) {
    currentTime = 0;
  }

  /*
     PLAYING
  */

  if (
    typeof YT !== 'undefined' &&
    state === YT.PlayerState.PLAYING
  ) {
    socket.emit(
      'player:stateChange',
      {
        roomId: currentRoom,
        isPlaying: true,
        currentTime: Math.floor(currentTime)
      }
    );

    return;
  }

  /*
     PAUSED
  */

  if (
    typeof YT !== 'undefined' &&
    state === YT.PlayerState.PAUSED
  ) {
    socket.emit(
      'player:stateChange',
      {
        roomId: currentRoom,
        isPlaying: false,
        currentTime: Math.floor(currentTime)
      }
    );

    return;
  }

  /*
     ENDED

     Automatically move to the next playlist item.
  */

  if (
    typeof YT !== 'undefined' &&
    state === YT.PlayerState.ENDED
  ) {
    socket.emit(
      'player:stateChange',
      {
        roomId: currentRoom,
        isPlaying: false,
        currentTime: Math.floor(currentTime)
      }
    );

    if (
      playlist.length > 0 &&
      currentIndex >= 0 &&
      currentIndex < playlist.length - 1
    ) {
      const nextIndex = currentIndex + 1;

      currentIndex = nextIndex;

      const nextTrack = playlist[currentIndex];

      if (nextTrack) {
        hostLoad(
          nextTrack.id,
          0,
          true
        );

        setTrackInfo(nextTrack);

        socket.emit(
          'player:setTrack',
          {
            roomId: currentRoom,

            track: {
              type: 'youtube',
              id: nextTrack.id
            }
          }
        );

        renderPlaylist();
      }
    }
  }
}

/* ---------------------------------------------------------
   Player Time UI
--------------------------------------------------------- */

setInterval(() => {
  if (!ytPlayer || !ytReady) {
    return;
  }

  try {
    const duration =
      ytPlayer.getDuration() || 0;

    const current =
      ytPlayer.getCurrentTime() || 0;

    if (duration) {
      if (seek) {
        seek.value =
          Math.floor(
            (current / duration) * 100
          );
      }

      if (curT) {
        curT.textContent =
          niceTime(current);
      }

      if (durT) {
        durT.textContent =
          niceTime(duration);
      }
    }
  } catch (error) {
    /*
       Ignore transient iframe state errors.
    */
  }
}, 500);

/* ---------------------------------------------------------
   Playlist Rendering
--------------------------------------------------------- */

function renderPlaylist() {
  if (!playlistBox) {
    return;
  }

  if (!playlist.length) {
    playlistBox.innerHTML = `
      <div class="text-slate-500 text-sm text-center py-4">
        Playlist is empty
      </div>
    `;

    return;
  }

  playlistBox.innerHTML =
    playlist
      .map((track, index) => {
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

            <div class="min-w-0 flex-1">

              <div
                class="
                  font-semibold
                  text-sm
                  truncate
                "
              >
                ${escapeHtml(track.title)}
              </div>

              <div
                class="
                  text-xs
                  text-slate-400
                  truncate
                "
              >
                ${escapeHtml(
                  track.channelTitle || ''
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
                  touch-manipulation
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
                  touch-manipulation
                "
                data-i="${index}"
              >
                ✕
              </button>

            </div>

          </div>
        `;
      })
      .join('');
}

/* ---------------------------------------------------------
   Playlist Controls
--------------------------------------------------------- */

if (playlistBox) {
  playlistBox.addEventListener(
    'click',
    (event) => {
      const playButton =
        event.target.closest('.smallPlay');

      const removeButton =
        event.target.closest('.smallRem');

      /*
         PLAY
      */

      if (playButton) {
        const index =
          Number(playButton.dataset.i);

        if (!isHost) {
          alert(
            'Only the host can control playback.'
          );

          return;
        }

        if (
          !Number.isInteger(index) ||
          !playlist[index]
        ) {
          return;
        }

        currentIndex = index;

        const track =
          playlist[currentIndex];

        hostLoad(
          track.id,
          0,
          true
        );

        setTrackInfo(track);

        socket.emit(
          'player:setTrack',
          {
            roomId: currentRoom,

            track: {
              type: 'youtube',
              id: track.id
            }
          }
        );

        renderPlaylist();

        return;
      }

      /*
         REMOVE
      */

      if (removeButton) {
        const index =
          Number(removeButton.dataset.i);

        if (
          !Number.isInteger(index) ||
          !playlist[index]
        ) {
          return;
        }

        const wasCurrent =
          index === currentIndex;

        playlist.splice(
          index,
          1
        );

        if (wasCurrent) {
          currentIndex = -1;

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
          index < currentIndex
        ) {
          currentIndex--;
        }

        renderPlaylist();
      }
    }
  );
}

/* ---------------------------------------------------------
   Clear Search
--------------------------------------------------------- */

function clearSearch() {
  if (resultsBox) {
    resultsBox.innerHTML = '';
  }

  if (searchPro) {
    searchPro.value = '';
  }

  syncSearchResultPlacement();
}

/* ---------------------------------------------------------
   Add Track To Playlist
--------------------------------------------------------- */

function addToPlaylist(item) {
  if (!item || !item.id) {
    return;
  }

  playlist.push({
    id: item.id,
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

  renderPlaylist();

  clearSearch();

  /*
     If playlist was empty, automatically start the first
     song for the host.
  */

  if (
    currentIndex === -1 &&
    isHost
  ) {
    currentIndex =
      playlist.length - 1;

    const track =
      playlist[currentIndex];

    hostLoad(
      track.id,
      0,
      true
    );

    setTrackInfo(track);

    socket.emit(
      'player:setTrack',
      {
        roomId: currentRoom,

        track: {
          type: 'youtube',
          id: track.id
        }
      }
    );

    renderPlaylist();
  }
}

/* ---------------------------------------------------------
   Search Input Configuration
--------------------------------------------------------- */

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
}

/* ---------------------------------------------------------
   Search
--------------------------------------------------------- */

async function doSearch() {
  const query =
    (searchPro?.value || '').trim();

  if (!query) {
    clearSearch();
    return;
  }

  const requestId =
    ++searchRequestId;

  if (resultsBox) {
    resultsBox.innerHTML = `
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

    if (requestId !== searchRequestId) {
      return;
    }

    if (!response.ok) {
      throw new Error(
        `Search failed with status ${response.status}`
      );
    }

    const data =
      await response.json();

    if (requestId !== searchRequestId) {
      return;
    }

    const items =
      Array.isArray(data)
        ? data
        : Array.isArray(data.results)
          ? data.results
          : [];

    if (!items.length) {
      if (resultsBox) {
        resultsBox.innerHTML = `
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

    resultsBox.innerHTML =
      items
        .map((item, index) => {
          const videoId =
            item.videoId ||
            item.id ||
            '';

          const title =
            item.title ||
            'YouTube video';

          const channelTitle =
            item.channelTitle ||
            item.channel ||
            '';

          const thumbnail =
            item.thumbnail ||
            item.thumbnailUrl ||
            `https://i.ytimg.com/vi/${encodeURIComponent(
              videoId
            )}/mqdefault.jpg`;

          return `
            <div
              class="
                beatsync-search-result
                p-2
                rounded-md
                bg-slate-800
                hover:bg-slate-700
                transition
                flex
                items-center
                justify-between
                gap-3
                mb-2
                last:mb-0
              "
              data-video-id="${escapeHtml(
                videoId
              )}"
              data-index="${index}"
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
                  cursor-pointer
                  touch-manipulation
                "
                data-video-id="${escapeHtml(
                  videoId
                )}"
              >

                <img
                  src="${escapeHtml(
                    thumbnail
                  )}"
                  width="64"
                  height="36"
                  loading="lazy"
                  class="
                    w-16
                    h-9
                    rounded-md
                    object-cover
                    shrink-0
                  "
                  alt=""
                />

                <span class="min-w-0">

                  <span
                    class="
                      block
                      font-semibold
                      text-sm
                      truncate
                    "
                  >
                    ${escapeHtml(title)}
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
                      channelTitle
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
                    hover:bg-emerald-400
                    text-white
                    flex
                    items-center
                    justify-center
                    text-lg
                    touch-manipulation
                  "
                  data-id="${escapeHtml(
                    videoId
                  )}"
                  data-title="${escapeHtml(
                    title
                  )}"
                  data-channel="${escapeHtml(
                    channelTitle
                  )}"
                  data-thumbnail="${escapeHtml(
                    thumbnail
                  )}"
                  aria-label="Add to playlist"
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
                    hover:bg-slate-600
                    text-white
                    flex
                    items-center
                    justify-center
                    text-sm
                    touch-manipulation
                  "
                  data-id="${escapeHtml(
                    videoId
                  )}"
                  data-title="${escapeHtml(
                    title
                  )}"
                  data-channel="${escapeHtml(
                    channelTitle
                  )}"
                  data-thumbnail="${escapeHtml(
                    thumbnail
                  )}"
                  aria-label="Play now"
                >
                  ▶
                </button>

              </div>

            </div>
          `;
        })
        .join('');

    syncSearchResultPlacement();

  } catch (error) {
    console.error(
      'BeatSync search error:',
      error
    );

    if (requestId !== searchRequestId) {
      return;
    }

    if (resultsBox) {
      resultsBox.innerHTML = `
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

/* ---------------------------------------------------------
   Search Button
--------------------------------------------------------- */

if (btnSearch) {
  btnSearch.addEventListener(
    'click',
    (event) => {
      event.preventDefault();

      doSearch();
    }
  );
}

/* ---------------------------------------------------------
   Search Keyboard
--------------------------------------------------------- */

if (searchPro) {
  searchPro.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Enter' ||
        event.keyCode === 13
      ) {
        event.preventDefault();

        doSearch();
      }
    }
  );

  /*
     Small debounce for typing-based realtime search.

     This does NOT search on every single keystroke.
     It waits briefly after the user stops typing.
  */

  searchPro.addEventListener(
    'input',
    () => {
      clearTimeout(searchTimer);

      const query =
        searchPro.value.trim();

      if (query.length < 2) {
        if (resultsBox) {
          resultsBox.innerHTML = '';
        }

        return;
      }

      searchTimer =
        setTimeout(
          () => {
            doSearch();
          },
          350
        );
    }
  );
}

/* ---------------------------------------------------------
   Search Result Actions
--------------------------------------------------------- */

if (resultsBox) {
  resultsBox.addEventListener(
    'click',
    (event) => {
      const addButton =
        event.target.closest('.addBtn');

      const playButton =
        event.target.closest('.playNow');

      const resultMain =
        event.target.closest(
          '.search-result-main'
        );

      /*
         ADD TO PLAYLIST
      */

      if (addButton) {
        event.preventDefault();
        event.stopPropagation();

        const id =
          addButton.dataset.id;

        const title =
          addButton.dataset.title ||
          'YouTube video';

        const channel =
          addButton.dataset.channel ||
          '';

        const thumbnail =
          addButton.dataset.thumbnail ||
          '';

        if (!id) {
          return;
        }

        addToPlaylist({
          id,
          title,
          channelTitle: channel,
          thumbnail
        });

        return;
      }

      /*
         PLAY NOW BUTTON
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
         CLICKING THE RESULT ITSELF ALSO PLAYS IT.
      */

      if (resultMain) {
        event.preventDefault();

        playSearchResult(
          resultMain.dataset.videoId,
          '',
          '',
          ''
        );
      }
    }
  );
}

/* ---------------------------------------------------------
   Play Search Result
--------------------------------------------------------- */

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

  /*
     Set track information immediately.
  */

  const track = {
    id: videoId,

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

  currentIndex = -1;

  /*
     This call is synchronous from the user's tap.

     That is important for Android browser autoplay
     behaviour.
  */

  hostLoad(
    videoId,
    0,
    true
  );

  setTrackInfo(track);

  socket.emit(
    'player:setTrack',
    {
      roomId: currentRoom,

      track: {
        type: 'youtube',
        id: videoId
      }
    }
  );

  clearSearch();

  renderPlaylist();
}

/* ---------------------------------------------------------
   Socket — Stats
--------------------------------------------------------- */

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

/* ---------------------------------------------------------
   Socket — Track Changed
--------------------------------------------------------- */

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
      track.type === 'youtube' &&
      track.id
    ) {
      loadForGuest(
        track.id,
        currentTime || 0,
        !!isPlaying
      );

      setTrackInfo({
        id: track.id,
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

/* ---------------------------------------------------------
   Socket — Playback Sync
--------------------------------------------------------- */

socket.on(
  'player:sync',
  ({
    isPlaying,
    currentTime,
    ts
  } = {}) => {
    /*
       Host does not need remote synchronization.
    */

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
        Number(ts) || now;

      const elapsed =
        Math.max(
          0,
          now - timestamp
        );

      const targetTime =
        (Number(currentTime) || 0) +
        elapsed / 1000;

      const localTime =
        ytPlayer.getCurrentTime() || 0;

      const difference =
        Math.abs(
          localTime -
          targetTime
        );

      /*
         Correct significant drift.
      */

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

      /*
         IMPORTANT:

         YouTube playVideo() does NOT return a Promise.

         Never use:
             playVideo().catch(...)

         because that causes Android errors.
      */

      if (isPlaying) {
        ytPlayer.playVideo();
      } else {
        ytPlayer.pauseVideo();
      }

    } catch (error) {
      console.warn(
        'Playback synchronization error:',
        error
      );
    }
  }
);

/* ---------------------------------------------------------
   Chat Send
--------------------------------------------------------- */

function sendChat() {
  const text =
    (msgInput?.value || '').trim();

  if (
    !text ||
    !currentRoom
  ) {
    return;
  }

  socket.emit(
    'chat:send',
    {
      roomId: currentRoom,

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
          msgInput.value = '';
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

/* ---------------------------------------------------------
   Socket — New Chat Message
--------------------------------------------------------- */

socket.on(
  'chat:new',
  (message) => {
    if (
      !message ||
      message.roomId !== currentRoom
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

    renderChat(
      window._chat
    );
  }
);

/* ---------------------------------------------------------
   Render Chat
--------------------------------------------------------- */

function renderChat(messages) {
  if (!chatWindow) {
    return;
  }

  const list =
    Array.isArray(messages)
      ? messages
      : [];

  chatWindow.innerHTML =
    list
      .map((message) => {
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

        /*
           Own messages → right
           Received messages → left
        */

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

              <div>
                <span
                  class="
                    font-semibold
                    text-xs
                  "
                >
                  ${escapeHtml(
                    sender
                  )}
                </span>
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
      })
      .join('');

  /*
     Always show the latest message.
  */

  chatWindow.scrollTop =
    chatWindow.scrollHeight;
}

/* ---------------------------------------------------------
   Show Music
--------------------------------------------------------- */

function showMusic() {
  /*
     Hide full-screen chat.
  */

  if (chatFull) {
    chatFull.classList.add(
      'hidden'
    );
  }

  /*
     Show music area.

     Prefer explicit musicSection.
  */

  if (musicSection) {
    musicSection.classList.remove(
      'hidden'
    );
  }

  /*
     If mainGrid exists and musicSection is a child,
     make sure the grid itself is visible.
  */

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

/* ---------------------------------------------------------
   Show Chat
--------------------------------------------------------- */

function showChat() {
  /*
     Hide music content.
  */

  if (musicSection) {
    musicSection.classList.add(
      'hidden'
    );
  }

  /*
     If mainGrid contains music UI, hide it too only when
     there is no dedicated musicSection.

     This prevents premium layouts from leaving search,
     playlist or music controls visible behind chat.
  */

  if (
    mainGrid &&
    !el('musicSection')
  ) {
    mainGrid.classList.add(
      'hidden'
    );
  }

  /*
     Show full-screen chat.
  */

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

  /*
     Search should never remain visible in Chat mode.
  */

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

/* ---------------------------------------------------------
   Music / Chat Tabs
--------------------------------------------------------- */

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

/* ---------------------------------------------------------
   Leave Room
--------------------------------------------------------- */

if (btnLeave) {
  btnLeave.addEventListener(
    'click',
    () => {
      window.location.href =
        '/join.html';
    }
  );
}

/* ---------------------------------------------------------
   Host Heartbeat
--------------------------------------------------------- */

setInterval(() => {
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
        ytPlayer.getCurrentTime() || 0
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
        roomId: currentRoom,

        isPlaying,

        currentTime
      }
    );

  } catch (error) {
    /*
       Ignore temporary iframe errors.
    */
  }
}, HEARTBEAT_INTERVAL_MS);

/* ---------------------------------------------------------
   Socket Connection
--------------------------------------------------------- */

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

          role = 'HOST';

          isHost = true;

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

          /*
             Initialize player immediately if API is ready.
          */

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
        roomId: currentRoom
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
           Restore current shared track.
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
              response.state.currentTime || 0,
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
              window._chat = [];
            }
          } catch (error) {
            console.warn(
              'Unable to restore chat:',
              error
            );

            window._chat = [];
          }
        }

        renderChat(
          window._chat || []
        );
      }
    );
  }
);

/* ---------------------------------------------------------
   YouTube IFrame API Ready
--------------------------------------------------------- */

/*
   This must exist globally because the YouTube API calls it.

   Most important Android fix:
   create the iframe as soon as the API is ready.
*/

window.onYouTubeIframeAPIReady =
  function () {
    youtubeApiReady = true;

    console.log(
      'BeatSync: YouTube API ready'
    );

    if (!ytPlayer) {
      createYTPlayer();
    }
  };

/* ---------------------------------------------------------
   Fallback Initialization
--------------------------------------------------------- */

/*
   If the YouTube API was already available before this script
   registered the callback, initialize it here too.
*/

if (
  typeof YT !== 'undefined' &&
  YT.Player
) {
  youtubeApiReady = true;

  if (!ytPlayer) {
    createYTPlayer();
  }
}

/* ---------------------------------------------------------
   Initial UI State
--------------------------------------------------------- */

if (
  chatFull &&
  !chatFull.classList.contains('hidden')
) {
  /*
     Leave existing HTML state untouched.
  */
} else {
  showMusic();
}

/* ---------------------------------------------------------
   Initial Playlist
--------------------------------------------------------- */

renderPlaylist();

/* ---------------------------------------------------------
   Final Mobile Search Sync
--------------------------------------------------------- */

syncSearchResultPlacement();

console.log(
  'BeatSync player.js loaded successfully.'
);