import { Keypair } from "@stellar/stellar-sdk";
import bip39 from "bip39";
import crypto from "crypto";

class KeypairGenerator {
    private keypair: Keypair | any;
    private mnemonic: string | null;

    constructor() {
        this.keypair = null;
        this.mnemonic = null;
    }

    /**
     * Generate a new Stellar keypair with recovery passphrase
     * @param {number} mnemonicLength - Length of mnemonic (12, 15, 18, 21, or 24 words)
     * @returns {Object} Contains keypair details and mnemonic
     */
    generateKeypair(mnemonicLength = 12) {
        try {
            // Validate mnemonic length
            const validLengths = [12, 15, 18, 21, 24];
            if (!validLengths.includes(mnemonicLength)) {
                throw new Error(
                    "Mnemonic length must be 12, 15, 18, 21, or 24 words",
                );
            }

            // Calculate entropy bits based on mnemonic length
            const entropyBits = (mnemonicLength * 11 - mnemonicLength / 3) / 1;
            const entropyBytes = Math.ceil(entropyBits / 8);

            // Generate cryptographically secure random entropy
            const entropy = crypto.randomBytes(entropyBytes);

            // Generate mnemonic from entropy
            this.mnemonic = bip39.entropyToMnemonic(entropy);

            // Derive seed from mnemonic
            const seed = bip39.mnemonicToSeedSync(this.mnemonic);

            // Use first 32 bytes of seed as private key
            const privateKey = seed.slice(0, 32);

            // Create Stellar keypair from the derived private key
            this.keypair = Keypair.fromRawEd25519Seed(privateKey);

            return this.getKeypairInfo();
        } catch (error: any) {
            console.error("Error generating keypair:", error.message);
            throw error;
        }
    }

    /**
     * Restore keypair from mnemonic passphrase
     * @param {string} mnemonic - BIP39 mnemonic phrase
     * @returns {Object} Restored keypair details
     */
    restoreFromMnemonic(mnemonic: any) {
        try {
            // Validate mnemonic
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error("Invalid mnemonic passphrase");
            }

            this.mnemonic = mnemonic;

            // Derive seed from mnemonic
            const seed = bip39.mnemonicToSeedSync(mnemonic);

            // Use first 32 bytes of seed as private key
            const privateKey = seed.slice(0, 32);

            // Restore Stellar keypair
            this.keypair = Keypair.fromRawEd25519Seed(privateKey);

            return this.getKeypairInfo();
        } catch (error: any) {
            console.error("Error restoring keypair:", error.message);
            throw error;
        }
    }

    getKeypair() {
        return this.keypair;
    }

    /**
     * Get formatted keypair information
     * @returns {Object} Keypair details
     */
    getKeypairInfo() {
        if (!this.keypair || !this.mnemonic) {
            throw new Error(
                "No keypair generated. Call generateKeypair() first.",
            );
        }

        return {
            publicKey: this.keypair.publicKey(),
            secretKey: this.keypair.secret(),
            mnemonic: this.mnemonic,
            mnemonicWordCount: this.mnemonic.split(" ").length,
            accountId: this.keypair.publicKey(), // Same as public key for Stellar
        };
    }

    /**
     * Display keypair information in a formatted way
     */
    displayKeypairInfo() {
        const info = this.getKeypairInfo();

        console.log("\n" + "=".repeat(80));
        console.log("🌟 STELLAR KEYPAIR GENERATED SUCCESSFULLY 🌟");
        console.log("=".repeat(80));

        console.log("\n📝 RECOVERY PASSPHRASE (BIP39 Mnemonic):");
        console.log("┌" + "─".repeat(78) + "┐");
        console.log("│ " + info.mnemonic.padEnd(76) + " │");
        console.log("└" + "─".repeat(78) + "┘");
        console.log(
            `   ⚠️  Keep this ${info.mnemonicWordCount}-word phrase SAFE and PRIVATE!`,
        );

        console.log("\n🔑 PUBLIC KEY (Account ID):");
        console.log("   " + info.publicKey);

        console.log("\n🔐 SECRET KEY (Private Key):");
        console.log("   " + info.secretKey);

        console.log(
            "\n" + "⚠️".repeat(20) + " SECURITY WARNING " + "⚠️".repeat(20),
        );
        console.log(
            "• NEVER share your secret key or mnemonic phrase with anyone",
        );
        console.log("• Store your recovery phrase in a secure location");
        console.log("• Consider using a hardware wallet for large amounts");
        console.log("• This keypair works on Stellar Mainnet and Testnet");
        console.log("=".repeat(80) + "\n");
    }

    /**
     * Save keypair to file (optional)
     * @param {string} filename - Output filename
     */
    saveToFile(filename = "stellar-keypair.json") {
        const fs = require("fs");
        const info = this.getKeypairInfo();

        const data = {
            timestamp: new Date().toISOString(),
            network: "Stellar",
            ...info,
        };

        fs.writeFileSync(filename, JSON.stringify(data, null, 2));
        console.log(`✅ Keypair saved to ${filename}`);
    }
}

// Export for use as module
export { KeypairGenerator };
