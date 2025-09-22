import { Keypair } from "@stellar/stellar-sdk";
import crypto from "crypto";
import { storage } from "../storage.js";

interface EncryptedWalletData {
  userId: string;
  encryptedSecretKey: string;
  iv: string;
  salt: string;
  publicKey: string;
}

class ServerWalletService {
  private readonly algorithm = "aes-256-cbc";
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly saltLength = 32;
  private readonly tagLength = 16;

  // Encrypt secret key with user's session-based key
  private async encryptSecretKey(
    secretKey: string,
    password: string,
  ): Promise<{
    encrypted: string;
    iv: string;
    salt: string;
    tag: string;
  }> {
    const salt = crypto.randomBytes(this.saltLength);
    const iv = crypto.randomBytes(this.ivLength);

    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(
      password,
      salt,
      100000,
      this.keyLength,
      "sha256",
    );

    const cipher = crypto.createCipher(this.algorithm, key);
    let encrypted = cipher.update(secretKey, "utf8", "hex");
    encrypted += cipher.final("hex");

    return {
      encrypted,
      iv: iv.toString("hex"),
      salt: salt.toString("hex"),
      tag: "", // Not needed for CBC mode
    };
  }

  // Decrypt secret key with user's session-based key
  private async decryptSecretKey(
    encryptedData: string,
    password: string,
    iv: string,
    salt: string,
    tag: string,
  ): Promise<string> {
    const key = crypto.pbkdf2Sync(
      password,
      Buffer.from(salt, "hex"),
      100000,
      this.keyLength,
      "sha256",
    );

    const decipher = crypto.createDecipher(
      this.algorithm,
      key
    );

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  // Store encrypted secret key for user session
  async storeUserSecretKey(
    userId: string,
    secretKey: string,
    sessionPassword: string,
  ): Promise<void> {
    try {
      const keypair = Keypair.fromSecret(secretKey);
      const publicKey = keypair.publicKey();

      const encryptionResult = await this.encryptSecretKey(
        secretKey,
        sessionPassword,
      );

      const walletData: EncryptedWalletData = {
        userId,
        encryptedSecretKey: `${encryptionResult.encrypted}:${encryptionResult.tag}`,
        iv: encryptionResult.iv,
        salt: encryptionResult.salt,
        publicKey,
      };

      // Store in memory cache with TTL (1 hour)
      this.walletCache.set(userId, {
        ...walletData,
        timestamp: Date.now(),
        ttl: 3600000, // 1 hour
      });
    } catch (error) {
      throw new Error(
        `Failed to store secret key: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Retrieve and decrypt secret key for user
  async getUserSecretKey(
    userId: string,
    sessionPassword: string,
  ): Promise<string> {
    try {
      const cachedData = this.walletCache.get(userId);

      if (!cachedData) {
        throw new Error("Wallet session not found. Please re-authenticate.");
      }

      // Check TTL
      if (Date.now() - cachedData.timestamp > cachedData.ttl) {
        this.walletCache.delete(userId);
        throw new Error("Wallet session expired. Please re-authenticate.");
      }

      const [encrypted, tag] = cachedData.encryptedSecretKey.split(":");

      const secretKey = await this.decryptSecretKey(
        encrypted,
        sessionPassword,
        cachedData.iv,
        cachedData.salt,
        tag,
      );

      // Validate the secret key
      const keypair = Keypair.fromSecret(secretKey);
      if (keypair.publicKey() !== cachedData.publicKey) {
        throw new Error("Secret key validation failed");
      }

      return secretKey;
    } catch (error) {
      throw new Error(
        `Failed to retrieve secret key: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  // Session-based wallet cache
  private walletCache = new Map<
    string,
    EncryptedWalletData & { timestamp: number; ttl: number }
  >();

  // Clear user session
  clearUserSession(userId: string): void {
    this.walletCache.delete(userId);
  }

  // Clean expired sessions
  cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [userId, data] of this.walletCache.entries()) {
      if (now - data.timestamp > data.ttl) {
        this.walletCache.delete(userId);
      }
    }
  }

  // Generate session password for user (to be used with PIN)
  generateSessionPassword(userId: string, pin: string): string {
    const timestamp = Math.floor(Date.now() / (1000 * 60 * 60)); // Changes every hour
    return crypto
      .createHash("sha256")
      .update(`${userId}:${pin}:${timestamp}`)
      .digest("hex");
  }
}

// Start cleanup interval
const walletService = new ServerWalletService();
setInterval(
  () => {
    walletService.cleanExpiredSessions();
  },
  5 * 60 * 1000,
); // Clean every 5 minutes

export { walletService };
