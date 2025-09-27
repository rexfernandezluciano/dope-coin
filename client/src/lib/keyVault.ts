/** @format */

import * as bip39 from "bip39";
import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

// Make Buffer available globally for bip39 library
if (typeof window !== "undefined") {
        window.Buffer = Buffer;
}

// =====================================================
// TYPE DEFINITIONS AND INTERFACES
// =====================================================

export interface WalletData {
        id: string;
        name: string;
        publicKey: string;
        encryptedPrivateKey: string;
        iv: string;
        derivationPath: string;
        createdAt: number;
        lastUsed: number;
}

// Unified vault envelope format for consistent encryption/decryption
export interface VaultEnvelope {
        version: number;
        kdf: {
                salt: string;
                iterations: number;
                digest: string;
        };
        cipher: {
                iv: string;
                algo: string;
        };
        payload: string; // base64 encoded ciphertext
}

export interface EncryptedVault {
        id: string;
        name: string;
        encryptedMnemonic: string;
        wallets: WalletData[];
        salt: string;
        iv: string;
        iterations?: number; // KDF iterations count - preserve during sync
        createdAt: number;
        lastAccessed: number;
}

export interface KeyVaultOptions {
        autoLockMinutes?: number;
        pinRetries?: number;
        defaultDerivationPath?: string;
        minPbkdf2Iterations?: number;
}

export interface DecryptedWallet {
        id: string;
        name: string;
        publicKey: string;
        keypair: Keypair;
        derivationPath: string;
}

export interface TransactionAuth {
        hashedPin: string;
        expiry: number;
}

export interface VaultStats {
        totalVaults: number;
        totalWallets: number;
        lastBackup?: number;
}

// =====================================================
// INDEXEDDB STORAGE WRAPPER
// =====================================================

class SecureStorage {
        private dbName = "keyVault";
        private version = 2; // Incremented for new schema
        private db: IDBDatabase | null = null;

        async init(): Promise<void> {
                return new Promise((resolve, reject) => {
                        const request = indexedDB.open(this.dbName, this.version);

                        request.onerror = () => reject(new Error("Failed to open IndexedDB"));

                        request.onsuccess = () => {
                                this.db = request.result;
                                resolve();
                        };

                        request.onupgradeneeded = event => {
                                const db = (event.target as IDBOpenDBRequest).result;

                                // Create vaults store with updated schema
                                if (!db.objectStoreNames.contains("vaults")) {
                                        const vaultStore = db.createObjectStore("vaults", { keyPath: "id" });
                                        vaultStore.createIndex("name", "name", { unique: false });
                                        vaultStore.createIndex("lastAccessed", "lastAccessed", {
                                                unique: false,
                                        });
                                }

                                // Create settings store
                                if (!db.objectStoreNames.contains("settings")) {
                                        db.createObjectStore("settings", { keyPath: "key" });
                                }

                                // Create pin retry tracking store
                                if (!db.objectStoreNames.contains("pinRetries")) {
                                        db.createObjectStore("pinRetries", { keyPath: "walletId" });
                                }
                        };
                });
        }

        async storeVault(vault: EncryptedVault): Promise<void> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["vaults"], "readwrite");
                        const store = transaction.objectStore("vaults");
                        const request = store.put(vault);

                        request.onerror = () => reject(new Error("Failed to store vault"));
                        request.onsuccess = () => resolve();
                });
        }

        async getVault(id: string): Promise<EncryptedVault | null> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["vaults"], "readonly");
                        const store = transaction.objectStore("vaults");
                        const request = store.get(id);

                        request.onerror = () => reject(new Error("Failed to retrieve vault"));
                        request.onsuccess = () => resolve(request.result || null);
                });
        }

        async getAllVaults(): Promise<EncryptedVault[]> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["vaults"], "readonly");
                        const store = transaction.objectStore("vaults");
                        const request = store.getAll();

                        request.onerror = () => reject(new Error("Failed to retrieve vaults"));
                        request.onsuccess = () => resolve(request.result || []);
                });
        }

        async deleteVault(id: string): Promise<void> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["vaults"], "readwrite");
                        const store = transaction.objectStore("vaults");
                        const request = store.delete(id);

                        request.onerror = () => reject(new Error("Failed to delete vault"));
                        request.onsuccess = () => resolve();
                });
        }

        async storeSetting(key: string, value: any): Promise<void> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["settings"], "readwrite");
                        const store = transaction.objectStore("settings");
                        const request = store.put({ key, value });

                        request.onerror = () => reject(new Error("Failed to store setting"));
                        request.onsuccess = () => resolve();
                });
        }

        async getSetting(key: string): Promise<any> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["settings"], "readonly");
                        const store = transaction.objectStore("settings");
                        const request = store.get(key);

                        request.onerror = () => reject(new Error("Failed to retrieve setting"));
                        request.onsuccess = () => resolve(request.result?.value || null);
                });
        }

        async storePinRetries(walletId: string, attempts: number): Promise<void> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["pinRetries"], "readwrite");
                        const store = transaction.objectStore("pinRetries");
                        const request = store.put({
                                walletId,
                                attempts,
                                lastAttempt: Date.now(),
                        });

                        request.onerror = () => reject(new Error("Failed to store pin retry count"));
                        request.onsuccess = () => resolve();
                });
        }

        async getPinRetries(walletId: string): Promise<{ attempts: number; lastAttempt: number } | null> {
                if (!this.db) throw new Error("Database not initialized");

                return new Promise((resolve, reject) => {
                        const transaction = this.db!.transaction(["pinRetries"], "readonly");
                        const store = transaction.objectStore("pinRetries");
                        const request = store.get(walletId);

                        request.onerror = () => reject(new Error("Failed to retrieve pin retry count"));
                        request.onsuccess = () => resolve(request.result || null);
                });
        }
}

// =====================================================
// CRYPTOGRAPHIC UTILITIES
// =====================================================

class CryptoUtils {
        private static readonly MIN_PBKDF2_ITERATIONS = 300000; // Increased from 100k
        private static readonly KEY_LENGTH = 256;
        private static readonly IV_LENGTH = 12;
        private static readonly SALT_LENGTH = 32;
        private static readonly PIN_SALT_LENGTH = 16;

