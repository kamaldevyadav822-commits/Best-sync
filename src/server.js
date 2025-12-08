require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const cors = require("cors");
const pino = require("pino");
const path = require("path");

// node-fetch as ESM import wrapper
const fetch = (...args) => import('node-fetch').then(({default:fetch})=>fetch(...args));

const createSocketHandlers = require("./sockets");

const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug"
});

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || null;
const JAMENDO_CLIENT_ID = process.env.JAMENDO_CLIENT_ID || null;

const config = {
  ROOM_TTL_SECONDS: Number(process.env.ROOM_TTL_SECONDS || 7200),
  MAX_ROOM_SIZE: Number(process.env.MAX_ROOM_SIZE || 50)
};

const app = express();

// Helmet but disable CSP (Tailwind CDN)
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(","),
    methods: ["GET", "POST"],
    credentials: true
  })
);

// health
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

/**
 * YouTube search proxy
 * GET /api/yt/search?q=...&limit=8
 * returns { results: [ { videoId, title, channelTitle, thumbnail } ] }
 */
app.get("/api/yt/search", async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.status(500).json({ error: "YOUTUBE_API_KEY_NOT_SET" });
    }

    const q = (req.query.q || "").trim();
    if (!q) return res.json({ results: [] });

    const limit = Math.min(parseInt(req.query.limit || "8", 10), 25);

    // search endpoint
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(q)}&maxResults=${limit}&key=${encodeURIComponent(
      YOUTUBE_API_KEY
    )}`;

    const r = await fetch(searchUrl);
    if (!r.ok) {
      logger.error({ status: r.status }, "YouTube search failed");
      return res.status(502).json({ error: "YOUTUBE_SEARCH_FAILED" });
    }
    const data = await r.json();
    const items = data.items || [];

    const results = items.map((it) => {
      const sn = it.snippet || {};
      return {
        videoId: it.id.videoId,
        title: sn.title,
        channelTitle: sn.channelTitle,
        thumbnail: (sn.thumbnails && (sn.thumbnails.high || sn.thumbnails.default)).url
      };
    });

    return res.json({ results });
  } catch (err) {
    logger.error(err, "yt search error");
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Optional Jamendo search (kept for fallback)
app.get("/api/search", async (req, res) => {
  try {
    if (!JAMENDO_CLIENT_ID) {
      return res.json({ results: [] });
    }
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit || "12", 10), 50);
    if (!q) return res.json({ results: [] });

    const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(
      JAMENDO_CLIENT_ID
    )}&format=json&limit=${limit}&offset=0&fuzzyquery=${encodeURIComponent(q)}&include=musicinfo&audioformat=mp32&order=popularity_total`;

    const r = await fetch(url);
    if (!r.ok) return res.json({ results: [] });
    const data = await r.json();
    const results = (data.results || []).map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artist_name,
      album: t.album_name,
      duration: t.duration,
      audio: t.audio
    }));
    return res.json({ results });
  } catch (err) {
    logger.error(err, "jamendo search error");
    return res.status(500).json({ results: [] });
  }
});

// --- Room existence check & chat fetch using global roomstore ---
app.get("/api/room-exists", (req, res) => {
  try {
    const roomId = (req.query.room || "").trim();
    if (!roomId || !/^[0-9]{4}$/.test(roomId)) {
      return res.json({ exists: false });
    }
    const store = global.__BEATSYNC_ROOMSTORE;
    const exists = !!(store && store.rooms && store.rooms.has(roomId));
    return res.json({ exists });
  } catch (err) {
    logger.error(err, "room-exists error");
    return res.status(500).json({ exists: false });
  }
});

app.get("/api/room-chat", (req, res) => {
  try {
    const roomId = (req.query.room || "").trim();
    if (!roomId || !/^[0-9]{4}$/.test(roomId)) {
      return res.status(400).json({ error: "INVALID_ROOM" });
    }
    const store = global.__BEATSYNC_ROOMSTORE;
    const room = store && store.rooms ? store.rooms.get(roomId) : null;
    const messages = room && Array.isArray(room.chatMessages) ? room.chatMessages : [];
    return res.json({ chat: messages });
  } catch (err) {
    logger.error(err, "room-chat error");
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// static frontend
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// HTTP + socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",")
  }
});

// socket handlers (this will set global.__BEATSYNC_ROOMSTORE inside)
createSocketHandlers(io, logger, config);

server.listen(PORT, () => {
  logger.info({ port: PORT }, "Server listening");
});
