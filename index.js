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

// Store connected users and their public keys
const users = new Map(); // Map of username -> { socketId, publicKey }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user registration
  socket.on('register', ({ username, publicKey }) => {
    users.set(username, { socketId: socket.id, publicKey });
    console.log(`${username} registered with socket ID ${socket.id}`);
    io.emit(
      'userList',
      Array.from(users.entries()).map(([username, { publicKey }]) => ({ username, publicKey }))
    ); // Send updated user list with public keys
  });

  // Handle private messages
  socket.on('privateMessage', ({ to, message, from }) => {
    const recipient = users.get(to);
    console.log('This is private / encrypted messagse :', message)
    if (recipient) {
      io.to(recipient.socketId).emit('privateMessage', { message, from });
    }
  });

  // Handle user disconnection
  socket.on('disconnect', () => {
    const username = Array.from(users.entries()).find(([_, { socketId }]) => socketId === socket.id)?.[0];
    if (username) {
      users.delete(username);
      console.log(`${username} disconnected.`);
      io.emit(
        'userList',
        Array.from(users.entries()).map(([username, { publicKey }]) => ({ username, publicKey }))
      ); // Send updated user list
    }
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
