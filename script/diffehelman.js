async function generateKeyPair() {
    // Generate an ECDH key pair using P-256 curve
    return await crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256", // Curve used for ECDH
      },
      true, // Key is extractable
      ["deriveKey", "deriveBits"] // Key usages
    );
  }
  
  async function exportPublicKey(key) {
    // Export the public key to send to the other party
    return await crypto.subtle.exportKey("spki", key);
  }
  
  async function importPublicKey(keyData) {
    // Import the received public key
    return await crypto.subtle.importKey(
      "spki",
      keyData,
      {
        name: "ECDH",
        namedCurve: "P-256", // Must match the curve of the original key
      },
      true,
      []
    );
  }
  
  async function deriveSharedSecret(privateKey, publicKey) {
    // Compute the shared secret
    return await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: publicKey,
      },
      privateKey,
      256 // Length of the derived bits in bits
    );
  }
  
  async function deriveSymmetricKey(sharedSecret) {
    // Convert shared secret into a symmetric key for encryption/decryption
    return await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-GCM", length: 256 }, // Symmetric encryption algorithm
      true,
      ["encrypt", "decrypt"]
    );
  }
  
  // Main Function to Simulate Diffie-Hellman Key Exchange
  async function diffieHellmanExchange() {
    // Step 1: Generate key pairs for both parties
    const aliceKeys = await generateKeyPair();
    const bobKeys = await generateKeyPair();
  
    // Step 2: Exchange public keys
    const alicePublicKeyData = await exportPublicKey(aliceKeys.publicKey);
    const bobPublicKeyData = await exportPublicKey(bobKeys.publicKey);
  
    const aliceImportedBobPublicKey = await importPublicKey(bobPublicKeyData);
    const bobImportedAlicePublicKey = await importPublicKey(alicePublicKeyData);
  
    // Step 3: Compute shared secrets
    const aliceSharedSecret = await deriveSharedSecret(aliceKeys.privateKey, aliceImportedBobPublicKey);
    const bobSharedSecret = await deriveSharedSecret(bobKeys.privateKey, bobImportedAlicePublicKey);
  
    // Both shared secrets should be identical
    console.log("Shared Secret (Alice):", new Uint8Array(aliceSharedSecret));
    console.log("Shared Secret (Bob):", new Uint8Array(bobSharedSecret));
  
    // Step 4 (Optional): Derive symmetric keys for encryption/decryption
    const aliceSymmetricKey = await deriveSymmetricKey(aliceSharedSecret);
    const bobSymmetricKey = await deriveSymmetricKey(bobSharedSecret);
  
    console.log("Keys derived successfully!");
  }
  
  diffieHellmanExchange();
  