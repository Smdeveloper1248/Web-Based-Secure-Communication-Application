import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server);

const __dirname = dirname(fileURLToPath(import.meta.url));
// Serve static files (like script/main.js)
app.use(express.static(join(__dirname)));

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Store connected users
const users = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user registration
  socket.on('register', (username) => {
    users[username] = socket.id;
    console.log(`${username} registered with socket ID ${socket.id}`);
    io.emit('userList', Object.keys(users)); // Send updated user list
  });

  // Handle private messages
  socket.on('privateMessage', ({ to, message, from }) => {
    const recipientSocketId = users[to];
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('privateMessage', { message, from });
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    const username = Object.keys(users).find((key) => users[key] === socket.id);
    if (username) {
      delete users[username];
      console.log(`${username} disconnected.`);
      io.emit('userList', Object.keys(users)); // Send updated user list
    }
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