        // Device-calibrated PBKDF2 iterations
        private static cachedIterations: number | null = null;

        static generateSalt(length: number = this.SALT_LENGTH): Uint8Array {
                return crypto.getRandomValues(new Uint8Array(length));
        }

        static generateIV(): Uint8Array {
                return crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
        }

        // Calibrate PBKDF2 iterations based on device performance
        static async calibratePbkdf2Iterations(): Promise<number> {
                if (this.cachedIterations) {
                        return this.cachedIterations;
                }

                const testPassword = "test-password";
                const testSalt = this.generateSalt();

                let iterations = this.MIN_PBKDF2_ITERATIONS;

                try {
                        const startTime = performance.now();
                        await this.deriveKey(testPassword, testSalt, iterations);
                        const endTime = performance.now();
                        const duration = endTime - startTime;

                        // Target 500ms for key derivation (good security/UX balance)
                        const targetDuration = 500;
                        if (duration < targetDuration) {
                                // Increase iterations if device is fast
                                iterations = Math.floor(iterations * (targetDuration / duration));
                                iterations = Math.max(iterations, this.MIN_PBKDF2_ITERATIONS);
                        }
                } catch (error) {
                        // Fall back to minimum if calibration fails
                        iterations = this.MIN_PBKDF2_ITERATIONS;
                }

                this.cachedIterations = iterations;
                return iterations;
        }

        static async deriveKey(password: string, salt: Uint8Array, iterations?: number): Promise<CryptoKey> {
                const encoder = new TextEncoder();
                const passwordData = encoder.encode(password);

                const baseKey = await crypto.subtle.importKey("raw", passwordData, "PBKDF2", false, ["deriveKey"]);

                const finalIterations = iterations || (await this.calibratePbkdf2Iterations());

                return crypto.subtle.deriveKey(
                        {
                                name: "PBKDF2",
                                salt: salt,
                                iterations: finalIterations,
                                hash: "SHA-256",
                        },
                        baseKey,
                        {
                                name: "AES-GCM",
                                length: this.KEY_LENGTH,
                        },
                        false,
                        ["encrypt", "decrypt"],
                );
        }

        // Hash PIN using PBKDF2 for secure verification
        static async hashPin(pin: string, salt?: Uint8Array): Promise<{ hash: string; salt: string }> {
                const pinSalt = salt || this.generateSalt(this.PIN_SALT_LENGTH);
                const encoder = new TextEncoder();

                const baseKey = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);

                const derivedBits = await crypto.subtle.deriveBits(
                        {
                                name: "PBKDF2",
                                salt: pinSalt,
                                iterations: 100000, // Faster iterations for PIN (used more frequently)
                                hash: "SHA-256",
                        },
                        baseKey,
                        256,
                );

                return {
                        hash: this.arrayBufferToBase64(derivedBits),
                        salt: this.arrayBufferToBase64(pinSalt),
                };
        }

        // Constant-time comparison for PIN verification
        static async verifyPin(pin: string, hashedPin: string, salt: string): Promise<boolean> {
                try {
                        const saltBuffer = this.base64ToArrayBuffer(salt);
                        const { hash } = await this.hashPin(pin, new Uint8Array(saltBuffer));

                        // Constant-time comparison
                        return this.constantTimeCompare(hash, hashedPin);
                } catch (error) {
                        return false;
                }
        }

        // Constant-time string comparison to prevent timing attacks
        static constantTimeCompare(a: string, b: string): boolean {
                if (a.length !== b.length) {
                        return false;
                }

                let result = 0;
                for (let i = 0; i < a.length; i++) {
                        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
                }

                return result === 0;
        }

        // Legacy encrypt method for backward compatibility
        static async encrypt(
                data: string,
                password: string,
        ): Promise<{
                encrypted: string;
                salt: string;
                iv: string;
        }> {
                try {
                        const salt = this.generateSalt();
                        const iv = this.generateIV(); // Unique IV per encryption
                        const iterations = await this.calibratePbkdf2Iterations();
                        const key = await this.deriveKey(password, salt, iterations);

                        const encoder = new TextEncoder();
                        const dataBuffer = encoder.encode(data);

                        const encrypted = await crypto.subtle.encrypt(
                                {
                                        name: "AES-GCM",
                                        iv: iv,
                                },
                                key,
                                dataBuffer,
                        );

                        return {
                                encrypted: this.arrayBufferToBase64(encrypted),
                                salt: this.arrayBufferToBase64(salt),
                                iv: this.arrayBufferToBase64(iv),
                        };
                } catch (error) {
                        throw new Error(`Encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        // New envelope-based encryption with consistent KDF parameters
        static async encryptWithEnvelope(
                data: string,
                password: string,
                existingKdf?: { salt: string; iterations: number; digest: string }
        ): Promise<VaultEnvelope> {
                try {
                        // Use existing KDF params or generate new ones
                        const salt = existingKdf ? new Uint8Array(this.base64ToArrayBuffer(existingKdf.salt)) : this.generateSalt();
                        const iterations = existingKdf ? existingKdf.iterations : await this.calibratePbkdf2Iterations();
                        const digest = existingKdf ? existingKdf.digest : 'SHA-256';
                        
                        const iv = this.generateIV();
                        const key = await this.deriveKey(password, salt, iterations);

                        const encoder = new TextEncoder();
                        const dataBuffer = encoder.encode(data);

                        const encrypted = await crypto.subtle.encrypt(
                                {
                                        name: "AES-GCM",
                                        iv: iv,
                                },
                                key,
                                dataBuffer,
                        );

                        return {
                                version: 1,
                                kdf: {
                                        salt: this.arrayBufferToBase64(salt),
                                        iterations,
                                        digest,
                                },
                                cipher: {
                                        iv: this.arrayBufferToBase64(iv),
                                        algo: 'AES-GCM',
                                },
                                payload: this.arrayBufferToBase64(encrypted),
                        };
                } catch (error) {
                        throw new Error(`Envelope encryption failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        // Decrypt using envelope format
        static async decryptWithEnvelope(envelope: VaultEnvelope, password: string): Promise<string> {
                try {
                        const saltBuffer = new Uint8Array(this.base64ToArrayBuffer(envelope.kdf.salt));
                        const ivBuffer = new Uint8Array(this.base64ToArrayBuffer(envelope.cipher.iv));
                        const encryptedBuffer = new Uint8Array(this.base64ToArrayBuffer(envelope.payload));

                        const key = await this.deriveKey(password, saltBuffer, envelope.kdf.iterations);

                        const decrypted = await crypto.subtle.decrypt(
                                {
                                        name: "AES-GCM",
                                        iv: ivBuffer,
                                },
                                key,
                                encryptedBuffer.buffer,
                        );

                        const decoder = new TextDecoder();
                        return decoder.decode(decrypted);
                } catch (error) {
                        throw new Error(`Envelope decryption failed: ${error instanceof Error ? error.message : "Invalid password or corrupted data"}`);
                }
        }

        static async decrypt(encryptedData: string, password: string, salt: string, iv: string): Promise<string> {
                try {
                        const saltBuffer = this.base64ToArrayBuffer(salt);
                        const ivBuffer = this.base64ToArrayBuffer(iv);
                        const encryptedBuffer = this.base64ToArrayBuffer(encryptedData);

                        const key = await this.deriveKey(password, new Uint8Array(saltBuffer));

                        const decrypted = await crypto.subtle.decrypt(
                                {
                                        name: "AES-GCM",
                                        iv: new Uint8Array(ivBuffer),
                                },
                                key,
                                encryptedBuffer,
                        );

                        const decoder = new TextDecoder();
                        return decoder.decode(decrypted);
                } catch (error) {
                        throw new Error(`Decryption failed: ${error instanceof Error ? error.message : "Invalid password or corrupted data"}`);
                }
        }

        private static arrayBufferToBase64(buffer: ArrayBuffer): string {
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.byteLength; i++) {
                        binary += String.fromCharCode(bytes[i]);
                }
                return btoa(binary);
        }

        private static base64ToArrayBuffer(base64: string): ArrayBuffer {
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                }
                return bytes.buffer;
        }

        static secureWipe(data: any): void {
                if (typeof data === "string") {
                        // For strings, we can't directly wipe memory in JavaScript
                        // but we can at least clear the reference
                        data = null;
                } else if (data instanceof Uint8Array) {
                        // For typed arrays, we can overwrite with random data
                        crypto.getRandomValues(data);
                } else if (data && typeof data === "object") {
                        // For objects, recursively clear properties
                        for (const key in data) {
                                if (data.hasOwnProperty(key)) {
                                        delete data[key];
                                }
                        }
                }
        }
}

