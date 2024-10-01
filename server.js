const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server);
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("create_room", (hostName) => {
    const roomCode = generateRoomCode();
    rooms.set(roomCode, {
      host: { id: socket.id, name: hostName },
      participants: [],
      gameStarted: false,
      currentRound: 0,
      buzzedParticipant: null,
    });
    socket.join(roomCode);
    socket.emit("room_created", { roomCode, hostName });
  });

  socket.on("join_room", ({ roomCode, participantName }) => {
    const room = rooms.get(roomCode);
    if (room && !room.gameStarted) {
      const participant = { id: socket.id, name: participantName, score: 0 };
      room.participants.push(participant);
      socket.join(roomCode);
      socket.emit("joined_room", { roomCode, participantName });
      io.to(roomCode).emit("participant_joined", participant);
    } else {
      socket.emit("error", "Room not found or game already started");
    }
  });

  socket.on("start_game", (roomCode) => {
    const room = rooms.get(roomCode);
    if (room && socket.id === room.host.id) {
      room.gameStarted = true;
      room.currentRound = 1;
      io.to(roomCode).emit("game_started", { round: room.currentRound });
    }
  });

  socket.on("buzz", ({ roomCode, participantId }) => {
    const room = rooms.get(roomCode);
    if (room && room.gameStarted && !room.buzzedParticipant) {
      const participant = room.participants.find((p) => p.id === participantId);
      if (participant) {
        room.buzzedParticipant = participant;
        io.to(roomCode).emit("buzz_pressed", participant);
      }
    }
  });

  socket.on("answer_result", ({ roomCode, correct }) => {
    const room = rooms.get(roomCode);
    if (room && room.host.id === socket.id && room.buzzedParticipant) {
      if (correct) {
        room.buzzedParticipant.score += 1;
      }
      io.to(roomCode).emit("answer_judged", {
        participant: room.buzzedParticipant,
        correct,
        newScore: room.buzzedParticipant.score,
      });
      room.buzzedParticipant = null;
      room.currentRound += 1;
      io.to(roomCode).emit("new_round", { round: room.currentRound });
    }
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
    rooms.forEach((room, roomCode) => {
      if (room.host.id === socket.id) {
        io.to(roomCode).emit("host_left");
        rooms.delete(roomCode);
      } else {
        const index = room.participants.findIndex((p) => p.id === socket.id);
        if (index !== -1) {
          const participant = room.participants[index];
          room.participants.splice(index, 1);
          io.to(roomCode).emit("participant_left", participant);
        }
      }
    });
  });
});

module.exports = (req, res) => {
  if (req.url === "/socket.io/" && req.method === "GET") {
    server(req, res);
  } else {
    app(req, res);
  }
};

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
