import { Keypair, Networks, TransactionBuilder, Operation, Asset, Horizon } from "stellar-sdk";
import { storage } from "../storage";

const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_SERVER_URL = STELLAR_NETWORK === "mainnet" 
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

const server = new Horizon.Server(STELLAR_SERVER_URL);
const networkPassphrase = STELLAR_NETWORK === "mainnet" 
  ? Networks.PUBLIC 
  : Networks.TESTNET;

export class StellarService {
  generateKeypair(): Keypair {
    return Keypair.random();
  }

  async getXLMBalance(userId: string): Promise<number> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(user.stellarPublicKey);
      const xlmBalance = account.balances.find(balance => balance.asset_type === "native");
      
      return parseFloat(xlmBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching XLM balance:", error);
      return 0;
    }
  }

  async getDOPEBalance(userId: string): Promise<number> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(user.stellarPublicKey);
      const dopeBalance = account.balances.find(balance => 
        balance.asset_type === "credit_alphanum4" && 
        balance.asset_code === "DOPE"
      );
      
      return parseFloat(dopeBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching DOPE balance:", error);
      return 0;
    }
  }

  async createUserToken(userId: string): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const sourceKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const account = await server.loadAccount(sourceKeypair.publicKey());

      // For testnet, fund the account first
      if (STELLAR_NETWORK === "testnet") {
        try {
          await server.friendbot(sourceKeypair.publicKey()).call();
        } catch (error) {
          // Account might already be funded
          console.log("Account funding skipped:", error);
        }
      }

      // Create DOPE asset
      const dopeAsset = new Asset("DOPE", sourceKeypair.publicKey());
      
      // Create transaction to trust DOPE asset
      const transaction = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(Operation.changeTrust({
          asset: dopeAsset,
        }))
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      await server.submitTransaction(transaction);

      console.log(`DOPE token setup completed for user ${userId}`);
    } catch (error) {
      console.error("Error creating user token:", error);
      // Don't throw error to prevent blocking user registration
    }
  }

  async sendTokens(userId: string, toAddress: string, amount: string, assetType: "XLM" | "DOPE"): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const sourceKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const account = await server.loadAccount(sourceKeypair.publicKey());

      let asset: Asset;
      if (assetType === "XLM") {
        asset = Asset.native();
      } else {
        asset = new Asset("DOPE", sourceKeypair.publicKey());
      }

      const transaction = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: toAddress,
          asset: asset,
          amount: amount,
        }))
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      const result = await server.submitTransaction(transaction);

      // Record transaction in database
      await storage.createTransaction({
        userId,
        type: "send",
        amount: amount,
        fromAddress: sourceKeypair.publicKey(),
        toAddress,
        stellarTxId: result.hash,
        status: "completed",
        metadata: { assetType },
      });

      return {
        hash: result.hash,
        status: "completed",
        amount,
        assetType,
      };
    } catch (error) {
      console.error("Error sending tokens:", error);
      throw new Error("Failed to send tokens");
    }
  }

  async issueDopeTokens(userId: string, amount: string): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey || !user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const issuerKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const account = await server.loadAccount(issuerKeypair.publicKey());

      const dopeAsset = new Asset("DOPE", issuerKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: user.stellarPublicKey,
          asset: dopeAsset,
          amount: amount,
        }))
        .setTimeout(30)
        .build();

      transaction.sign(issuerKeypair);
      const result = await server.submitTransaction(transaction);

      // Record mining reward transaction
      await storage.createTransaction({
        userId,
        type: "mining_reward",
        amount: amount,
        toAddress: user.stellarPublicKey,
        stellarTxId: result.hash,
        status: "completed",
        metadata: { source: "mining" },
      });

      // Update wallet balance
      const wallet = await storage.getWallet(userId);
      const newBalance = (parseFloat(wallet?.dopeBalance || "0") + parseFloat(amount)).toString();
      await storage.updateWallet(userId, {
        dopeBalance: newBalance,
        lastUpdated: new Date(),
      });

      console.log(`Issued ${amount} DOPE tokens to user ${userId}`);
    } catch (error) {
      console.error("Error issuing DOPE tokens:", error);
      throw error;
    }
  }
}

export const stellarService = new StellarService();
