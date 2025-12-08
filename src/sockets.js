const RoomStore = require("./roomStore");

function createSocketHandlers(io, logger, config) {
  const roomStore = new RoomStore({
    ttlSeconds: config.ROOM_TTL_SECONDS,
    maxRoomSize: config.MAX_ROOM_SIZE,
    logger
  });

  // expose global pointer for server routes
  global.__BEATSYNC_ROOMSTORE = roomStore;

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    // broadcast current online count
    io.emit("stats:update", { online: io.engine.clientsCount });

    // -------- CREATE ROOM (HOST) --------
    socket.on("room:create", (cb = () => {}) => {
      try {
        const roomId = roomStore.createRoom(socket.id);
        socket.join(roomId);
        cb({ ok: true, roomId });
      } catch (e) {
        logger.error(e, "room:create failed");
        cb({ ok: false, error: "INTERNAL_ERROR" });
      }
    });

    // -------- JOIN ROOM (GUEST) --------
    socket.on("room:join", (payload = {}, cb = () => {}) => {
      try {
        let { roomId } = payload;
        roomId = (roomId || "").trim();

        if (!roomId || roomId.length !== 4 || !/^[0-9]{4}$/.test(roomId)) {
          return cb({ ok: false, error: "INVALID_CODE" });
        }

        const res = roomStore.joinRoom(roomId, socket.id);
        if (!res.ok) return cb(res);

        socket.join(roomId);
        const room = res.room;

        cb({
          ok: true,
          roomId,
          state: {
            currentTrack: room.currentTrack,
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
          },
          chat: room.chatMessages || []
        });
      } catch (e) {
        logger.error(e, "room:join failed");
        cb({ ok: false, error: "INTERNAL_ERROR" });
      }
    });

    // helper: ensure socket is host
    function ensureHost(roomId, socketId) {
      const room = roomStore.get(roomId);
      if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
      if (room.hostId !== socketId) return { ok: false, error: "NOT_HOST" };
      return { ok: true, room };
    }

    // -------- HOST: SET TRACK --------
    // payload: { roomId, track: { type: 'youtube'|'audio', id: '<videoId or url>' } }
    socket.on("player:setTrack", ({ roomId, track } = {}) => {
      roomId = (roomId || "").trim();
      if (!roomId || !track) return;

      const res = ensureHost(roomId, socket.id);
      if (!res.ok) return;

      // update the store
      roomStore.updatePlayerState(roomId, {
        currentTrack: track,
        currentTime: 0,
        isPlaying: false
      });

      // broadcast to others
      socket.to(roomId).emit("player:trackChanged", {
        track,
        currentTime: 0,
        isPlaying: false
      });
    });

    // -------- HOST: PLAY/PAUSE/SEEK (sync) --------
    // payload: { roomId, isPlaying, currentTime, ts(optional) }
    socket.on("player:stateChange", ({ roomId, isPlaying, currentTime, ts } = {}) => {
      roomId = (roomId || "").trim();
      if (!roomId) return;

      const res = ensureHost(roomId, socket.id);
      if (!res.ok) return;

      const time = Number(currentTime) || 0;

      roomStore.updatePlayerState(roomId, {
        isPlaying: !!isPlaying,
        currentTime: time
      });

      // include server ts for drift correction
      socket.to(roomId).emit("player:sync", {
        isPlaying: !!isPlaying,
        currentTime: time,
        ts: Date.now()
      });
    });

    // -------- CHAT: SEND MESSAGE --------
    socket.on("chat:send", (payload = {}, cb = () => {}) => {
      try {
        let { roomId, userName, text } = payload;
        roomId = (roomId || "").trim();
        text = (text || "").toString().trim();

        if (!roomId || !text) return cb({ ok: false, error: "INVALID" });
        if (text.length > 800) {
          text = text.slice(0, 800);
        }

        const room = roomStore.get(roomId);
        if (!room) return cb({ ok: false, error: "ROOM_NOT_FOUND" });

        const message = roomStore.addChatMessage(roomId, {
          userName,
          text,
          ts: Date.now()
        });

        if (!message) return cb({ ok: false, error: "INTERNAL_ERROR" });

        // broadcast to everyone in room
        io.to(roomId).emit("chat:new", {
          roomId,
          ...message
        });

        cb({ ok: true });
      } catch (e) {
        logger.error(e, "chat:send failed");
        cb({ ok: false, error: "INTERNAL_ERROR" });
      }
    });

    // -------- DISCONNECT --------
    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
      roomStore.leaveAllForSocket(socket.id);
      io.emit("stats:update", { online: io.engine.clientsCount });
    });
  });
}

module.exports = createSocketHandlers;
