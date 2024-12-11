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

  // Check if RSA key pair exists in local storage for the username
  const storedKeys = localStorage.getItem(`rsaKeys-${username}`);
  let rsaPrivateKey, rsaPublicKey;

  if (storedKeys) {
    // Load the existing RSA key pair
    const { privateKey, publicKey } = JSON.parse(storedKeys);
    rsaPrivateKey = await crypto.subtle.importKey(
      'pkcs8',
      base64ToArrayBuffer(privateKey),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['sign']
    );
    rsaPublicKey = await crypto.subtle.importKey(
      'spki',
      base64ToArrayBuffer(publicKey),
      { name: 'RSA-PSS', hash: 'SHA-256' },
      true,
      ['verify']
    );
  } else {
    // Generate a new RSA key pair if not found
    const rsaKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );

    rsaPrivateKey = rsaKeyPair.privateKey;
    rsaPublicKey = rsaKeyPair.publicKey;

    // Store the RSA keys in local storage
    const exportedPrivateKey = arrayBufferToBase64(await exportPrivateKey(rsaPrivateKey));
    const exportedPublicKey = arrayBufferToBase64(await exportPublicKey(rsaPublicKey));
    localStorage.setItem(
      `rsaKeys-${username}`,
      JSON.stringify({ privateKey: exportedPrivateKey, publicKey: exportedPublicKey })
    );
  }

  console.log(rsaPublicKey)
  const rsaPublicKeyBase64 = arrayBufferToBase64(await exportPublicKey(rsaPublicKey))
  console.log(rsaPublicKeyBase64)

  // Generate ECDH key pair
  await generateKeys();
  const ecdhPublicKeyBase64 = arrayBufferToBase64(publicKey);


  // Sign the ECDH public key using the RSA private key
  const signedEcdhPublicKey = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: 32 },
    rsaPrivateKey,
    new TextEncoder().encode(ecdhPublicKeyBase64)
  );

  const signedEcdhPublicKeyBase64 = arrayBufferToBase64(signedEcdhPublicKey);

  // Emit registration request and wait for confirmation
  socket.emit(
    'register',
    { username, publicKey: ecdhPublicKeyBase64, signature: signedEcdhPublicKeyBase64 },
    (response) => {
      if (response.success) {
        document.getElementById('login').style.display = 'none';
        document.getElementById('chat').style.display = 'block';
        showPublicKey(rsaPublicKeyBase64);
      } else {
        alert(response.message); // Show error message
      }
    }
  );
}

function showPublicKey(rsaPublicKey) {
  const keyDisplayContainer = document.getElementById('keyDisplay');
  const publicKeyTextarea = document.getElementById('publicKeyDisplay');
  console.log(rsaPublicKey)
  publicKeyTextarea.value = rsaPublicKey; // Set the public key in the textarea
  keyDisplayContainer.style.display = 'block'; // Make the container visible
}

// Function to copy the public key to clipboard
function copyPublicKey() {
  const publicKeyTextarea = document.getElementById('publicKeyDisplay');
  publicKeyTextarea.select(); // Select the text in the textarea
  document.execCommand('copy'); // Copy the selected text to the clipboard

  alert('Public key copied to clipboard!');
}

// Utility functions
async function exportPrivateKey(key) {
  return await crypto.subtle.exportKey('pkcs8', key);
}

async function exportPublicKey(key) {
  return await crypto.subtle.exportKey('spki', key);
}



// Update the online users list and cache their public keys
socket.on('userList', (users) => {
  const userList = document.getElementById('userList');
  userList.innerHTML = '';
  users.forEach((user) => {
    if (user.username !== username) {
      const li = document.createElement('li');
      li.textContent = user.username;
      li.onclick = () => selectRecipient(user.username);
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

// Function to handle recipient selection
async function selectRecipient(recipientUsername) {
  // Show a prompt for the recipient's public key (out-of-band shared key)
  const recipientPublicKeyBase64 = prompt(
    `Enter the out-of-band public key for ${recipientUsername}:`
  );

  if (!recipientPublicKeyBase64) {
    alert('Public key is required to proceed.');
    return;
  }

  // Send the recipient's username to the server to get their signature and public key
  socket.emit('getRecipientSignature', { username: recipientUsername }, async (response) => {
    if (!response.success) {
      alert('Failed to fetch recipient data. Please try again.');
      return;
    }

    const { rsaSignature, ecdhPublicKeyBase64 } = response;

    // console.log('rsa singature:',rsaSignature)
    // console.log('ecdhPublicKeyBase64', ecdhPublicKeyBase64)
    // console.log('recipientPublicKeyBase64',recipientPublicKeyBase64)

    try {
      // Verify the out-of-band public key using the signature and the server-provided public key
      const isValid = await verifySignedEcdhPublicKey(
        recipientPublicKeyBase64, // User-provided out-of-band public key
        rsaSignature, // Server-provided RSA signature
        ecdhPublicKeyBase64, // Server-provided RSA public key

      );

      if (isValid) {
        alert('Public key verified successfully! Proceeding with the chat...');
        // Continue the chat procedure
        setRecipient(recipientUsername, ecdhPublicKeyBase64);
      } else {
        alert('Signature verification failed. Public key does not match.');
      }
    } catch (err) {
      console.error('Verification error:', err);
      alert('An error occurred during verification.');
    }
  });
}

// Function to verify the public key with the server's signature
async function verifySignedEcdhPublicKey(rsaPublicKey, rsaSignature, ecdhPublicKeyBase64) {
  const importedPublicKey = await crypto.subtle.importKey(
    'spki',
    base64ToArrayBuffer(rsaPublicKey),
    {
      name: 'RSA-PSS',
      hash: { name: 'SHA-256' },
    },
    true,
    ['verify']
  );

  return await crypto.subtle.verify(
    {
      name: 'RSA-PSS',
      saltLength: 32,
    },
    importedPublicKey,
    base64ToArrayBuffer(rsaSignature),
    new TextEncoder().encode(ecdhPublicKeyBase64)
  );
}

// Send a private message
async function sendMessage() {
  const message = document.getElementById('message').value;
  if (message && currentRecipient) {
    const recipientPublicKey = userKeys.get(currentRecipient);
    const sharedSecret = await deriveSharedSecret(recipientPublicKey);
    console.log('recipient Public key ', recipientPublicKey)
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
