import { Keypair, Networks, TransactionBuilder, Operation, Asset, Horizon } from "stellar-sdk";
import { storage } from "../storage";

const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_SERVER_URL = STELLAR_NETWORK === "mainnet" 
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

// Platform DOPE token issuer (should be in environment variables in production)
const DOPE_ISSUER_SECRET = process.env.DOPE_ISSUER_SECRET || Keypair.random().secret();
const DOPE_DISTRIBUTOR_SECRET = process.env.DOPE_DISTRIBUTOR_SECRET || Keypair.random().secret();

const dopeIssuerKeypair = Keypair.fromSecret(DOPE_ISSUER_SECRET);
const dopeDistributorKeypair = Keypair.fromSecret(DOPE_DISTRIBUTOR_SECRET);

const server = new Horizon.Server(STELLAR_SERVER_URL);
const networkPassphrase = STELLAR_NETWORK === "mainnet" 
  ? Networks.PUBLIC 
  : Networks.TESTNET;

console.log(`DOPE Issuer: ${dopeIssuerKeypair.publicKey()}`);
console.log(`DOPE Distributor: ${dopeDistributorKeypair.publicKey()}`);

// Initialize platform accounts on startup
async function initializePlatformAccounts() {
  if (STELLAR_NETWORK === "testnet") {
    try {
      // Fund issuer account
      await server.friendbot(dopeIssuerKeypair.publicKey()).call();
      console.log(`DOPE Issuer funded via friendbot`);
      
      // Fund distributor account  
      await server.friendbot(dopeDistributorKeypair.publicKey()).call();
      console.log(`DOPE Distributor funded via friendbot`);

      // Wait for accounts to propagate
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Create initial DOPE token issuance to distributor
      const issuerAccount = await server.loadAccount(dopeIssuerKeypair.publicKey());
      const distributorAccount = await server.loadAccount(dopeDistributorKeypair.publicKey());
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
      
      // Distributor trusts the DOPE asset
      const trustTransaction = new TransactionBuilder(distributorAccount, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(Operation.changeTrust({
          asset: dopeAsset,
        }))
        .setTimeout(30)
        .build();
      
      trustTransaction.sign(dopeDistributorKeypair);
      await server.submitTransaction(trustTransaction);
      
      // Issue initial DOPE supply to distributor
      const issueTransaction = new TransactionBuilder(issuerAccount, {
        fee: "100", 
        networkPassphrase,
      })
        .addOperation(Operation.payment({
          destination: dopeDistributorKeypair.publicKey(),
          asset: dopeAsset,
          amount: "1000000", // 1M DOPE initial supply
        }))
        .setTimeout(30)
        .build();
        
      issueTransaction.sign(dopeIssuerKeypair);
      await server.submitTransaction(issueTransaction);
      
      console.log("DOPE token platform setup completed");
    } catch (error: any) {
      console.error("Error initializing platform accounts:", error.message);
    }
  }
}

// Initialize platform accounts
initializePlatformAccounts();

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
        balance.asset_code === "DOPE" &&
        balance.asset_issuer === dopeIssuerKeypair.publicKey()
      );
      
      return parseFloat(dopeBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching DOPE balance:", error);
      return 0;
    }
  }

  async fundAccount(publicKey: string): Promise<boolean> {
    if (STELLAR_NETWORK !== "testnet") return true;
    
    try {
      console.log(`Funding account via friendbot: ${publicKey}`);
      await server.friendbot(publicKey).call();
      console.log(`Account funded successfully: ${publicKey}`);
      
      // Wait for funding to propagate and verify account exists
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          await server.loadAccount(publicKey);
          return true;
        } catch {
          // Account not ready yet, continue waiting
        }
      }
      return false;
    } catch (error: any) {
      console.log("Account funding error:", error.message);
      return false;
    }
  }

  async createUserToken(userId: string): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      
      // Fund account if needed
      const funded = await this.fundAccount(userKeypair.publicKey());
      if (!funded) {
        console.log("Account funding failed, skipping token setup");
        return;
      }

      const account = await server.loadAccount(userKeypair.publicKey());

      // Create DOPE asset with platform issuer
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
      
      // Create transaction to trust platform DOPE asset
      const transaction = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase,
      })
        .addOperation(Operation.changeTrust({
          asset: dopeAsset,
        }))
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      
      // Check if trustline already exists
      const balances = account.balances;
      const existingTrustline = balances.find(balance => 
        balance.asset_type === "credit_alphanum4" && 
        balance.asset_code === "DOPE" &&
        balance.asset_issuer === dopeIssuerKeypair.publicKey()
      );
      
      if (existingTrustline) {
        console.log(`DOPE trustline already exists for user ${userId}`);
        return;
      }
      
      await server.submitTransaction(transaction);
      console.log(`DOPE token trustline created for user ${userId}`);
    } catch (error) {
      console.error("Error creating user token:", error.message);
      if (error.response?.data) {
        console.error("Stellar response:", JSON.stringify(error.response.data, null, 2));
      }
      if (error.response?.data?.extras?.result_codes) {
        console.error("Transaction result codes:", error.response.data.extras.result_codes);
      }
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
        asset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
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
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      // Use distributor account to send tokens
      const distributorAccount = await server.loadAccount(dopeDistributorKeypair.publicKey());
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

      const transaction = new TransactionBuilder(distributorAccount, {
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

      transaction.sign(dopeDistributorKeypair);
      const result = await server.submitTransaction(transaction);

      // Record mining reward transaction
      await storage.createTransaction({
        userId,
        type: "mining_reward",
        amount: amount,
        toAddress: user.stellarPublicKey,
        stellarTxId: result.hash,
        status: "completed",
        metadata: { source: "mining", issuer: dopeIssuerKeypair.publicKey() },
      });

      // Update wallet balance
      const wallet = await storage.getWallet(userId);
      const newBalance = (parseFloat(wallet?.dopeBalance || "0") + parseFloat(amount)).toString();
      await storage.updateWallet(userId, {
        dopeBalance: newBalance,
        lastUpdated: new Date(),
      });

      console.log(`Issued ${amount} DOPE tokens from distributor to user ${userId}`);
    } catch (error) {
      console.error("Error issuing DOPE tokens:", error);
      throw error;
    }
  }
}

export const stellarService = new StellarService();
