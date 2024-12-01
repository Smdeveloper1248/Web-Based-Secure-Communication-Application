const socket = io();
let username = '';
let currentRecipient = '';

console.log('main.js loaded successfully');

// Register user
function register() {
  username = document.getElementById('usernameInput').value;
  if (username) {
    socket.emit('register', username); // Send registration event
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
  }
}

// Update the online users list
socket.on('userList', (users) => {
  const userList = document.getElementById('userList');
  userList.innerHTML = '';
  users.forEach((user) => {
    if (user !== username) {
      const li = document.createElement('li');
      li.textContent = user;
      li.onclick = () => setRecipient(user);
      userList.appendChild(li);
    }
  });
});

// Set the recipient for private messaging
function setRecipient(recipient) {
  currentRecipient = recipient;
  document.getElementById('chatBox').innerHTML += `<div><strong>Now chatting with ${recipient}</strong></div>`;
}

// Send a private message
function sendMessage() {
  const message = document.getElementById('message').value;
  if (message && currentRecipient) {
    socket.emit('privateMessage', {
      to: currentRecipient,
      message,
      from: username,
    });
    document.getElementById('chatBox').innerHTML += `<div>You: ${message}</div>`;
    document.getElementById('message').value = ''; // Clear input
  } else {
    alert('Select a user to chat with.');
  }
}

// Receive a private message
socket.on('privateMessage', ({ message, from }) => {
  document.getElementById('chatBox').innerHTML += `<div>${from}: ${message}</div>`;
});

// Attach functions to the window object
window.register = register;
window.sendMessage = sendMessage;

