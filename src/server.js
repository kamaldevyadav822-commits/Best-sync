require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const cors = require("cors");
const pino = require("pino");
const path = require("path");

const createSocketHandlers = require("./sockets");

const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug"
});

const PORT = process.env.PORT || 3000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const config = {
  ROOM_TTL_SECONDS: Number(process.env.ROOM_TTL_SECONDS || 7200), // 2 hours default
  MAX_ROOM_SIZE: Number(process.env.MAX_ROOM_SIZE || 50)
};

const app = express();

// security + CORS
app.use(helmet());
app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(","),
    methods: ["GET", "POST"],
    credentials: true
  })
);

// healthcheck
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// static frontend
const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",")
  }
});

// attach socket logic
createSocketHandlers(io, logger, config);

server.listen(PORT, () => {
  logger.info({ port: PORT }, "Server listening");
});
