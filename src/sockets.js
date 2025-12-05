const RoomStore = require("./roomStore");

function createSocketHandlers(io, logger, config) {
  const roomStore = new RoomStore({
    ttlSeconds: config.ROOM_TTL_SECONDS,
    maxRoomSize: config.MAX_ROOM_SIZE,
    logger
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    // broadcast current online count
    io.emit("stats:update", { online: io.engine.clientsCount });

    // ----- CREATE ROOM (HOST) -----
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

    // ----- JOIN ROOM (GUEST) -----
    socket.on("room:join", (payload = {}, cb = () => {}) => {
      try {
        let { roomId } = payload;
        roomId = (roomId || "").toUpperCase().trim();
        if (!roomId || roomId.length !== 6) {
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
            currentTrackUrl: room.currentTrackUrl,
            isPlaying: room.isPlaying,
            currentTime: room.currentTime
          }
        });
      } catch (e) {
        logger.error(e, "room:join failed");
        cb({ ok: false, error: "INTERNAL_ERROR" });
      }
    });

    // helper: check host
    function ensureHost(roomId, socketId) {
      const room = roomStore.get(roomId);
      if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };
      if (room.hostId !== socketId) return { ok: false, error: "NOT_HOST" };
      return { ok: true, room };
    }

    // ----- HOST: SET TRACK -----
    socket.on("player:setTrack", ({ roomId, url } = {}) => {
      roomId = (roomId || "").toUpperCase().trim();
      if (!roomId || !url) return;

      const res = ensureHost(roomId, socket.id);
      if (!res.ok) return;

      roomStore.updatePlayerState(roomId, {
        currentTrackUrl: url,
        currentTime: 0,
        isPlaying: false
      });

      socket.to(roomId).emit("player:trackChanged", {
        url,
        currentTime: 0,
        isPlaying: false
      });
    });

    // ----- HOST: PLAY/PAUSE/SEEK -----
    socket.on("player:stateChange", ({ roomId, isPlaying, currentTime } = {}) => {
      roomId = (roomId || "").toUpperCase().trim();
      if (!roomId) return;

      const res = ensureHost(roomId, socket.id);
      if (!res.ok) return;

      roomStore.updatePlayerState(roomId, {
        isPlaying: !!isPlaying,
        currentTime: Number(currentTime) || 0
      });

      socket.to(roomId).emit("player:sync", {
        isPlaying: !!isPlaying,
        currentTime: Number(currentTime) || 0,
        ts: Date.now()
      });
    });

    // ----- DISCONNECT -----
    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
      roomStore.leaveAllForSocket(socket.id);
      io.emit("stats:update", { online: io.engine.clientsCount });
    });
  });
}

module.exports = createSocketHandlers;