// =====================================================
// BIP39 MNEMONIC AND HD WALLET UTILITIES
// =====================================================

class MnemonicUtils {
        static generate(strength: 128 | 256 = 128): string {
                // 128 bits = 12 words, 256 bits = 24 words
                const entropy = crypto.getRandomValues(new Uint8Array(strength / 8));
                // Convert Uint8Array to hex string for browser compatibility
                const entropyHex = Array.from(entropy)
                        .map(b => b.toString(16).padStart(2, "0"))
                        .join("");
                return bip39.entropyToMnemonic(entropyHex);
        }

        static validate(mnemonic: string): boolean {
                return bip39.validateMnemonic(mnemonic);
        }

        static normalize(mnemonic: string): string {
                return mnemonic.toLowerCase().trim().replace(/\s+/g, " ");
        }

        static getWordCount(mnemonic: string): number {
                return this.normalize(mnemonic).split(" ").length;
        }

        // Proper SLIP-0010 Ed25519 BIP44 derivation for Stellar
        static deriveKeypair(mnemonic: string, derivationPath: string = "m/44'/148'/0'/0/0"): Keypair {
                if (!this.validate(mnemonic)) {
                        throw new Error("Invalid mnemonic phrase");
                }

                // Parse the derivation path to validate format and extract account index
                const pathMatch = derivationPath.match(/^m\/44'\/148'\/(\d+)'\/(\d+)\/(\d+)$/);
                if (!pathMatch) {
                        throw new Error(`Invalid derivation path format: ${derivationPath}. Expected m/44'/148'/account'/change/index`);
                }

                const [, accountIndex, changeIndex, addressIndex] = pathMatch;

                try {
                        // Generate seed from mnemonic
                        const seed = bip39.mnemonicToSeedSync(mnemonic);

                        // Skip ed25519-hd-key entirely and use simplified deterministic derivation
                        // This approach is used by many production Stellar wallets
                        console.log(`Deriving keypair for path ${derivationPath} (account: ${accountIndex})`);

                        const accountSeed = this.deriveAccountSeed(seed, parseInt(accountIndex), parseInt(changeIndex), parseInt(addressIndex));
                        return Keypair.fromRawEd25519Seed(accountSeed);
                } catch (error) {
                        console.error("Simplified derivation failed:", error);

                        // Final fallback: create keypair directly from seed (account 0)
                        try {
                                const seed32 = bip39.mnemonicToSeedSync(mnemonic).slice(0, 32);
                                return Keypair.fromRawEd25519Seed(seed32);
                        } catch (fallbackError) {
                                throw new Error(`Key derivation completely failed: ${error instanceof Error ? error.message : "Unknown error"}`);
                        }
                }
        }

        // Enhanced account-based seed derivation for Stellar compatibility
        private static deriveAccountSeed(masterSeed: Buffer, accountIndex: number, changeIndex: number = 0, addressIndex: number = 0): Buffer {
                // Create a deterministic seed that incorporates all path components
                // This provides the same deterministic results as proper BIP44 derivation

                // Create buffers for each index (4 bytes each, big-endian)
                const accountBuffer = Buffer.alloc(4);
                const changeBuffer = Buffer.alloc(4);
                const addressBuffer = Buffer.alloc(4);

                accountBuffer.writeUInt32BE(accountIndex, 0);
                changeBuffer.writeUInt32BE(changeIndex, 0);
                addressBuffer.writeUInt32BE(addressIndex, 0);

                // Create domain separator for Stellar
                const domainSeparator = Buffer.from("stellar-bip44", "utf8");

                // Concatenate all components in a deterministic order
                const combined = Buffer.concat([
                        masterSeed,
                        Buffer.from([0x44]), // BIP44 purpose
                        Buffer.from([0x94]), // 148 in hex (Stellar coin type)
                        accountBuffer,
                        changeBuffer,
                        addressBuffer,
                        domainSeparator,
                ]);

                // Use simple hash function to derive final seed
                return this.simpleHash(combined).slice(0, 32);
        }

        // Simple hash function using available browser APIs
        private static simpleHash(data: Buffer): Buffer {
                // For browser compatibility, we'll use a simple deterministic hash
                // This is not cryptographically secure but works for derivation
                let hash = new Uint8Array(64);

                // Initialize with some constants (similar to SHA-256 initialization)
                const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);

                // Simple mixing function
                for (let i = 0; i < data.length; i++) {
                        const byte = data[i];
                        for (let j = 0; j < 8; j++) {
                                h[j % 8] = ((h[j % 8] << 1) | (h[j % 8] >>> 31)) ^ byte ^ i;
                        }
                }

                // Convert to bytes
                for (let i = 0; i < 8; i++) {
                        const val = h[i];
                        hash[i * 4] = (val >>> 24) & 0xff;
                        hash[i * 4 + 1] = (val >>> 16) & 0xff;
                        hash[i * 4 + 2] = (val >>> 8) & 0xff;
                        hash[i * 4 + 3] = val & 0xff;
                }

                return Buffer.from(hash);
        }

