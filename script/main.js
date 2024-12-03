const socket = io();
let username = '';
let currentRecipient = '';
let privateKey;
let publicKey;
const userKeys = new Map(); // Stores public keys of users

console.log('main.js loaded successfully');

// Generate ECDH key pair
async function generateKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  privateKey = keyPair.privateKey;
  publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
}

// Utility function to convert a base64 string to an ArrayBuffer
function base64ToArrayBuffer(base64) {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error('Failed to decode base64 string:', error);
    throw new Error('Invalid base64 string provided');
  }
}

// Derive shared secret
async function deriveSharedSecret(remotePublicKeyBase64) {
  const remotePublicKeyArrayBuffer = base64ToArrayBuffer(remotePublicKeyBase64);
  const importedPublicKey = await crypto.subtle.importKey(
    'spki',
    remotePublicKeyArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: importedPublicKey },
    privateKey,
    256
  );
  return sharedSecret;
}

// Encrypt message with AES-GCM
async function encryptMessage(sharedSecret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12)); // Initialization vector
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(message)
  );
  return { encrypted, iv };
}

// Decrypt message with AES-GCM
async function decryptMessage(sharedSecret, encryptedData) {
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encryptedData.iv },
    key,
    encryptedData.encrypted
  );
  return new TextDecoder().decode(decrypted);
}

// Convert ArrayBuffer to base64 string
function arrayBufferToBase64(buffer) {
  const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
  return btoa(binary);
}

// Register user
async function register() {
  username = document.getElementById('usernameInput').value;
  if (!username.trim()) {
    alert('Please enter a username.');
    return;
  }

  await generateKeys();
  const publicKeyBase64 = arrayBufferToBase64(publicKey); // Encode public key

  // Emit registration request and wait for confirmation
  socket.emit('register', { username, publicKey: publicKeyBase64 }, (response) => {
    if (response.success) {
      document.getElementById('login').style.display = 'none';
      document.getElementById('chat').style.display = 'block';
    } else {
      alert(response.message); // Show error message
    }
  });
}


// Update the online users list and cache their public keys
socket.on('userList', (users) => {
  const userList = document.getElementById('userList');
  userList.innerHTML = '';
  users.forEach((user) => {
    if (user.username !== username) {
      const li = document.createElement('li');
      li.textContent = user.username;
      li.onclick = () => setRecipient(user.username, user.publicKey);
      userList.appendChild(li);
      // Cache the user's public key
      userKeys.set(user.username, user.publicKey);
    }
  });
});


// Set the recipient for private messaging
function setRecipient(recipient, recipientPublicKey) {
  currentRecipient = recipient;
  userKeys.set(recipient, recipientPublicKey); // Cache the recipient's public key
  document.getElementById('chatBox').innerHTML += `<div><strong>Now chatting with ${recipient}</strong></div>`;
}

// Send a private message
async function sendMessage() {
  const message = document.getElementById('message').value;
  if (message && currentRecipient) {
    const recipientPublicKey = userKeys.get(currentRecipient);
    const sharedSecret = await deriveSharedSecret(recipientPublicKey);

    const { encrypted, iv } = await encryptMessage(sharedSecret, message);
    socket.emit('privateMessage', {
      to: currentRecipient,
      message: { encrypted, iv },
      from: username,
    });

    document.getElementById('chatBox').innerHTML += `<div>You: ${message}</div>`;
    document.getElementById('message').value = ''; // Clear input
  } else {
    alert('Select a user to chat with.');
  }
}

// Receive a private message
socket.on('privateMessage', async ({ message, from }) => {
  try {
    const senderPublicKey = userKeys.get(from);
    if (!senderPublicKey) {
      console.warn(`Public key for sender "${from}" not found. Message cannot be decrypted.`);
      return;
    }

    const sharedSecret = await deriveSharedSecret(senderPublicKey);
    const decryptedMessage = await decryptMessage(sharedSecret, message);

    document.getElementById('chatBox').innerHTML += `<div>${from}: ${decryptedMessage}</div>`;
  } catch (error) {
    console.error('Error receiving or decrypting the private message:', error);
  }
});

// Attach functions to the window object
window.register = register;
window.sendMessage = sendMessage;
