const { customAlphabet } = require("nanoid");

// 4-digit room code, digits only (0000–9999)
const nanoid = customAlphabet("0123456789", 4);

class RoomStore {
  constructor({ ttlSeconds = 7200, maxRoomSize = 50, logger }) {
    this.rooms = new Map();
    this.ttl = ttlSeconds * 1000;
    this.maxRoomSize = maxRoomSize;
    this.log = logger || console;

    // cleanup every 60 seconds
    setInterval(() => this.cleanup(), 60 * 1000).unref();
  }

  // Generate unique 4-digit room code
  generateCode() {
    let code;
    do {
      code = nanoid(); // e.g. "0372"
    } while (this.rooms.has(code));
    return code;
  }

  // Create room with host as first member
  createRoom(hostSocketId) {
    const roomId = this.generateCode();
    const now = Date.now();

    this.rooms.set(roomId, {
      id: roomId,
      hostId: hostSocketId,
      createdAt: now,
      updatedAt: now,
      members: new Set([hostSocketId]),
      currentTrack: null, // { type: 'youtube'|'audio', id: 'videoId' or url }
      isPlaying: false,
      currentTime: 0,
      chatMessages: []        // last messages for chat
    });

    this.log.info({ roomId }, "Room created");
    return roomId;
  }

  has(roomId) {
    return this.rooms.has(roomId);
  }

  get(roomId) {
    return this.rooms.get(roomId);
  }

  // Join a room (guest)
  joinRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: "ROOM_NOT_FOUND" };

    if (room.members.size >= this.maxRoomSize) {
      return { ok: false, error: "ROOM_FULL" };
    }

    room.members.add(socketId);
    room.updatedAt = Date.now();
    this.log.info({ roomId, socketId }, "Joined room");

    return { ok: true, room };
  }

  // Remove socket from all rooms (on disconnect)
  leaveAllForSocket(socketId) {
    for (const [roomId, room] of this.rooms.entries()) {
      if (!room.members.has(socketId)) continue;

      room.members.delete(socketId);
      this.log.info({ roomId, socketId }, "Left room");

      if (room.hostId === socketId) {
        // host left → kill room
        this.rooms.delete(roomId);
        this.log.info({ roomId }, "Room deleted because host left");
      } else if (room.members.size === 0) {
        // no one left → delete room
        this.rooms.delete(roomId);
        this.log.info({ roomId }, "Room deleted because empty");
      }
    }
  }

  // Update track/time/play state
  updatePlayerState(roomId, state) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // state may contain: currentTrack (object), isPlaying, currentTime
    if (state.currentTrack !== undefined) room.currentTrack = state.currentTrack;
    if (state.isPlaying !== undefined) room.isPlaying = state.isPlaying;
    if (state.currentTime !== undefined) room.currentTime = state.currentTime;

    room.updatedAt = Date.now();
  }

  // Add chat message, keep last 200
  addChatMessage(roomId, { userName, text, ts }) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const message = {
      userName: userName || "anonymous",
      text: (text || "").toString(),
      ts: ts || Date.now()
    };

    if (!Array.isArray(room.chatMessages)) {
      room.chatMessages = [];
    }

    room.chatMessages.push(message);
    if (room.chatMessages.length > 200) {
      room.chatMessages.splice(0, room.chatMessages.length - 200);
    }

    room.updatedAt = Date.now();
    return message;
  }

  // Periodic cleanup for expired rooms
  cleanup() {
    const now = Date.now();

    for (const [roomId, room] of this.rooms.entries()) {
      if (now - room.updatedAt > this.ttl) {
        this.rooms.delete(roomId);
        this.log.info({ roomId }, "Room expired and removed");
      }
    }
  }
}

module.exports = RoomStore;