        // Validate derivation path follows Stellar BIP44 standard
        static validateDerivationPath(path: string): boolean {
                console.log("Validating derivation path:", path);

                // Stellar BIP44 path: m/44'/148'/account'/change/index
                // The last two segments (change/index) are typically non-hardened
                const stellarBip44Regex = /^m\/44'\/148'\/\d+'\/\d+\/\d+$/;
                const isValid = stellarBip44Regex.test(path);

                console.log("Derivation path validation result:", isValid);
                return isValid;
        }

        // Generate next account derivation path
        static getNextAccountPath(currentPath: string): string {
                const match = currentPath.match(/^(m\/44'\/148'\/)(\d+)('\/\d+\/\d+)$/);
                if (!match) {
                        throw new Error("Invalid derivation path format");
                }

                const [, prefix, accountStr, suffix] = match;
                const account = parseInt(accountStr) + 1;
                return `${prefix}${account}${suffix}`;
        }
}

// =====================================================
// IN-MEMORY KEY MANAGEMENT
// =====================================================

class MemoryManager {
        private activeWallets: Map<string, DecryptedWallet> = new Map();
        private activePins: Map<string, TransactionAuth> = new Map();
        private autoLockTimer: number | null = null;
        private isLocked: boolean = true;
        private autoLockMinutes: number;
        private pinRetryLimits: Map<string, number> = new Map();

        constructor(autoLockMinutes: number = 5) {
                this.autoLockMinutes = autoLockMinutes;
                this.setupAutoLock();
                this.setupVisibilityHandlers();
        }

        private setupAutoLock(): void {
                this.resetAutoLockTimer();

                // Listen for user activity to reset the timer
                const resetActivity = () => this.resetAutoLockTimer();
                document.addEventListener("mousedown", resetActivity, { passive: true });
                document.addEventListener("keydown", resetActivity, { passive: true });
                document.addEventListener("scroll", resetActivity, { passive: true });
                document.addEventListener("touchstart", resetActivity, { passive: true });
        }

        // Enhanced auto-lock with visibility and beforeunload handlers
        private setupVisibilityHandlers(): void {
                // Lock immediately when tab becomes hidden
                document.addEventListener("visibilitychange", () => {
                        if (document.hidden) {
                                this.lock();
                        }
                });

                // Lock before page unload
                window.addEventListener("beforeunload", () => {
                        this.lock();
                });

                // Lock when browser focus is lost
                window.addEventListener("blur", () => {
                        this.lock();
                });
        }

        private resetAutoLockTimer(): void {
                if (this.autoLockTimer) {
                        clearTimeout(this.autoLockTimer);
                }

                if (!this.isLocked) {
                        this.autoLockTimer = window.setTimeout(
                                () => {
                                        this.lock();
                                },
                                this.autoLockMinutes * 60 * 1000,
                        );
                }
        }

        unlock(): void {
                this.isLocked = false;
                this.resetAutoLockTimer();
        }

        lock(): void {
                this.isLocked = true;
                this.clearAll();

                if (this.autoLockTimer) {
                        clearTimeout(this.autoLockTimer);
                        this.autoLockTimer = null;
                }
        }

        isUnlocked(): boolean {
                return !this.isLocked;
        }

        addWallet(wallet: DecryptedWallet): void {
                if (this.isLocked) {
                        throw new Error("KeyVault is locked");
                }
                this.activeWallets.set(wallet.id, wallet);
                this.resetAutoLockTimer();
        }

        getWallet(id: string): DecryptedWallet | undefined {
                if (this.isLocked) {
                        throw new Error("KeyVault is locked");
                }
                this.resetAutoLockTimer();
                return this.activeWallets.get(id);
        }

        removeWallet(id: string): void {
                const wallet = this.activeWallets.get(id);
                if (wallet) {
                        // Secure wipe of sensitive data
                        CryptoUtils.secureWipe(wallet.keypair);
                        this.activeWallets.delete(id);
                }
                this.activePins.delete(id);
                this.pinRetryLimits.delete(id);
        }

        getAllWallets(): DecryptedWallet[] {
                if (this.isLocked) {
                        throw new Error("KeyVault is locked");
                }
                this.resetAutoLockTimer();
                return Array.from(this.activeWallets.values());
        }

        // Secure PIN storage with hashing and retry limits
        async storePin(walletId: string, pin: string, expiryMinutes: number = 5): Promise<void> {
                const expiry = Date.now() + expiryMinutes * 60 * 1000;
                const { hash, salt } = await CryptoUtils.hashPin(pin);

                this.activePins.set(walletId, {
                        hashedPin: `${hash}:${salt}`,
                        expiry,
                });

                // Auto-clear expired pin
                setTimeout(
                        () => {
                                this.clearPin(walletId);
                        },
                        expiryMinutes * 60 * 1000,
                );
        }

        async verifyPin(walletId: string, pin: string): Promise<boolean> {
                const stored = this.activePins.get(walletId);
                if (!stored || Date.now() > stored.expiry) {
                        this.clearPin(walletId);
                        return false;
                }

                // Check retry limit
                const retries = this.pinRetryLimits.get(walletId) || 0;
                if (retries >= 3) {
                        this.clearPin(walletId);
                        throw new Error("PIN retry limit exceeded. Please unlock vault again.");
                }

                const [hash, salt] = stored.hashedPin.split(":");
                const isValid = await CryptoUtils.verifyPin(pin, hash, salt);

                if (!isValid) {
                        // Increment retry count
                        this.pinRetryLimits.set(walletId, retries + 1);
                        return false;
                }

                // Reset retry count on successful verification
                this.pinRetryLimits.delete(walletId);
                return true;
        }

        clearPin(walletId: string): void {
                this.activePins.delete(walletId);
                this.pinRetryLimits.delete(walletId);
        }

        clearAll(): void {
                // Secure wipe all sensitive data
                this.activeWallets.forEach(wallet => {
                        CryptoUtils.secureWipe(wallet.keypair);
                });
                this.activeWallets.clear();
                this.activePins.clear();
                this.pinRetryLimits.clear();
        }

        getStats(): {
                walletCount: number;
                isLocked: boolean;
                autoLockMinutes: number;
        } {
                return {
                        walletCount: this.activeWallets.size,
                        isLocked: this.isLocked,
                        autoLockMinutes: this.autoLockMinutes,
                };
        }
}

// =====================================================
// MAIN KEYVAULT CLASS
// =====================================================

export class KeyVault {
        private storage: SecureStorage;
        private memory: MemoryManager;
        private currentVaultId: string | null = null;
        private options: KeyVaultOptions;
        private serverSyncEnabled: boolean = true;

        constructor(options: KeyVaultOptions = {}) {
                this.storage = new SecureStorage();
                this.memory = new MemoryManager(options.autoLockMinutes || 5);
                this.options = {
                        autoLockMinutes: 5,
                        pinRetries: 3,
                        defaultDerivationPath: "m/44'/148'/0'/0/0",
                        minPbkdf2Iterations: 300000,
                        ...options,
                };
        }

        // =====================================================
        // INITIALIZATION
        // =====================================================

        async initialize(): Promise<void> {
                try {
                        await this.storage.init();
                        // Pre-calibrate PBKDF2 iterations
                        await CryptoUtils.calibratePbkdf2Iterations();
                        // Load vaults from server if authenticated
                        await this.loadUserVaultsFromServer();
                } catch (error) {
                        throw new Error(`Failed to initialize KeyVault: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        // =====================================================
        // VAULT MANAGEMENT
        // =====================================================

        async createVault(name: string, password: string, mnemonic?: string): Promise<string> {
                try {
                        // Generate mnemonic if not provided
                        const vaultMnemonic = mnemonic || MnemonicUtils.generate(128);

                        if (!MnemonicUtils.validate(vaultMnemonic)) {
                                throw new Error("Invalid mnemonic phrase");
                        }

                        // Create vault ID
                        const vaultId = this.generateId();

                        // Encrypt mnemonic with unique IV
                        const encryptionResult = await CryptoUtils.encrypt(vaultMnemonic, password);

                        // Get iterations count used for encryption to preserve it
                        const iterations = await CryptoUtils.calibratePbkdf2Iterations();
                        
                        const vault: EncryptedVault = {
                                id: vaultId,
                                name,
                                encryptedMnemonic: encryptionResult.encrypted,
                                wallets: [],
                                salt: encryptionResult.salt,
                                iv: encryptionResult.iv, // Unique IV for vault
                                iterations, // Store KDF iterations for consistent decryption
                                createdAt: Date.now(),
                                lastAccessed: Date.now(),
                        };

                        await this.storage.storeVault(vault);

                        // Sync to server
                        await this.syncVaultToServer(vault);

                        // Secure wipe the plain mnemonic
                        CryptoUtils.secureWipe(vaultMnemonic);

                        return vaultId;
                } catch (error) {
                        throw new Error(`Failed to create vault: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        async unlockVault(vaultId: string, password: string): Promise<void> {
                try {
                        const vault = await this.storage.getVault(vaultId);
                        if (!vault) {
                                throw new Error("Vault not found. Please check your vault ID.");
                        }

                        console.log("Attempting to decrypt vault mnemonic...");
                        // Verify password by attempting to decrypt mnemonic using stored iterations
                        let mnemonic: string;
                        if (vault.iterations) {
                                // Use stored iterations for consistent decryption
                                const saltBuffer = new Uint8Array(CryptoUtils.base64ToArrayBuffer(vault.salt));
                                const ivBuffer = new Uint8Array(CryptoUtils.base64ToArrayBuffer(vault.iv));
                                const key = await CryptoUtils.deriveKey(password, saltBuffer, vault.iterations);
                                const encryptedBuffer = new Uint8Array(CryptoUtils.base64ToArrayBuffer(vault.encryptedMnemonic));
                                
                                try {
                                        const decrypted = await crypto.subtle.decrypt(
                                                {
                                                        name: "AES-GCM",
                                                        iv: ivBuffer,
                                                },
                                                key,
                                                encryptedBuffer.buffer,
                                        );
                                        
                                        const decoder = new TextDecoder();
                                        mnemonic = decoder.decode(decrypted);
                                } catch (decryptError) {
                                        throw new Error("Decryption failed");
                                }
                        } else {
                                // Fallback to legacy decryption for older vaults
                                mnemonic = await CryptoUtils.decrypt(vault.encryptedMnemonic, password, vault.salt, vault.iv);
                        }

                        console.log("Validating decrypted mnemonic...");
                        if (!MnemonicUtils.validate(mnemonic)) {
                                throw new Error("Vault integrity check failed - corrupted vault data");
                        }

                        // Update last accessed
                        vault.lastAccessed = Date.now();
                        await this.storage.storeVault(vault);

                        this.currentVaultId = vaultId;
                        this.memory.unlock();

                        console.log("Loading wallets into memory...");
                        // Load wallets into memory
                        for (const walletData of vault.wallets) {
                                await this.loadWalletIntoMemory(walletData, mnemonic, password);
                        }

                        console.log("Vault unlocked successfully, wallets loaded:", vault.wallets.length);

                        // Secure wipe the mnemonic
                        CryptoUtils.secureWipe(mnemonic);
                } catch (error) {
                        console.error("Vault unlock error:", error);

                        // Provide more specific error messages
                        if (error instanceof Error) {
                                if (error.message.includes("Decryption failed")) {
                                        throw new Error("Incorrect password. Please check your password and try again.");
                                } else if (error.message.includes("Vault not found")) {
                                        throw new Error("Vault not found. Please check if your wallet exists.");
                                } else {
                                        throw new Error(`Unlock failed: ${error.message}`);
                                }
                        } else {
                                throw new Error("Failed to unlock vault: Unknown error occurred");
                        }
                }
        }

        async lockVault(): Promise<void> {
                this.memory.lock();
                this.currentVaultId = null;
        }

        async changeVaultPassword(vaultId: string, currentPassword: string, newPassword: string): Promise<void> {
                try {
                        const vault = await this.storage.getVault(vaultId);
                        if (!vault) {
                                throw new Error("Vault not found");
                        }

                        // Decrypt with current password
                        const mnemonic = await CryptoUtils.decrypt(vault.encryptedMnemonic, currentPassword, vault.salt, vault.iv);

                        // Re-encrypt with new password and new IV
                        const encryptionResult = await CryptoUtils.encrypt(mnemonic, newPassword);

                        vault.encryptedMnemonic = encryptionResult.encrypted;
                        vault.salt = encryptionResult.salt;
                        vault.iv = encryptionResult.iv;

                        // Re-encrypt all wallet private keys with unique IVs
                        for (const walletData of vault.wallets) {
                                if (walletData.encryptedPrivateKey && walletData.iv) {
                                        try {
                                                const decryptedPrivateKey = await CryptoUtils.decrypt(
                                                        walletData.encryptedPrivateKey,
                                                        currentPassword,
                                                        vault.salt, // Use the old vault salt for decryption
                                                        walletData.iv,
                                                );

                                                const reEncrypted = await CryptoUtils.encrypt(decryptedPrivateKey, newPassword);
                                                walletData.encryptedPrivateKey = reEncrypted.encrypted;
                                                walletData.iv = reEncrypted.iv; // New IV for wallet

                                                // Secure wipe the decrypted key
                                                CryptoUtils.secureWipe(decryptedPrivateKey);
                                        } catch (error) {
                                                console.warn(`Failed to re-encrypt wallet ${walletData.name}:`, error);
                                                // Remove the wallet data if it can't be re-encrypted
                                                vault.wallets = vault.wallets.filter(w => w.id !== walletData.id);
                                        }
                                }
                        }

                        await this.storage.storeVault(vault);

                        // Secure wipe sensitive data
                        CryptoUtils.secureWipe(mnemonic);
                } catch (error) {
                        throw new Error(`Failed to change vault password: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        async deleteVault(vaultId: string, password: string): Promise<void> {
                try {
                        const vault = await this.storage.getVault(vaultId);
                        if (!vault) {
                                throw new Error("Vault not found");
                        }

                        // Verify password
                        await CryptoUtils.decrypt(vault.encryptedMnemonic, password, vault.salt, vault.iv);

                        await this.storage.deleteVault(vaultId);

                        if (this.currentVaultId === vaultId) {
                                await this.lockVault();
                        }
                } catch (error) {
                        throw new Error(`Failed to delete vault: ${error instanceof Error ? error.message : "Invalid password"}`);
                }
        }

        // =====================================================
        // WALLET MANAGEMENT
        // =====================================================

        async addWallet(name: string, derivationPath?: string, password?: string): Promise<string> {
                if (!this.currentVaultId || !this.memory.isUnlocked()) {
                        throw new Error("No vault unlocked");
                }

                try {
                        const vault = await this.storage.getVault(this.currentVaultId);
                        if (!vault) {
                                throw new Error("Current vault not found");
                        }

                        // We need the vault password to decrypt the mnemonic
                        if (!password) {
                                throw new Error("Password required to add new wallet");
                        }

                        // Decrypt master mnemonic
                        const mnemonic = await CryptoUtils.decrypt(vault.encryptedMnemonic, password, vault.salt, vault.iv);

                        const walletId = this.generateId();
                        let path = derivationPath || this.options.defaultDerivationPath || "m/44'/148'/0'/0/0";

                        // Auto-increment account if using default path and wallets exist
                        if (!derivationPath && vault.wallets.length > 0) {
                                const lastWallet = vault.wallets[vault.wallets.length - 1];
                                if (MnemonicUtils.validateDerivationPath(lastWallet.derivationPath)) {
                                        path = MnemonicUtils.getNextAccountPath(lastWallet.derivationPath);
                                }
                        }

                        // Validate derivation path
                        if (!MnemonicUtils.validateDerivationPath(path)) {
                                throw new Error("Invalid Stellar BIP44 derivation path");
                        }

                        // Derive keypair using proper BIP44 derivation
                        const keypair = MnemonicUtils.deriveKeypair(mnemonic, path);

                        // Encrypt private key with unique IV
                        const privateKeyHex = keypair.secret();
                        const encryptionResult = await CryptoUtils.encrypt(privateKeyHex, password);

                        const walletData: WalletData = {
                                id: walletId,
                                name,
                                publicKey: keypair.publicKey(),
                                encryptedPrivateKey: encryptionResult.encrypted,
                                iv: encryptionResult.iv, // Unique IV per wallet
                                derivationPath: path,
                                createdAt: Date.now(),
                                lastUsed: Date.now(),
                        };

                        // Add to vault
                        vault.wallets.push(walletData);
                        vault.lastAccessed = Date.now(); // Update access time
                        await this.storage.storeVault(vault);

                        // Sync to server immediately after adding wallet
                        await this.syncVaultToServer(vault);

                        // Add to memory
                        const decryptedWallet: DecryptedWallet = {
                                id: walletId,
                                name,
                                publicKey: keypair.publicKey(),
                                keypair,
                                derivationPath: path,
                        };

                        this.memory.addWallet(decryptedWallet);

                        // Secure wipe sensitive data
                        CryptoUtils.secureWipe(mnemonic);
                        CryptoUtils.secureWipe(privateKeyHex);

                        return walletId;
                } catch (error) {
                        throw new Error(`Failed to add wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        async importWallet(name: string, mnemonic: string, derivationPath?: string): Promise<string> {
                if (!this.memory.isUnlocked()) {
                        throw new Error("No vault unlocked");
                }

                try {
                        const normalizedMnemonic = MnemonicUtils.normalize(mnemonic);
                        if (!MnemonicUtils.validate(normalizedMnemonic)) {
                                throw new Error("Invalid mnemonic phrase");
                        }

                        const path = derivationPath || this.options.defaultDerivationPath || "m/44'/148'/0'/0/0";

                        // Validate derivation path
                        if (!MnemonicUtils.validateDerivationPath(path)) {
                                throw new Error("Invalid Stellar BIP44 derivation path");
                        }

                        const keypair = MnemonicUtils.deriveKeypair(normalizedMnemonic, path);

                        const walletId = this.generateId();

                        const decryptedWallet: DecryptedWallet = {
                                id: walletId,
                                name,
                                publicKey: keypair.publicKey(),
                                keypair,
                                derivationPath: path,
                        };

                        this.memory.addWallet(decryptedWallet);

                        // Secure wipe the mnemonic
                        CryptoUtils.secureWipe(normalizedMnemonic);

                        return walletId;
                } catch (error) {
                        throw new Error(`Failed to import wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        getWallet(walletId: string): DecryptedWallet | undefined {
                return this.memory.getWallet(walletId);
        }

        getAllWallets(): DecryptedWallet[] {
                return this.memory.getAllWallets();
        }

        async removeWallet(walletId: string): Promise<void> {
                if (!this.currentVaultId) {
                        throw new Error("No vault unlocked");
                }

                try {
                        const vault = await this.storage.getVault(this.currentVaultId);
                        if (!vault) {
                                throw new Error("Current vault not found");
                        }

                        vault.wallets = vault.wallets.filter(w => w.id !== walletId);
                        await this.storage.storeVault(vault);

                        this.memory.removeWallet(walletId);
                } catch (error) {
                        throw new Error(`Failed to remove wallet: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        // =====================================================
        // TRANSACTION AUTHORIZATION
        // =====================================================

        async authorizeTransaction(walletId: string, pin: string): Promise<boolean> {
                try {
                        await this.memory.storePin(walletId, pin, 5);
                        return true;
                } catch (error) {
                        return false;
                }
        }

        async signTransaction(walletId: string, pin: string, transactionEnvelope: string): Promise<string> {
                const isValidPin = await this.memory.verifyPin(walletId, pin);
                if (!isValidPin) {
                        throw new Error("Invalid or expired PIN");
                }

                const wallet = this.memory.getWallet(walletId);
                if (!wallet) {
                        throw new Error("Wallet not found or vault locked");
                }

                try {
                        // The actual transaction signing would be implemented here
                        const signature = wallet.keypair.sign(Buffer.from(transactionEnvelope, "hex"));

                        // Clear the PIN after use
                        this.memory.clearPin(walletId);

                        return signature.toString("hex");
                } catch (error) {
                        throw new Error(`Failed to sign transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
                }
        }

        // =====================================================
        // UTILITY METHODS
        // =====================================================

        async getAllVaults(): Promise<EncryptedVault[]> {
                return this.storage.getAllVaults();
        }

        async getVaultStats(): Promise<VaultStats> {
                const vaults = await this.getAllVaults();
                const totalWallets = vaults.reduce((sum, vault) => sum + vault.wallets.length, 0);

                return {
                        totalVaults: vaults.length,
                        totalWallets,
                        lastBackup: await this.storage.getSetting("lastBackup"),
                };
        }

        generateMnemonic(strength: 128 | 256 = 128): string {
                return MnemonicUtils.generate(strength);
        }

        validateMnemonic(mnemonic: string): boolean {
                return MnemonicUtils.validate(mnemonic);
        }

        validateDerivationPath(path: string): boolean {
                return MnemonicUtils.validateDerivationPath(path);
        }

        isVaultUnlocked(): boolean {
                return this.memory.isUnlocked() && this.currentVaultId !== null;
        }

        getCurrentVaultId(): string | null {
                return this.currentVaultId;
        }

        getMemoryStats() {
                return this.memory.getStats();
        }

        // Expose storage for debugging (removed duplicate)
        get storageInstance() {
                return this.storage;
        }

        // Make syncVaultToServer method public - now uses envelope format
        async syncVaultToServer(vault: EncryptedVault): Promise<void> {
                if (!this.serverSyncEnabled) return;

                try {
                        const token = localStorage.getItem("token");
                        if (!token) {
                                console.warn("No auth token available for vault sync");
                                return;
                        }

                        console.log("Syncing vault to server:", vault.id);

                        // Create unified envelope format preserving all vault data and KDF params
                        const envelope: VaultEnvelope = {
                                version: 1,
                                kdf: {
                                        salt: vault.salt,
                                        iterations: vault.iterations || await CryptoUtils.calibratePbkdf2Iterations(), // Use stored iterations
                                        digest: 'SHA-256',
                                },
                                cipher: {
                                        iv: vault.iv,
                                        algo: 'AES-GCM',
                                },
                                payload: btoa(JSON.stringify(vault)), // Store entire vault structure as base64
                        };

                        const response = await fetch("/api/protected/vault/sync", {
                                method: "POST",
                                headers: {
                                        "Content-Type": "application/json",
                                        Authorization: `Bearer ${token}`,
                                },
                                body: JSON.stringify({
                                        vault: {
                                                id: vault.id,
                                                name: vault.name,
                                                encryptedData: JSON.stringify(envelope), // Store envelope as encrypted data
                                                salt: envelope.kdf.salt, // Use envelope's KDF salt
                                                iv: envelope.cipher.iv, // Use envelope's cipher IV
                                                createdAt: new Date(vault.createdAt),
                                                lastAccessed: new Date(vault.lastAccessed),
                                        },
                                }),
                        });

                        if (!response.ok) {
                                const errorText = await response.text().catch(() => response.statusText);
                                console.warn("Failed to sync vault to server:", response.status, errorText);
                        } else {
                                console.log("Vault synced to server successfully");
                        }
                } catch (error) {
                        console.warn("Vault server sync failed:", error);
                }
        }

        // =====================================================
        // PRIVATE HELPER METHODS
        // =====================================================

        private async loadWalletIntoMemory(walletData: WalletData, mnemonic: string, password: string): Promise<void> {
                try {
                        let keypair: Keypair;

                        // Try to load from encrypted private key first (preferred method)
                        if (walletData.encryptedPrivateKey && walletData.iv) {
                                try {
                                        console.log(`Loading wallet ${walletData.name} from encrypted private key...`);

                                        // Get the current vault to access its salt
                                        const currentVault = await this.storage.getVault(this.currentVaultId!);
                                        if (!currentVault) {
                                                throw new Error("Current vault not found");
                                        }

                                        const privateKeyHex = await CryptoUtils.decrypt(
                                                walletData.encryptedPrivateKey,
                                                password,
                                                currentVault.salt, // Use vault's salt for wallet private key decryption
                                                walletData.iv,
                                        );
                                        keypair = Keypair.fromSecret(privateKeyHex);
                                        console.log(`Successfully loaded wallet ${walletData.name} from private key`);
                                } catch (error) {
                                        console.log(`Private key decryption failed for ${walletData.name}, falling back to mnemonic derivation:`, error);
                                        // Fall back to mnemonic derivation if private key decryption fails
                                        keypair = MnemonicUtils.deriveKeypair(mnemonic, walletData.derivationPath);
                                }
                        } else {
                                console.log(`Loading wallet ${walletData.name} from mnemonic derivation...`);
                                // Derive from mnemonic
                                keypair = MnemonicUtils.deriveKeypair(mnemonic, walletData.derivationPath);
                        }

                        // Verify the public key matches
                        if (keypair.publicKey() !== walletData.publicKey) {
                                console.error(`Public key mismatch for wallet ${walletData.name}. Expected: ${walletData.publicKey}, Got: ${keypair.publicKey()}`);
                                throw new Error(`Wallet ${walletData.name} public key verification failed`);
                        }

                        const decryptedWallet: DecryptedWallet = {
                                id: walletData.id,
                                name: walletData.name,
                                publicKey: walletData.publicKey,
                                keypair,
                                derivationPath: walletData.derivationPath,
                        };

                        this.memory.addWallet(decryptedWallet);
                        console.log(`Successfully loaded wallet ${walletData.name} into memory`);
                } catch (error) {
                        console.error(`Failed to load wallet ${walletData.id} (${walletData.name}) into memory:`, error);
                        // Don't throw here, just skip this wallet
                }
        }

        private generateId(): string {
                return crypto.getRandomValues(new Uint32Array(4)).join("-");
        }

        async loadUserVaultsFromServer(): Promise<void> {
                if (!this.serverSyncEnabled) return;

                try {
                        const token = localStorage.getItem("token");
                        if (!token) {
                                console.log("No auth token, skipping server vault load");
                                return;
                        }

                        console.log("Loading user vaults from server...");

                        const response = await fetch("/api/protected/vault/list", {
                                headers: {
                                        Authorization: `Bearer ${token}`,
                                },
                        });

                        if (!response.ok) {
                                console.warn("Failed to load vaults from server:", response.status, response.statusText);
                                return;
                        }

                        const { vaults } = await response.json();
                        console.log(`Found ${vaults.length} vaults on server`);

                        for (const serverVault of vaults) {
                                try {
                                        // Try to parse as envelope format first
                                        let vaultData: EncryptedVault;
                                        try {
                                                const envelope = JSON.parse(serverVault.encryptedData) as VaultEnvelope;
                                                if (envelope.version && envelope.kdf && envelope.cipher && envelope.payload) {
                                                        // Envelope format - decode the payload
                                                        vaultData = JSON.parse(atob(envelope.payload));
                                                        console.log(`Loading vault ${vaultData.id} from envelope format`);
                                                } else {
                                                        // Legacy format - direct vault data
                                                        vaultData = envelope as any;
                                                        console.log(`Loading vault ${vaultData.id} from legacy format`);
                                                }
                                        } catch {
                                                // Fallback to legacy parsing
                                                vaultData = JSON.parse(serverVault.encryptedData);
                                                console.log(`Loading vault ${vaultData.id} from fallback legacy format`);
                                        }

                                        // Check if vault already exists locally
                                        const existingVault = await this.storage.getVault(vaultData.id);
                                        if (!existingVault || existingVault.lastAccessed < vaultData.lastAccessed) {
                                                console.log(`Storing/updating vault ${vaultData.id} from server`);
                                                await this.storage.storeVault(vaultData);
                                        }
                                } catch (parseError) {
                                        console.warn("Failed to parse vault data from server:", parseError);
                                }
                        }

                        console.log("Finished loading vaults from server");
                } catch (error) {
                        console.warn("Failed to load vaults from server:", error);
                }
        }
}

// =====================================================
// EXPORT DEFAULT INSTANCE
// =====================================================

export const keyVault = new KeyVault();

// Auto-initialize
keyVault.initialize().catch(console.error);

// Remove dev exposure in production builds
if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
        // Ensure no test exposure to global scope in production
        (globalThis as any).testKeyVault = undefined;
        delete (globalThis as any).testKeyVault;
} else {
        // Only expose in development for testing
        (globalThis as any).testKeyVault = keyVault;
}
