import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Horizon,
  Claimant,
  LiquidityPoolAsset,
  getLiquidityPoolId,
  BASE_FEE as NETWORK_FEE,
} from "@stellar/stellar-sdk";
import { storage } from "../storage.js";

// STELLAR_NETWORK and STELLAR_SERVER_URL configuration
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_SERVER_URLS = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
  pinetwork: "https://api.mainnet.minepi.com",
} as any;

const STELLAR_SERVER_URL =
  STELLAR_SERVER_URLS[STELLAR_NETWORK] || STELLAR_SERVER_URLS.testnet;

// Network passphrases
const NETWORK_PASSPHRASES = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
} as any;

const networkPassphrase =
  NETWORK_PASSPHRASES[STELLAR_NETWORK] || Networks.TESTNET;

const server = new Horizon.Server(STELLAR_SERVER_URL);

const BASE_FEE = parseInt(NETWORK_FEE);
const LIQUIDITY_FEE = parseFloat(process.env.LIQUIDITY_FEE || "3000");

// Platform DOPE token issuer (should be in environment variables in production)
const DOPE_ISSUER_SECRET =
  process.env.DOPE_ISSUER_SECRET || Keypair.random().secret();
const DOPE_DISTRIBUTOR_SECRET =
  process.env.DOPE_DISTRIBUTOR_SECRET || Keypair.random().secret();

const dopeIssuerKeypair = Keypair.fromSecret(DOPE_ISSUER_SECRET);
const dopeDistributorKeypair = Keypair.fromSecret(DOPE_DISTRIBUTOR_SECRET);

const USDC_ISSUER_ACCOUNT =
  process.env.USDC_ISSUER_ACCOUNT ||
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // Issued by Circle

if (process.env.NODE_ENV === "development") {
  console.log(`DOPE Issuer: ${dopeIssuerKeypair.publicKey()}`);
  console.log(`DOPE Distributor: ${dopeDistributorKeypair.publicKey()}`);
}

// Trading pair interfaces
interface TradingPair {
  baseAsset: Asset;
  quoteAsset: Asset;
  symbol: string;
}

interface LiquidityPoolInfo {
  id: string;
  assetA: Asset;
  assetB: Asset;
  reserves: {
    assetA: string;
    assetB: string;
  };
  totalShares: string;
  fee: number;
}

interface OperationRecord {
  type: string;
  amount: string;
  fromAddress: string;
  toAddress: string;
  status: string;
  stellarTxId: string;
  assetType: string;
  metadata: any;
  createdAt: string;
}

interface LiquidityPoolData {
  poolId: string;
  balance: string;
  poolInfo: {
    id: string;
    assets: {
      assetA: string;
      assetB: string;
    };
    reserves: {
      assetA: string;
      assetB: string;
    };
    totalShares: string;
    fee: number;
  };
}

class NetworkHandler {
  static isTestnet(): boolean {
    return STELLAR_NETWORK === "testnet";
  }

  static isMainnet(): boolean {
    return STELLAR_NETWORK === "mainnet";
  }

  static async fundTestnetAccount(publicKey: string): Promise<boolean> {
    if (!this.isTestnet()) {
      console.log("Skipping funding - not on testnet");
      return true;
    }

    try {
      await server.friendbot(publicKey).call();
      console.log(`Account funded via friendbot: ${publicKey}`);
      return true;
    } catch (error: any) {
      console.error("Friendbot funding failed:", error.message);
      return false;
    }
  }

  static validateMainnetOperation(): void {
    if (this.isMainnet()) {
      console.warn("Performing real transaction on MAINNET");
      // Add any additional mainnet validations here
    }
  }
}

// Initialize platform accounts on startup
async function initializePlatformAccounts() {
  if (STELLAR_NETWORK === "testnet") {
    try {
      // Fund issuer account
      await NetworkHandler.fundTestnetAccount(dopeIssuerKeypair.publicKey());
      console.log(`DOPE Issuer funded via friendbot`);

      // Fund distributor account
      await NetworkHandler.fundTestnetAccount(
        dopeDistributorKeypair.publicKey(),
      );
      console.log(`DOPE Distributor funded via friendbot`);

      // Wait for accounts to propagate
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Create initial DOPE token issuance to distributor
      const issuerAccount = await server.loadAccount(
        dopeIssuerKeypair.publicKey(),
      );
      const distributorAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

      // Distributor trusts the DOPE asset
      const trustTransaction = new TransactionBuilder(distributorAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: dopeAsset,
          }),
        )
        .setTimeout(30)
        .build();

      trustTransaction.sign(dopeDistributorKeypair);
      await server.submitTransaction(trustTransaction);

      // Issue initial DOPE supply to distributor
      const issueTransaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: dopeDistributorKeypair.publicKey(),
            asset: dopeAsset,
            amount: "100000000", // 100M DOPE initial supply
          }),
        )
        .setTimeout(30)
        .build();

      issueTransaction.sign(dopeIssuerKeypair);
      await server.submitTransaction(issueTransaction);

      // Set up GAS asset (issuer keeps control to mint on demand)
      return await new Promise((resolve) =>
        resolve("DOPE and GAS token platform setup completed"),
      );
    } catch (error: any) {
      handleStellarError(error, "Failed to initialize platform accounts");
    }
  }

  // Configure issuer account
  try {
    await configureIssuer();
    return await new Promise((resolve) =>
      resolve("Issuer configured successfully"),
    );
  } catch {
    console.log("Issuer already configured");
    return await new Promise((resolve, reject) =>
      reject("Issuer already configured"),
    );
  }
}

async function configureIssuer() {
  const acc = await server.loadAccount(dopeIssuerKeypair.publicKey());

  // Check if homeDomain is already set
  if (acc.home_domain === "dopechain.qzz.io") {
    console.log("Issuer already configured with correct homeDomain.");
    return;
  }

  const tx = new TransactionBuilder(acc, {
    fee: BASE_FEE.toString(),
    networkPassphrase,
  })
    .addOperation(Operation.setOptions({ homeDomain: "dopechain.qzz.io" }))
    .setTimeout(60)
    .build();

  tx.sign(dopeIssuerKeypair);
  await server.submitTransaction(tx);
  console.log("Issuer configuration submitted.");
}

// Initialize platform accounts
initializePlatformAccounts()
  .then((data: any) =>
    console.log(`Platform accounts initialized: ${data?.message || data}`),
  )
  .catch((error: any) =>
    console.error(
      `Error initializing platform accounts: ${error?.message || error}`,
    ),
  );

export class StellarService {
  generateKeypair(): Keypair {
    return Keypair.random();
  }

  // Define supported assets with correct issuers
  SUPPORTED_ASSETS = {
    XLM: Asset.native(),
    DOPE: new Asset("DOPE", dopeIssuerKeypair.publicKey()),
    USDC: new Asset("USDC", USDC_ISSUER_ACCOUNT),
    EURC: new Asset("EURC", USDC_ISSUER_ACCOUNT),
  };

  async getXLMBalance(userId: string): Promise<number> {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(wallet.publicKey);
      const xlmBalance = account.balances.find(
        (balance: any) => balance.asset_type === "native",
      );

      return parseFloat(xlmBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching XLM balance:", error);
      return 0;
    }
  }

  async getDOPEBalance(userId: string): Promise<number> {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(wallet.publicKey);
      const dopeBalance = account.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "DOPE" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      return parseFloat(dopeBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching DOPE balance:", error);
      return 0;
    }
  }

  async getUSDCBalance(userId: string): Promise<number> {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(wallet.publicKey);
      const usdcBalance = account.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "USDC" &&
          balance.asset_issuer === USDC_ISSUER_ACCOUNT,
      );

      return parseFloat(usdcBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching USDC balance:", error);
      return 0;
    }
  }

  async getGASBalance(userId: string): Promise<number> {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(wallet.publicKey);
      const gasBalance = account.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      return parseFloat(gasBalance?.balance || "0");
    } catch (error) {
      console.error("Error fetching GAS balance:", error);
      return 0;
    }
  }

  async getMarketValue(userId: string): Promise<Object> {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(wallet.publicKey);

      const asset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

      const assetValue = account.balances.find(
        (balance: any) =>
          balance.asset_type === asset?.getAssetType() &&
          balance.asset_code === asset?.code &&
          balance.asset_issuer === asset?.issuer,
      ) as any;

      return {
        selling_price: parseFloat(assetValue?.selling_liabilities),
        buying_price: assetValue?.buying_liabilities,
      };
    } catch (error) {
      console.error("Error fetching price values:", error);
      return {
        selling_price: 0,
        buying_price: 0,
      };
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
        await new Promise((resolve) => setTimeout(resolve, 1000));
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

  async createUserToken(secretKey: string): Promise<void> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);

      const account = await server.loadAccount(userKeypair.publicKey());

      // Create DOPE and GAS assets with platform issuer
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());

      // Check existing trustlines
      const balances = account.balances;
      const existingDopeTrustline = balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "DOPE" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      const existingGasTrustline = balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      const operations = [];

      if (!existingDopeTrustline) {
        operations.push(Operation.changeTrust({ asset: dopeAsset }));
      }

      if (!existingGasTrustline) {
        operations.push(Operation.changeTrust({ asset: gasAsset }));
      }

      if (operations.length === 0) {
        console.log(
          `All trustlines already exist for user ${userKeypair.publicKey()}`,
        );
        return;
      }

      const transaction = new TransactionBuilder(account, {
        fee: (BASE_FEE * operations.length).toString(),
        networkPassphrase,
      });

      operations.forEach((op) => transaction.addOperation(op));

      const builtTransaction = transaction.setTimeout(30).build();
      builtTransaction.sign(userKeypair);

      await server.submitTransaction(builtTransaction);
      console.log(
        `Token trustlines created for user ${userKeypair.publicKey()}`,
      );
    } catch (error: any) {
      console.error("Error creating user token:", error.message);
      if (error.response?.data) {
        console.error(
          "Stellar response:",
          JSON.stringify(error.response.data, null, 2),
        );
      }
      if (error.response?.data?.extras?.result_codes) {
        console.error(
          "Transaction result codes:",
          error.response.data.extras.result_codes,
        );
      }
      // Don't throw error to prevent blocking user registration
    }
  }

  /**
   * Convert XLM to GAS tokens (1 XLM = 100 GAS)
   */
  async convertXLMToGAS(secretKey: string, xlmAmount: string): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const userAccount = await server.loadAccount(userKeypair.publicKey());

      // Get current XLM balance
      const xlmBalance = userAccount.balances.find(
        (b: any) => b.asset_type === "native",
      );
      const currentXLMBalance = parseFloat(xlmBalance?.balance || "0");
      const requestedAmount = parseFloat(xlmAmount);

      // Calculate minimum reserve requirements
      const baseReserve = 0.5; // Base account reserve
      const subentryReserve = userAccount.subentry_count * 0.5; // Existing trustlines/offers
      const transactionFee = 0.0001; // Buffer for transaction fees

      // Check if GAS trustline exists (if not, we'll need additional reserve)
      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());
      const existingGasTrustline = userAccount.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      let additionalReserveNeeded = 0;
      if (!existingGasTrustline) {
        additionalReserveNeeded = 0.5; // Additional reserve for new trustline
      }

      const totalReserveNeeded =
        baseReserve +
        subentryReserve +
        additionalReserveNeeded +
        transactionFee;
      const availableForConversion = currentXLMBalance - totalReserveNeeded;

      // Validate conversion amount
      if (requestedAmount > availableForConversion) {
        throw new Error(
          `Insufficient balance for conversion. ` +
            `Available: ${availableForConversion.toFixed(4)} XLM, ` +
            `Requested: ${requestedAmount} XLM. ` +
            `(${totalReserveNeeded.toFixed(4)} XLM required in reserves)`,
        );
      }

      // Minimum conversion amount check
      if (requestedAmount < 0.01) {
        throw new Error("Minimum conversion amount is 0.01 XLM");
      }

      const gasAmount = (requestedAmount * 100).toString(); // 1 XLM = 100 GAS

      // Create GAS trustline if needed
      if (!existingGasTrustline) {
        const trustTransaction = new TransactionBuilder(userAccount, {
          fee: BASE_FEE.toString(),
          networkPassphrase,
        })
          .addOperation(
            Operation.changeTrust({
              asset: gasAsset,
              limit: "1000000",
            }),
          )
          .setTimeout(30)
          .build();

        trustTransaction.sign(userKeypair);
        await server.submitTransaction(trustTransaction);

        // Wait for trustline to propagate
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Get updated account after trustline creation
      const updatedUserAccount = await server.loadAccount(
        userKeypair.publicKey(),
      );

      // Convert XLM to GAS - send XLM to issuer
      const conversionTransaction = new TransactionBuilder(updatedUserAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: dopeIssuerKeypair.publicKey(),
            asset: Asset.native(),
            amount: xlmAmount,
          }),
        )
        .setTimeout(60)
        .build();

      conversionTransaction.sign(userKeypair);
      const xlmResult = await server.submitTransaction(conversionTransaction);

      // Issuer sends GAS tokens to user
      const issuerAccount = await server.loadAccount(
        dopeIssuerKeypair.publicKey(),
      );

      const gasTransaction = new TransactionBuilder(issuerAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: userKeypair.publicKey(),
            asset: gasAsset,
            amount: gasAmount,
          }),
        )
        .setTimeout(30)
        .build();

      gasTransaction.sign(dopeIssuerKeypair);
      const gasResult = await server.submitTransaction(gasTransaction);

      return {
        hash: gasResult.hash,
        xlmAmount,
        gasAmount,
        status: "completed",
        xlmTxHash: xlmResult.hash,
        gasTxHash: gasResult.hash,
        availableBalance: availableForConversion.toFixed(4),
      };
    } catch (error: any) {
      console.error(
        "Error converting XLM to GAS:",
        error.response?.data?.extras?.result_codes || error,
      );

      // Provide more specific error messages
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error(
            "Insufficient XLM balance for conversion and reserves",
          );
        }
        if (resultCodes.operations?.includes("op_no_trust")) {
          throw new Error("GAS trustline creation failed");
        }
        if (resultCodes.operations?.includes("op_line_full")) {
          throw new Error("GAS balance limit exceeded");
        }
        if (resultCodes.operations?.includes("op_low_reserve")) {
          throw new Error(
            "Conversion amount would violate minimum reserve requirements",
          );
        }
      }

      throw new Error(`Conversion failed: ${error.message || "Unknown error"}`);
    }
  }

  // Helper function to get user's available balance for conversion
  async getUserAvailableBalance(
    secretKey: string,
  ): Promise<{ available: number; total: number; reserves: number }> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const userAccount = await server.loadAccount(userKeypair.publicKey());

      const xlmBalance = userAccount.balances.find(
        (b: any) => b.asset_type === "native",
      );
      const currentXLMBalance = parseFloat(xlmBalance?.balance || "0");

      const baseReserve = 0.5;
      const subentryReserve = userAccount.subentry_count * 0.5;
      const transactionFee = 0.0001;
      const totalReserves = baseReserve + subentryReserve + transactionFee;
      const available = Math.max(0, currentXLMBalance - totalReserves);

      return {
        available: parseFloat(available.toFixed(4)),
        total: currentXLMBalance,
        reserves: parseFloat(totalReserves.toFixed(4)),
      };
    } catch (error: any) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  async sendTokens(
    secretKey: string,
    toAddress: string,
    amount: string,
    assetType: "XLM" | "DOPE" | "GAS" | "USDC" | "EURC",
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const sourceKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(sourceKeypair.publicKey());

      let asset: Asset;
      if (assetType === "XLM") {
        asset = Asset.native();
      } else if (assetType === "DOPE") {
        asset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
      } else if (assetType === "GAS") {
        asset = new Asset("GAS", dopeIssuerKeypair.publicKey());
      } else if (assetType === "USDC") {
        asset = new Asset("USDC", USDC_ISSUER_ACCOUNT);
      } else if (assetType === "EURC") {
        asset = new Asset("EURC", USDC_ISSUER_ACCOUNT);
      } else {
        throw new Error(`Unsupported asset type: ${assetType}`);
      }

      if (!toAddress || !amount) {
        throw new Error("Invalid send parameters");
      }

      if (!this.accountExists(toAddress)) {
        const result = await this.createAccount(
          sourceKeypair,
          toAddress,
          amount,
        );
        return {
          hash: result,
          status: "completed",
          amount,
          assetType,
        };
      }

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: toAddress,
            asset: asset,
            amount: amount,
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      const result = await server.submitTransaction(transaction);

      return {
        hash: result.hash,
        status: "completed",
        amount,
        assetType,
      };
    } catch (error: any) {
      console.error(
        "Error sending tokens:",
        error.response.data.extras.result_codes || error,
      );
      handleStellarError(error, "Failed to send tokens");
    }
  }

  /**
   * Check if a Stellar account exists
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await server.loadAccount(publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Merge old account into new account for wallet migration
   * This transfers all balances and merges the accounts
   */
  async mergeAccounts(
    oldSecretKey: string,
    newPublicKey: string,
  ): Promise<{
    hash: string;
    status: string;
    balancesTransferred: Array<{ asset: string; amount: string }>;
    skippedAssets: Array<{ asset: string; amount: string; reason: string }> | null;
    warning: string;
  }> {
    let newAccountCreated = false;
    let newAccountCreationHash: string | null = null;

    try {
      if (!oldSecretKey || !newPublicKey) {
        throw new Error("Missing required parameters for account merge");
      }

      // Validate new public key format
      try {
        Keypair.fromPublicKey(newPublicKey);
      } catch (error) {
        throw new Error("Invalid destination public key format");
      }

      const oldKeypair = Keypair.fromSecret(oldSecretKey);
      
      // Prevent merging into the same account
      if (oldKeypair.publicKey() === newPublicKey) {
        throw new Error("Cannot merge account into itself");
      }
      
      // Validate old account exists
      let oldAccount;
      try {
        oldAccount = await server.loadAccount(oldKeypair.publicKey());
      } catch (error: any) {
        if (error.response?.status === 404) {
          throw new Error("Source account does not exist or is not funded");
        }
        throw error;
      }

      // Check if old account has sufficient balance for operations
      const xlmBalance = oldAccount.balances.find((b: any) => b.asset_type === "native");
      const currentBalance = parseFloat(xlmBalance?.balance || "0");
      
      if (currentBalance < 1.0) {
        throw new Error(`Insufficient XLM balance for merge operations. Current: ${currentBalance} XLM, Required: 1.0 XLM minimum`);
      }

      // Check if new account exists, create if needed
      const newAccountExists = await this.accountExists(newPublicKey);
      if (!newAccountExists) {
        try {
          console.log(`Creating new account ${newPublicKey} for migration with trustlines...`);
          
          // Create the account with trustlines using the distributor as source
          // and create operations to establish trustlines for the new account
          const sourceAccount = await server.loadAccount(oldKeypair.publicKey());
          const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
          const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());
          const usdcAsset = new Asset("USDC", USDC_ISSUER_ACCOUNT);
          const eurcAsset = new Asset("EURC", USDC_ISSUER_ACCOUNT);

          // Create the account first
          const createAccountTx = new TransactionBuilder(sourceAccount, {
            fee: BASE_FEE.toString(),
            networkPassphrase,
          })
            .addOperation(
              Operation.createAccount({
                destination: newPublicKey,
                startingBalance: "3.0", // Enough for reserves + fees
              }),
            )
            .setTimeout(30)
            .build();

          createAccountTx.sign(oldKeypair);
          const createResult = await server.submitTransaction(createAccountTx);
          newAccountCreationHash = createResult.hash;
          newAccountCreated = true;

          // Wait for account creation to propagate
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Now create trustlines using the distributor as source (since we don't have the new account's secret)
          // We'll create the trustlines from the distributor's perspective
          const distributorAccount = await server.loadAccount(dopeDistributorKeypair.publicKey());
          
          const trustlineTx = new TransactionBuilder(distributorAccount, {
            fee: (BASE_FEE * 4).toString(),
            networkPassphrase,
          })
            .addOperation(
              Operation.changeTrust({
                source: newPublicKey,
                asset: dopeAsset,
                limit: "100000000",
              }),
            )
            .addOperation(
              Operation.changeTrust({
                source: newPublicKey,
                asset: gasAsset,
                limit: "1000000",
              }),
            )
            .addOperation(
              Operation.changeTrust({
                source: newPublicKey,
                asset: usdcAsset,
                limit: "10000000",
              }),
            )
            .addOperation(
              Operation.changeTrust({
                source: newPublicKey,
                asset: eurcAsset,
                limit: "10000000",
              }),
            )
            .setTimeout(60)
            .build();

          // The distributor can't sign for the new account, so we need a different approach
          // Instead, let's skip trustline creation during migration and handle it differently
          console.log(`New account ${newPublicKey} created, trustlines will be created when needed`);
          
          // Wait for account creation to fully propagate
          await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (createError: any) {
          console.error("Failed to create new account:", createError);
          throw new Error(`Failed to create destination account: ${createError.message}`);
        }
      } else {
        // Account already exists, check if it can receive the assets we're transferring
        console.log(`Account ${newPublicKey} already exists, checking trustlines...`);
        const newAccount = await server.loadAccount(newPublicKey);
        
        // Log which trustlines exist
        const existingTrustlines = newAccount.balances.map(b => {
          if (b.asset_type === "native") return "XLM";
          return `${(b as any).asset_code}:${(b as any).asset_issuer}`;
        });
        
        console.log(`Existing trustlines for ${newPublicKey}:`, existingTrustlines);
      }

      // Verify new account exists after creation
      let newAccount;
      try {
        newAccount = await server.loadAccount(newPublicKey);
      } catch (error: any) {
        if (error.response?.status === 404) {
          throw new Error("Destination account creation failed - account not found");
        }
        throw error;
      }

      // Get all balances from old account
      const balancesToTransfer = oldAccount.balances.filter(
        (balance: any) => parseFloat(balance.balance) > 0,
      );

      const operations = [];
      const balancesTransferred = [] as any;

      // Transfer all non-XLM assets first, but only those the destination can receive
      const skippedAssets = [];
      
      for (const balance of balancesToTransfer) {
        if (balance.asset_type !== "native") {
          const amount = balance.balance;
          let asset: Asset;

          // Properly handle different asset types
          if (balance.asset_type === "credit_alphanum4" || balance.asset_type === "credit_alphanum12") {
            if (!balance.asset_code || !balance.asset_issuer) {
              console.warn(`Skipping asset with missing code or issuer:`, balance);
              continue;
            }
            asset = new Asset(balance.asset_code, balance.asset_issuer);
          } else {
            console.warn(`Unknown asset type: ${balance.asset_type}`, balance);
            continue;
          }

          // Check if destination has trustline for this asset
          const destHasTrustline = newAccount.balances.some(
            (b: any) =>
              b.asset_type === balance.asset_type &&
              b.asset_code === balance.asset_code &&
              b.asset_issuer === balance.asset_issuer,
          );

          if (!destHasTrustline) {
            console.warn(
              `Destination account doesn't have trustline for ${balance.asset_code}:${balance.asset_issuer}. Asset will remain in source account.`,
            );
            skippedAssets.push({
              asset: `${balance.asset_code} (${balance.asset_issuer})`,
              amount: amount,
              reason: "No trustline in destination account"
            });
            continue;
          }

          operations.push(
            Operation.payment({
              destination: newPublicKey,
              asset: asset,
              amount: amount,
            }),
          );

          balancesTransferred.push({
            asset: `${balance.asset_code} (${balance.asset_issuer})`,
            amount: amount,
          });
        } else {
          // Handle XLM - will be transferred via account merge
          balancesTransferred.push({
            asset: "XLM",
            amount: balance.balance,
          });
        }
      }

      // If there are skipped assets, we can't do a complete account merge
      if (skippedAssets.length > 0) {
        console.warn(`Cannot complete full account merge. ${skippedAssets.length} assets skipped:`, skippedAssets);
        
        // If we created a new account but can't transfer all assets, we should warn the user
        if (newAccountCreated) {
          throw new Error(
            `Account merge incomplete: Destination account missing trustlines for ${skippedAssets.map(a => a.asset).join(", ")}. ` +
            `Please create these trustlines first, or the assets will remain in the source account.`
          );
        }
      }

      // Add account merge operation (transfers remaining XLM and merges accounts)
      operations.push(
        Operation.accountMerge({
          destination: newPublicKey,
        }),
      );

      // Build and submit transaction
      const transaction = new TransactionBuilder(oldAccount, {
        fee: (BASE_FEE * operations.length).toString(),
        networkPassphrase,
      });

      operations.forEach((op) => transaction.addOperation(op));

      const builtTransaction = transaction.setTimeout(30).build();
      builtTransaction.sign(oldKeypair);

      const result = await server.submitTransaction(builtTransaction);

      console.log(
        `Account merge completed. Old account ${oldKeypair.publicKey()} merged into ${newPublicKey}`,
      );

      return {
        hash: result.hash,
        status: skippedAssets.length > 0 ? "partial" : "completed",
        balancesTransferred,
        skippedAssets: skippedAssets && skippedAssets.length >= 0 ? skippedAssets : null,
        warning: skippedAssets.length > 0 
          ? `${skippedAssets.length} assets could not be transferred due to missing trustlines`
          : "",
      };
    } catch (error: any) {
      console.error("Error merging accounts:", error);

      // If we created a new account and the merge failed, attempt rollback
      if (newAccountCreated && newAccountCreationHash) {
        try {
          console.log("Attempting to rollback new account creation...");
          // Since we can't access the new account's secret key, we'll try to merge back
          // the funds using the old account's remaining balance
          const newAccount = await server.loadAccount(newPublicKey);
          const xlmBalance = newAccount.balances.find((b: any) => b.asset_type === "native");
          
          if (xlmBalance && parseFloat(xlmBalance.balance) > 1.0) {
            console.log(`New account has ${xlmBalance.balance} XLM, attempting to return funds`);
            // This would require the new account's secret key, which we don't have
            // So we'll just log the issue for manual intervention
            console.warn(`Manual intervention needed: New account ${newPublicKey} has ${xlmBalance.balance} XLM that needs to be returned`);
          }
        } catch (rollbackError: any) {
          console.error("Failed to rollback account creation:", rollbackError.message);
          // Continue with original error handling
        }
      }

      // Enhanced error handling
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;

        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient balance to pay transaction fees");
        }

        if (resultCodes.operations?.includes("op_no_destination")) {
          throw new Error("Destination account does not exist");
        }

        if (resultCodes.operations?.includes("op_no_trust")) {
          throw new Error("Destination account missing required trustlines");
        }

        if (resultCodes.operations?.includes("op_account_merge_malformed")) {
          throw new Error("Invalid account merge operation");
        }

        if (resultCodes.operations?.includes("op_account_merge_no_account")) {
          throw new Error("Source account does not exist");
        }

        if (
          resultCodes.operations?.includes("op_account_merge_immutable_set")
        ) {
          throw new Error(
            "Account has AUTH_IMMUTABLE flag set and cannot be merged",
          );
        }

        if (
          resultCodes.operations?.includes("op_account_merge_has_sub_entries")
        ) {
          throw new Error(
            "Account has active offers or trustlines that must be closed first",
          );
        }

        if (resultCodes.operations?.includes("op_malformed")) {
          throw new Error("Invalid operation parameters - check asset codes and issuers");
        }
      }

      throw new Error(
        `Account merge failed: ${error.message || "Unknown error"}`,
      );
    }
  }

  /**
   * Check what trustlines the destination account needs to receive all assets from source
   */
  async checkRequiredTrustlinesForMerge(
    sourceSecretKey: string,
    destinationPublicKey: string,
  ): Promise<{
    requiredTrustlines: Array<{ code: string; issuer: string; amount: string }>;
    existingTrustlines: Array<{ code: string; issuer: string }>;
    canMerge: boolean;
  }> {
    try {
      const sourceKeypair = Keypair.fromSecret(sourceSecretKey);
      const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
      
      // Check if destination exists
      const destExists = await this.accountExists(destinationPublicKey);
      if (!destExists) {
        // If destination doesn't exist, we can create it with trustlines
        return {
          requiredTrustlines: [],
          existingTrustlines: [],
          canMerge: true,
        };
      }

      const destAccount = await server.loadAccount(destinationPublicKey);
      
      const requiredTrustlines = [];
      const existingTrustlines = [];

      // Get all non-XLM assets from source
      const nonNativeAssets = sourceAccount.balances.filter(
        (balance: any) => balance.asset_type !== "native" && parseFloat(balance.balance) > 0
      ) as any;

      for (const asset of nonNativeAssets) {
        const trustlineInfo = {
          code: asset.asset_code,
          issuer: asset.asset_issuer,
          amount: asset.balance,
        };

        // Check if destination has this trustline
        const hasTrustline = destAccount.balances.some(
          (b: any) =>
            b.asset_type === asset.asset_type &&
            b.asset_code === asset.asset_code &&
            b.asset_issuer === asset.asset_issuer
        );

        if (hasTrustline) {
          existingTrustlines.push({
            code: asset.asset_code,
            issuer: asset.asset_issuer,
          });
        } else {
          requiredTrustlines.push(trustlineInfo);
        }
      }

      return {
        requiredTrustlines,
        existingTrustlines,
        canMerge: requiredTrustlines.length === 0,
      };
    } catch (error: any) {
      console.error("Error checking required trustlines:", error);
      throw new Error(`Failed to check trustlines: ${error.message}`);
    }
  }

  /**
   * Rollback account creation by merging the new account back to the source
   */
  private async rollbackAccountCreation(
    newAccountPublicKey: string,
    sourceAccountPublicKey: string,
  ): Promise<void> {
    try {
      // Check if new account still exists and has funds
      const newAccount = await server.loadAccount(newAccountPublicKey);
      const xlmBalance = newAccount.balances.find(
        (b: any) => b.asset_type === "native"
      );
      
      if (!xlmBalance || parseFloat(xlmBalance.balance) <= 0.5) {
        console.log("New account has insufficient funds for rollback");
        return;
      }

      // Check if source account still exists
      const sourceExists = await this.accountExists(sourceAccountPublicKey);
      if (!sourceExists) {
        console.log("Source account no longer exists, cannot rollback");
        return;
      }

      // Create a temporary keypair to sign the rollback (this won't work in practice)
      // In reality, we can't rollback without the new account's secret key
      console.warn("Cannot rollback account creation - secret key for new account not available");
      
    } catch (error: any) {
      console.error("Rollback failed:", error.message);
      throw error;
    }
  }

  /**
   * Prepare account for merge by closing offers and unused trustlines
   */
  async prepareAccountForMerge(secretKey: string): Promise<void> {
    try {
      const keypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(keypair.publicKey());

      const operations = [];

      // Get all offers and close them
      const offers = await server
        .offers()
        .forAccount(keypair.publicKey())
        .call() as any;

      for (const offer of offers.records) {
        // Convert Horizon API offer assets to Stellar SDK Asset objects
        const sellingAsset =
          offer.selling.asset_type === "native"
            ? Asset.native()
            : new Asset(offer?.selling?.asset_code, offer.selling.asset_issuer);

        const buyingAsset =
          offer.buying.asset_type === "native"
            ? Asset.native()
            : new Asset(offer.buying.asset_code, offer.buying.asset_issuer);

        operations.push(
          Operation.manageSellOffer({
            selling: sellingAsset,
            buying: buyingAsset,
            amount: "0", // 0 amount cancels the offer
            price: "1",
            offerId: offer.id,
          }),
        );
      }

      // Close unused trustlines (those with 0 balance)
      const zeroBalanceTrustlines = account.balances.filter(
        (balance: any) =>
          balance.asset_type !== "native" && parseFloat(balance.balance) === 0,
      ) as any;

      for (const trustline of zeroBalanceTrustlines) {
        const asset = new Asset(trustline.asset_code, trustline.asset_issuer);
        operations.push(
          Operation.changeTrust({
            asset: asset,
            limit: "0", // 0 limit removes the trustline
          }),
        );
      }

      if (operations.length > 0) {
        const transaction = new TransactionBuilder(account, {
          fee: (BASE_FEE * operations.length).toString(),
          networkPassphrase,
        });

        operations.forEach((op) => transaction.addOperation(op));

        const builtTransaction = transaction.setTimeout(30).build();
        builtTransaction.sign(keypair);

        await server.submitTransaction(builtTransaction);
        console.log(
          `Prepared account ${keypair.publicKey()} for merge by closing ${operations.length} sub-entries`,
        );
      }
    } catch (error: any) {
      console.error("Error preparing account for merge:", error);
      throw new Error(
        `Failed to prepare account: ${error.message || "Unknown error"}`,
      );
    }
  }

  // ============= TRADING METHODS =============

  /**
   * Execute a market trade (buy/sell) using direct swap with platform distributor
   */

  async executeTrade(
    userId: string,
    sellAsset: Asset,
    sellAmount: string,
    buyAsset: Asset,
    minBuyAmount: string,
  ): Promise<any> {
    NetworkHandler.validateMainnetOperation();

    if (NetworkHandler.isTestnet()) {
      // Use simplified trading for testnet
      return this.executeRealTrade(
        userId,
        sellAsset,
        sellAmount,
        buyAsset,
        minBuyAmount,
      );
    } else {
      // Use real DEX trading for mainnet
      return this.executeRealTrade(
        userId,
        sellAsset,
        sellAmount,
        buyAsset,
        minBuyAmount,
      );
    }
  }

  async addLiquidity(
    userId: string,
    assetA: Asset,
    assetB: Asset,
    amountA: string,
    amountB: string,
    minPrice: string,
    maxPrice: string,
  ): Promise<any> {
    NetworkHandler.validateMainnetOperation();

    return this.createOrJoinLiquidity(
      userId,
      assetA,
      assetB,
      amountA,
      amountB,
      minPrice,
      maxPrice,
    );
  }

  async executeRealTrade(
    secretKey: string,
    sellAsset: Asset,
    sellAmount: string,
    buyAsset: Asset,
    minBuyAmount: string,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const userAccount = await server.loadAccount(userKeypair.publicKey());

      // Get the current market price
      const rate = await this.getExchangeRate(sellAsset, buyAsset);

      if (!rate) {
        throw new Error("No liquidity available for this trading pair");
      }

      // Get current base fee
      let baseFee: string;
      try {
        const feeStats = await server.feeStats();
        baseFee = feeStats.last_ledger_base_fee;
      } catch (feeError) {
        // Fallback to default base fee if feeStats fails
        baseFee = BASE_FEE.toString();
      }

      const supportedSellAsset =
        sellAsset.code === "XLM"
          ? Asset.native()
          : sellAsset.code === "USDC"
            ? new Asset("USDC", USDC_ISSUER_ACCOUNT)
            : sellAsset.code === "EURC"
              ? new Asset("EURC", USDC_ISSUER_ACCOUNT)
              : new Asset("DOPE", dopeIssuerKeypair.publicKey());
      const supportedBuyAsset =
        buyAsset.code === "XLM"
          ? Asset.native()
          : buyAsset.code === "USDC"
            ? new Asset("USDC", USDC_ISSUER_ACCOUNT)
            : buyAsset.code === "EURC"
              ? new Asset("EURC", USDC_ISSUER_ACCOUNT)
              : new Asset("DOPE", dopeIssuerKeypair.publicKey());

      // Use path payments for better execution
      const transaction = new TransactionBuilder(userAccount, {
        fee: baseFee,
        networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: supportedSellAsset,
            sendAmount: sellAmount,
            destination: userKeypair.publicKey(),
            destAsset: supportedBuyAsset,
            destMin: minBuyAmount,
            path: [], // Let Stellar find the best path
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      // Parse transaction result to get actual received amount
      let receivedAmount = "0";
      try {
        // Try to parse the transaction result for actual received amount
        if (result.result_xdr) {
          const { xdr } = await import("@stellar/stellar-sdk");
          const txResult = xdr.TransactionResult.fromXDR(
            result.result_xdr,
            "base64",
          );

          if (txResult.result().switch().name === "txSuccess") {
            const opResult = txResult.result().results()[0];
            if (opResult.tr().switch().name === "pathPaymentStrictSend") {
              const pathResult = opResult.tr().pathPaymentStrictSendResult();
              if (pathResult.switch().name === "pathPaymentStrictSendSuccess") {
                const success = pathResult.success();
                if (success.offers().length > 0) {
                  // Get the destination amount from the last offer
                  receivedAmount = success.last().amount().toString();
                } else {
                  // Direct payment without intermediate offers
                  receivedAmount = success.last().amount().toString();
                }
              }
            }
          }
        }
      } catch (parseError) {
        console.warn(
          "Could not parse transaction result for received amount:",
          parseError,
        );
        // Fallback: estimate received amount based on sell amount and best ask price
        const estimatedReceived = (
          parseFloat(sellAmount) / parseFloat(rate.toString())
        ).toFixed(7);
        receivedAmount = estimatedReceived;
      }

      return {
        hash: result.hash,
        status: "completed",
        sellAsset: sellAsset.code || "XLM",
        buyAsset: buyAsset.code || "XLM",
        sellAmount,
        receivedAmount,
      };
    } catch (error: any) {
      console.error(
        "Error executing real trade:",
        error.response?.data?.extras.result_codes || error,
      );

      // Provide more specific error messages based on Stellar error codes
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient balance for this trade");
        }
        if (resultCodes.operations?.includes("op_underfunded")) {
          throw new Error("Insufficient funds to complete trade");
        }
        if (resultCodes.operations?.includes("op_no_trust")) {
          throw new Error("Missing trustline for trading asset");
        }
        if (resultCodes.operations?.includes("op_too_few_offers")) {
          throw new Error(
            "Not enough liquidity to complete trade at desired price",
          );
        }
        if (resultCodes.operations?.includes("op_over_source_max")) {
          throw new Error("Trade would exceed maximum sell amount");
        }
        if (resultCodes.operations?.includes("op_under_dest_min")) {
          throw new Error(
            "Trade would not meet minimum buy amount requirement",
          );
        }
      }

      throw new Error(`Trade failed: ${error.message || "Unknown error"}`);
    }
  }

  // Simplified trading for testnet

  // Validate and normalize assets to use supported versions
  validateAndNormalizeAsset = (asset: Asset): Asset => {
    if (asset.isNative()) return this.SUPPORTED_ASSETS.XLM;

    const assetKey = Object.keys(this.SUPPORTED_ASSETS).find((key) => {
      const supportedAsset =
        this.SUPPORTED_ASSETS[key as keyof typeof this.SUPPORTED_ASSETS];
      return !supportedAsset.isNative() && supportedAsset.code === asset.code;
    });

    if (!assetKey) {
      throw new Error(
        `Unsupported asset: ${asset.code}. Supported assets: ${Object.keys(this.SUPPORTED_ASSETS).join(", ")}`,
      );
    }

    return this.SUPPORTED_ASSETS[
      assetKey as keyof typeof this.SUPPORTED_ASSETS
    ];
  };

  async createTrade(
    secretKey: string,
    sellAsset: Asset,
    sellAmount: string,
    buyAsset: Asset,
    minBuyAmount: string,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      let userAccount = await server.loadAccount(userKeypair.publicKey());

      // Normalize assets to use supported versions
      sellAsset = this.validateAndNormalizeAsset(sellAsset);
      buyAsset = this.validateAndNormalizeAsset(buyAsset);

      const sellAmountNum = parseFloat(sellAmount);
      const minBuyAmountNum = parseFloat(minBuyAmount);
      if (sellAmountNum <= 0 || minBuyAmountNum <= 0) {
        throw new Error("Invalid trade amounts");
      }

      // Function to check and create trustlines if needed
      const ensureTrustline = async (asset: Asset) => {
        if (asset.isNative()) return; // XLM doesn't need trustlines

        const hasTrustline = userAccount.balances.some(
          (b: any) =>
            b.asset_type === "credit_alphanum4" &&
            b.asset_code === asset.code &&
            b.asset_issuer === asset.issuer,
        );

        if (!hasTrustline) {
          console.log(
            `Creating trustline for ${asset.code} from issuer ${asset.issuer}`,
          );

          const trustlineTx = new TransactionBuilder(userAccount, {
            fee: BASE_FEE.toString(),
            networkPassphrase,
          })
            .addOperation(
              Operation.changeTrust({
                asset: asset,
                limit: "922337203685.4775807", // Maximum limit
              }),
            )
            .setTimeout(60)
            .build();

          trustlineTx.sign(userKeypair);
          const trustlineResult = await server.submitTransaction(trustlineTx);
          console.log(
            `Trustline created successfully: ${trustlineResult.hash}`,
          );

          // Reload account after trustline creation
          userAccount = await server.loadAccount(userKeypair.publicKey());
        }
      };

      // Ensure trustlines for both assets before trading
      await ensureTrustline(sellAsset);
      await ensureTrustline(buyAsset);

      // Check user balance for sell asset
      const hasSufficientBalance = (asset: Asset, amount: number) => {
        if (asset.isNative()) {
          const xlmBalance = userAccount.balances.find(
            (b: any) => b.asset_type === "native",
          );
          return parseFloat(xlmBalance?.balance || "0") >= amount + 0.1; // Reserve for fees
        } else {
          const assetBalance = userAccount.balances.find(
            (b: any) =>
              b.asset_type === "credit_alphanum4" &&
              b.asset_code === asset.code &&
              b.asset_issuer === asset.issuer,
          );
          return parseFloat(assetBalance?.balance || "0") >= amount;
        }
      };

      if (!hasSufficientBalance(sellAsset, sellAmountNum)) {
        throw new Error(`Insufficient ${sellAsset.code || "XLM"} balance`);
      }

      const exchangeRate = await this.getExchangeRate(sellAsset, buyAsset);
      const expectedReceive = sellAmountNum * exchangeRate;

      if (expectedReceive < minBuyAmountNum) {
        throw new Error(
          `Trade would receive ${expectedReceive.toFixed(6)} ${buyAsset.code || "XLM"} but minimum required is ${minBuyAmount}`,
        );
      }

      const receiveAmount = expectedReceive.toFixed(7);

      // Ensure distributor has trustlines and sufficient balance
      const distributorAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );

      // Check if distributor has sufficient balance for the buy asset
      const distributorHasSufficientBalance = (
        asset: Asset,
        amount: number,
      ) => {
        if (asset.isNative()) {
          const xlmBalance = distributorAccount.balances.find(
            (b: any) => b.asset_type === "native",
          );
          return parseFloat(xlmBalance?.balance || "0") >= amount + 0.1;
        } else {
          const assetBalance = distributorAccount.balances.find(
            (b: any) =>
              b.asset_type === "credit_alphanum4" &&
              b.asset_code === asset.code &&
              b.asset_issuer === asset.issuer,
          );
          return parseFloat(assetBalance?.balance || "0") >= amount;
        }
      };

      if (!distributorHasSufficientBalance(buyAsset, expectedReceive)) {
        throw new Error(
          `Distributor has insufficient ${buyAsset.code || "XLM"} balance to complete trade`,
        );
      }

      // 1. User sends sell asset to distributor
      const userToDistributorTx = new TransactionBuilder(userAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: dopeDistributorKeypair.publicKey(),
            asset: sellAsset,
            amount: sellAmount,
          }),
        )
        .setTimeout(60)
        .build();

      userToDistributorTx.sign(userKeypair);
      const sellResult = await server.submitTransaction(userToDistributorTx);
      console.log(`Sell transaction completed: ${sellResult.hash}`);

      // 2. Distributor sends buy asset to user
      const updatedDistributorAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );

      const distributorToUserTx = new TransactionBuilder(
        updatedDistributorAccount,
        {
          fee: BASE_FEE.toString(),
          networkPassphrase,
        },
      )
        .addOperation(
          Operation.payment({
            destination: userKeypair.publicKey(),
            asset: buyAsset,
            amount: receiveAmount,
          }),
        )
        .setTimeout(60)
        .build();

      distributorToUserTx.sign(dopeDistributorKeypair);
      const buyResult = await server.submitTransaction(distributorToUserTx);
      console.log(`Buy transaction completed: ${buyResult.hash}`);

      console.log(
        `Trade executed successfully: ${sellAmount} ${sellAsset.code || "XLM"} -> ${receiveAmount} ${buyAsset.code || "XLM"}`,
      );

      return {
        hash: buyResult.hash,
        status: "completed",
        sellAsset: {
          code: sellAsset.code || "XLM",
          issuer: sellAsset.isNative() ? null : sellAsset.issuer,
        },
        buyAsset: {
          code: buyAsset.code || "XLM",
          issuer: buyAsset.isNative() ? null : buyAsset.issuer,
        },
        sellAmount,
        receiveAmount,
        sellTxHash: sellResult.hash,
        buyTxHash: buyResult.hash,
        exchangeRate: exchangeRate.toString(),
      };
    } catch (error: any) {
      console.error("Error executing trade:", error);

      // Enhanced error handling for trustline and balance issues
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        const operations = resultCodes.operations || [];

        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient balance to pay transaction fees");
        }

        if (operations.includes("op_underfunded")) {
          throw new Error("Insufficient funds to complete trade");
        }

        if (operations.includes("op_no_trust")) {
          throw new Error(
            "Missing trustline for trading asset. This should have been created automatically - please try again.",
          );
        }

        if (operations.includes("op_line_full")) {
          throw new Error("Asset trustline is at maximum capacity");
        }

        if (operations.includes("op_no_destination")) {
          throw new Error("Destination account does not exist");
        }

        if (operations.includes("op_not_authorized")) {
          throw new Error(
            "Not authorized to perform this operation with the asset",
          );
        }

        console.error("Stellar transaction failed with codes:", resultCodes);
      }

      // Re-throw with original message if no specific handling
      throw new Error(error.message || "Failed to execute trade");
    }
  }

  // Exchange rate logic with normalized assets
  getExchangeRate = async (sell: Asset, buy: Asset): Promise<number> => {
    const sellCode = sell.code || "XLM";
    const buyCode = buy.code || "XLM";
    const pair = `${sellCode}->${buyCode}`;

    const fallbackRates: Record<string, number> = {
      "XLM->DOPE": 10,
      "DOPE->XLM": 0.1,
      "USDC->DOPE": 8,
      "DOPE->USDC": 0.125,
      "XLM->USDC": 0.12,
      "USDC->XLM": 8.3,
    };

    try {
      const orderbook = await server
        .orderbook(
          sell.code === "XLM" ? Asset.native() : sell,
          buy.code === "XLM" ? Asset.native() : buy,
        )
        .limit(10)
        .call();

      // For selling: you want the highest bid (best price someone will pay you)
      // For buying: you want the lowest ask (best price you can buy at)

      const bestBid = orderbook.bids?.[0]
        ? parseFloat(orderbook.bids[0].price)
        : 0;
      const bestAsk = orderbook.asks?.[0]
        ? parseFloat(orderbook.asks[0].price)
        : 0;

      // Get the best available price (highest bid for immediate execution)
      const bestPrice = bestBid > 0 ? bestBid : bestAsk;

      console.log(
        "Best Bid: " +
          bestBid +
          " Best Ask: " +
          bestAsk +
          " Best Price: " +
          bestPrice +
          " Pair: " +
          pair,
      );

      if (bestPrice === 0) {
        throw new Error("No valid prices available in orderbook");
      }

      return bestPrice;
    } catch (err: any) {
      console.warn(`Falling back to fixed rate for ${pair}: ${err.message}`);
      if (!fallbackRates[pair]) {
        throw new Error(
          `Unsupported trading pair: ${pair}. Available pairs: ${Object.keys(fallbackRates).join(", ")}`,
        );
      }
      return 0;
    }
  };
  /**
   * Place a limit order on the DEX
   */
  async placeLimitOrder(
    secretKey: string,
    selling: Asset,
    buying: Asset,
    amount: string,
    price: string,
    orderType: string = "sell",
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      // Check balances before creating order
      const balances = account.balances;
      const sellingBalance = balances.find((b: any) => {
        if (selling.isNative()) return b.asset_type === "native";
        return (
          b.asset_code === selling.code && b.asset_issuer === selling.issuer
        );
      });

      if (
        !sellingBalance ||
        parseFloat(sellingBalance.balance) < parseFloat(amount)
      ) {
        throw new Error(
          `Insufficient ${selling.code || "XLM"} balance. Available: ${sellingBalance?.balance || "0"}, Required: ${amount}`,
        );
      }

      try {
        await this.createTrustline(
          secretKey,
          buying.code,
          buying.code === "USDC"
            ? USDC_ISSUER_ACCOUNT
            : buying.code === "EURC"
              ? USDC_ISSUER_ACCOUNT
              : dopeIssuerKeypair.publicKey(),
        );
      } catch (error: any) {
        console.error("Error creating trustline:", error.message);
      }

      let operation;

      if (orderType === "sell") {
        // Selling: straightforward - sell the specified asset
        operation = Operation.manageSellOffer({
          selling: selling,
          buying: buying,
          amount: amount,
          price: price,
          offerId: "0", // 0 creates new offer
        });
      } else {
        // Buying: we want to buy the 'buying' asset with the 'selling' asset
        // But manageBuyOffer expects the amount we want to buy, not the amount we're willing to spend

        // Calculate how much of the buying asset we'll get with our selling amount and price
        const buyAmount = (parseFloat(amount) * parseFloat(price)).toString();

        operation = Operation.manageBuyOffer({
          selling: selling, // Asset we're giving up (correct)
          buying: buying, // Asset we want to receive (correct)
          buyAmount: buyAmount, // Amount of buying asset we want
          price: (1 / parseFloat(price)).toString(), // Inverse price for manageBuyOffer
          offerId: "0",
        });
      }

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(operation)
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      console.log(
        `Limit order placed: ${amount} ${selling.code || "XLM"} at ${price} for ${buying.code || "XLM"}`,
      );

      return {
        hash: result.hash,
        selling: selling.code || "XLM",
        buying: buying.code || "XLM",
        amount,
        price,
        status: "active",
        orderType,
      };
    } catch (error: any) {
      console.error("Error placing limit order:", error);

      // Better error handling for Stellar errors
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        if (
          resultCodes.operations &&
          resultCodes.operations.includes("op_underfunded")
        ) {
          throw new Error(
            `Insufficient funds. Please check your ${selling.code || "XLM"} balance.`,
          );
        }
        throw new Error(
          `Stellar error: ${resultCodes.operations?.[0] || resultCodes.transaction}`,
        );
      }

      throw new Error(error.message || "Failed to place limit order");
    }
  }

  /**
   * Cancel an existing limit order
   */
  async cancelLimitOrder(
    secretKey: string,
    offerId: string,
    selling: Asset,
    buying: Asset,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.manageSellOffer({
            selling: selling,
            buying: buying,
            amount: "0", // 0 amount cancels the offer
            price: "1",
            offerId: offerId,
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      console.log(`Limit order ${offerId} cancelled`);

      return {
        hash: result.hash,
        status: "cancelled",
        offerId,
      };
    } catch (error) {
      console.error("Error cancelling limit order:", error);
      throw error;
    }
  }

  /**
   * Get orderbook for a trading pair
   */
  async getOrderbook(sellingAsset: Asset, buyingAsset: Asset): Promise<any> {
    try {
      const orderbook = await server
        .orderbook(sellingAsset, buyingAsset)
        .call();

      console.log("Orderbook" + JSON.stringify(orderbook));

      return {
        bids: orderbook.bids.map((bid: any) => ({
          id: bid.id,
          type: "buy",
          selling: sellingAsset,
          buying: buyingAsset,
          price: bid.price,
          amount: bid.amount,
          priceR: bid.price_r,
          createdAt: bid.last_modified_time,
        })),
        asks: orderbook.asks.map((ask: any) => ({
          id: ask.id,
          type: "sell",
          selling: sellingAsset,
          buying: buyingAsset,
          price: ask.price,
          amount: ask.amount,
          priceR: ask.price_r,
          createdAt: ask.last_modified_time,
        })),
        base: {
          assetType: sellingAsset.getAssetType(),
          assetCode: sellingAsset.code,
          assetIssuer: sellingAsset.issuer,
        },
        counter: {
          assetType: buyingAsset.getAssetType(),
          assetCode: buyingAsset.code,
          assetIssuer: buyingAsset.issuer,
        },
      };
    } catch (error) {
      console.error("Error fetching orderbook:", error);
      throw error;
    }
  }

  /**
   * Get user's open orders
   */
  async getUserOrders(secretKey: string): Promise<any[]> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const accountKeypair = Keypair.fromSecret(secretKey);

      const offers = await server
        .offers()
        .forAccount(accountKeypair.publicKey())
        .call();

      return offers.records.map((offer: any) => ({
        id: offer.id,
        status: "active",
        selling: offer.selling,
        buying: offer.buying,
        amount: offer.amount,
        price: offer.price,
        priceR: offer.price_r,
        lastModifiedLedger: offer.last_modified_ledger,
        lastModifiedTime: offer.last_modified_time,
      }));
    } catch (error) {
      console.error("Error fetching user orders:", error);
      return [];
    }
  }

  // ============= LIQUIDITY POOL METHODS =============

  /**
   * Create or join a liquidity pool
   */

  async addRealLiquidity(
    secretKey: string,
    assetA: Asset,
    assetB: Asset,
    amountA: string,
    amountB: string,
    minPrice: string,
    maxPrice: string,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      // Validate amounts
      const amountANum = parseFloat(amountA);
      const amountBNum = parseFloat(amountB);
      const minPriceNum = parseFloat(minPrice);
      const maxPriceNum = parseFloat(maxPrice);

      if (amountANum <= 0 || amountBNum <= 0) {
        throw new Error("Invalid liquidity amounts");
      }

      if (minPriceNum <= 0 || maxPriceNum <= 0 || minPriceNum >= maxPriceNum) {
        throw new Error("Invalid price range");
      }

      // Create liquidity pool parameters and get pool ID
      const liquidityPoolParameters = {
        assetA,
        assetB,
        fee: 30, // 0.3% fee
      };
      const liquidityPoolId = getLiquidityPoolId(
        "constant_product",
        liquidityPoolParameters,
      ).toString("hex");

      // Check if pool exists
      let poolExists = false;
      let poolInfo = null;
      try {
        poolInfo = await server
          .liquidityPools()
          .liquidityPoolId(liquidityPoolId)
          .call();
        poolExists = true;
      } catch (error: any) {
        // Pool doesn't exist yet
        if (error.response?.status === 404) {
          poolExists = false;
        } else {
          throw error;
        }
      }

      // Get current base fee
      let baseFee: string;
      try {
        const feeStats = await server.feeStats();
        baseFee = feeStats.last_ledger_base_fee;
      } catch (feeError) {
        // Fallback to default base fee
        baseFee = LIQUIDITY_FEE.toString();
      }

      const transaction = new TransactionBuilder(account, {
        fee: baseFee,
        networkPassphrase,
      });

      if (!poolExists) {
        // For new pools, we need to change trustline first, then deposit
        // Add trustline for the liquidity pool asset
        transaction.addOperation(
          Operation.changeTrust({
            asset: new LiquidityPoolAsset(assetA, assetB, 30),
          }),
        );
      }

      // Add liquidity pool deposit operation
      transaction.addOperation(
        Operation.liquidityPoolDeposit({
          liquidityPoolId,
          maxAmountA: amountA,
          maxAmountB: amountB,
          minPrice: minPrice,
          maxPrice: maxPrice,
        }),
      );

      const builtTransaction = transaction.setTimeout(60).build();
      builtTransaction.sign(userKeypair);
      const result = await server.submitTransaction(builtTransaction);

      // Get pool shares info from the updated account
      let poolShares = "0";
      try {
        const updatedAccount = await server.loadAccount(
          userKeypair.publicKey(),
        );
        const lpBalance = updatedAccount.balances.find(
          (balance: any) =>
            balance.asset_type === "liquidity_pool_shares" &&
            balance.liquidity_pool_id === liquidityPoolId,
        );
        poolShares = lpBalance?.balance || "0";
      } catch (error) {
        console.warn("Could not retrieve pool shares:", error);
      }

      // Calculate actual deposited amounts from transaction result
      let actualAmountA = amountA;
      let actualAmountB = amountB;

      try {
        // Try to parse actual amounts from transaction result
        if (result.result_xdr) {
          const { xdr } = await import("@stellar/stellar-sdk");
          const txResult = xdr.TransactionResult.fromXDR(
            result.result_xdr,
            "base64",
          );

          if (txResult.result().switch().name === "txSuccess") {
            const results = txResult.result().results();
            // Find the liquidityPoolDeposit operation result
            for (let i = 0; i < results.length; i++) {
              const opResult = results[i];
              if (opResult.tr().switch().name === "liquidityPoolDeposit") {
                const depositResult = opResult
                  .tr()
                  .liquidityPoolDepositResult();
                if (
                  depositResult.switch().name === "liquidityPoolDepositSuccess"
                ) {
                  // These would contain the actual deposited amounts
                  // Note: The exact structure may vary based on Stellar SDK version
                  console.log("Liquidity pool deposit successful");
                }
              }
            }
          }
        }
      } catch (parseError) {
        console.warn("Could not parse transaction result:", parseError);
      }

      console.log(
        `Added liquidity to pool ${liquidityPoolId}: ${actualAmountA} ${assetA.code || "XLM"} + ${actualAmountB} ${assetB.code || "XLM"}`,
      );

      return {
        hash: result.hash,
        status: "completed",
        poolId: liquidityPoolId,
        assetA: assetA.code || "XLM",
        assetB: assetB.code || "XLM",
        amountA: actualAmountA,
        amountB: actualAmountB,
        sharesReceived: poolShares,
        poolExists,
      };
    } catch (error: any) {
      console.error("Error adding liquidity:", error);

      // Provide more specific error messages
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient balance for liquidity operation");
        }
        if (resultCodes.operations?.includes("op_underfunded")) {
          throw new Error("Insufficient funds to complete liquidity operation");
        }
        if (resultCodes.operations?.includes("op_no_trust")) {
          throw new Error("Missing trustline for liquidity pool");
        }
        if (resultCodes.operations?.includes("op_line_full")) {
          throw new Error("Liquidity pool balance limit exceeded");
        }
        if (
          resultCodes.operations?.includes(
            "op_liquidity_pool_deposit_bad_price",
          )
        ) {
          throw new Error("Price range is invalid for current pool state");
        }
        if (resultCodes.operations?.includes("op_bad_price")) {
          throw new Error("Invalid price range specified");
        }
      }

      throw new Error(
        `Liquidity operation failed: ${error.message || "Unknown error"}`,
      );
    }
  }

  async getUserPoolShares(publicKey: string, poolId: string): Promise<string> {
    try {
      const account = await server.loadAccount(publicKey);
      const poolShareBalance = account.balances.find(
        (balance: any) =>
          balance.asset_type === "liquidity_pool_shares" &&
          balance.liquidity_pool_id === poolId,
      );

      return poolShareBalance ? poolShareBalance.balance : "0";
    } catch (error) {
      console.error("Error fetching pool shares:", error);
      return "0";
    }
  }

  /**
   * Create or join a liquidity pool
   */
  async createOrJoinLiquidity(
    secretKey: string,
    assetA: Asset,
    assetB: Asset,
    amountA: string,
    amountB: string,
    minPrice: string,
    maxPrice: string,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      // Validate amounts
      const amountANum = parseFloat(amountA);
      const amountBNum = parseFloat(amountB);

      if (amountANum <= 0 || amountBNum <= 0) {
        throw new Error("Invalid liquidity amounts");
      }

      // Check minimum amounts for fees
      if (amountANum < 0.5) {
        throw new Error("Minimum amount for liquidity is 0.5");
      }

      if (amountBNum < 0.1) {
        throw new Error("Minimum amount for liquidity is 0.1");
      }

      // Validate price range
      const minPriceNum = parseFloat(minPrice);
      const maxPriceNum = parseFloat(maxPrice);
      const currentPrice = amountBNum / amountANum;

      if (currentPrice < minPriceNum || currentPrice > maxPriceNum) {
        throw new Error(
          `Current price ${currentPrice.toFixed(6)} is outside the specified range [${minPrice}, ${maxPrice}]`,
        );
      }

      // Validate user has sufficient balances
      await this.validateUserBalances(
        account,
        assetA,
        assetB,
        amountANum,
        amountBNum,
      );

      // Create liquidity pool asset
      const liquidityPoolAsset = new LiquidityPoolAsset(assetA, assetB, 30); // 30 basis points fee
      const poolId = getLiquidityPoolId(
        "constant_product",
        liquidityPoolAsset,
      ).toString("hex");

      // Check if user has trustline to liquidity pool
      const hasPoolTrustline = account.balances.some(
        (balance: any) =>
          balance.asset_type === "liquidity_pool_shares" &&
          balance.liquidity_pool_id === poolId,
      );

      let transaction;
      const operations = [];

      // Add trustline to liquidity pool if it doesn't exist
      if (!hasPoolTrustline) {
        operations.push(
          Operation.changeTrust({
            asset: liquidityPoolAsset,
            limit: "1000000", // Set a reasonable limit
          }),
        );
      }

      // Add liquidity pool deposit operation
      operations.push(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: poolId,
          maxAmountA: amountA,
          maxAmountB: amountB,
          minPrice: minPrice,
          maxPrice: maxPrice,
        }),
      );

      // Build transaction
      transaction = new TransactionBuilder(account, {
        fee: (BASE_FEE * operations.length * 2).toString(), // Higher fee for multiple operations
        networkPassphrase,
      });

      // Add all operations
      operations.forEach((op) => transaction.addOperation(op));

      const builtTransaction = transaction.setTimeout(60).build();
      builtTransaction.sign(userKeypair);

      // Submit transaction
      const result = await server.submitTransaction(builtTransaction);

      // Calculate liquidity shares received
      const liquidityShares = await this.calculateLiquidityShares(
        poolId,
        amountANum,
        amountBNum,
      );

      console.log(
        `Added liquidity to pool ${poolId}: ${amountA} ${assetA.code || "XLM"} + ${amountB} ${assetB.code || "XLM"}`,
      );

      return {
        hash: result.hash,
        status: "completed",
        poolId,
        assetA: assetA.code || "XLM",
        assetB: assetB.code || "XLM",
        amountA,
        amountB,
        liquidityShares,
        poolCreated: !hasPoolTrustline,
      };
    } catch (error: any) {
      console.error("Error adding liquidity:", error);

      // Enhanced error handling
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        const operationCodes = resultCodes.operations || [];

        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient balance for this operation");
        }

        if (operationCodes.includes("op_underfunded")) {
          throw new Error("Insufficient funds to complete liquidity operation");
        }

        if (operationCodes.includes("op_line_full")) {
          throw new Error("Asset balance limit exceeded");
        }

        if (operationCodes.includes("op_no_trust")) {
          throw new Error("Missing trustline for one of the assets");
        }

        if (operationCodes.includes("op_liquidity_pool_not_found")) {
          throw new Error(
            "Liquidity pool does not exist and could not be created",
          );
        }

        if (operationCodes.includes("op_liquidity_pool_bad_price")) {
          throw new Error(
            "Price is outside acceptable range for this liquidity pool",
          );
        }
      }
      handleStellarError(error, "Failed to add liquidity: " + error.message);
    }
  }

  // Helper method to validate user balances
  private async validateUserBalances(
    account: any,
    assetA: Asset,
    assetB: Asset,
    amountANum: number,
    amountBNum: number,
  ): Promise<void> {
    const balances: any = account.balances;

    // Check asset A balance
    const balanceA = this.getAssetBalance(balances, assetA);
    if (balanceA < amountANum + (assetA.isNative() ? 1.0 : 0)) {
      const needed = amountANum + (assetA.isNative() ? 1.0 : 0);
      throw new Error(
        `Insufficient ${assetA.code || "XLM"} balance. You have ${balanceA.toFixed(2)} but need ${needed.toFixed(2)} (including fees)`,
      );
    }

    // Check asset B balance
    const balanceB = this.getAssetBalance(balances, assetB);
    if (balanceB < amountBNum) {
      throw new Error(
        `Insufficient ${assetB.code || "XLM"} balance. You have ${balanceB.toFixed(2)} but need ${amountBNum}`,
      );
    }
  }

  // Helper method to get balance for a specific asset
  private getAssetBalance(balances: any[], asset: Asset): number {
    let balance;

    if (asset.isNative()) {
      balance = balances.find((b) => b.asset_type === "native");
    } else {
      balance = balances.find(
        (b) =>
          b.asset_type === "credit_alphanum4" &&
          b.asset_code === asset.code &&
          b.asset_issuer === asset.issuer,
      );
    }

    return parseFloat(balance?.balance || "0");
  }

  // Helper method to calculate expected liquidity shares
  private async calculateLiquidityShares(
    poolId: string,
    amountA: number,
    amountB: number,
  ): Promise<number> {
    try {
      // Try to get pool info to calculate shares more accurately
      const poolInfo = await server
        .liquidityPools()
        .liquidityPoolId(poolId)
        .call();

      if (poolInfo.total_shares === "0") {
        // New pool, shares = sqrt(amountA * amountB) - minimum liquidity
        return Math.sqrt(amountA * amountB) - 0.001;
      } else {
        // Existing pool, calculate proportional shares
        const totalShares = parseFloat(poolInfo.total_shares);
        const reserveA = parseFloat(poolInfo.reserves[0].amount);
        const reserveB = parseFloat(poolInfo.reserves[1].amount);

        const sharesA = (amountA * totalShares) / reserveA;
        const sharesB = (amountB * totalShares) / reserveB;

        return Math.min(sharesA, sharesB);
      }
    } catch (error) {
      // Fallback calculation if pool info is not available
      return Math.sqrt(amountA * amountB);
    }
  }

  // Additional helper method to check if liquidity pool exists
  private async checkPoolExists(poolId: string): Promise<boolean> {
    try {
      await server.liquidityPools().liquidityPoolId(poolId).call();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(
    secretKey: string,
    poolId: string,
    amount: string,
    minAmountA: string,
    minAmountB: string,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.liquidityPoolWithdraw({
            liquidityPoolId: poolId,
            amount: amount,
            minAmountA: minAmountA,
            minAmountB: minAmountB,
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      console.log(`Removed liquidity: ${amount} LP tokens from pool ${poolId}`);

      return {
        hash: result.hash,
        status: "completed",
        poolId,
        amount,
        minAmountA,
        minAmountB,
      };
    } catch (error: any) {
      console.error("Error removing liquidity:", error);
      handleStellarError(error, "Failed to remove liquidity");
    }
  }

  /**
   * Get liquidity pool information
   */
  async getLiquidityPool(poolId: string): Promise<LiquidityPoolInfo | null> {
    try {
      const pool = await server.liquidityPools().liquidityPoolId(poolId).call();

      return {
        id: pool.id,
        assetA: new Asset(
          pool.reserves[0].asset.split(":")[0],
          pool.reserves[0].asset.split(":")[1],
        ),
        assetB: new Asset(
          pool.reserves[1].asset.split(":")[0],
          pool.reserves[1].asset.split(":")[1],
        ),
        reserves: {
          assetA: pool.reserves[0].amount,
          assetB: pool.reserves[1].amount,
        },
        totalShares: pool.total_shares,
        fee: pool.fee_bp,
      };
    } catch (error) {
      console.error("Error fetching liquidity pool:", error);
      return null;
    }
  }

  /**
   * Get all liquidity pools for user
   */
  async getUserLiquidityPools(secretKey: string): Promise<LiquidityPoolData[]> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const accountKeypair = Keypair.fromSecret(secretKey);

      const accountId = accountKeypair.publicKey();
      const pools: LiquidityPoolData[] = [];

      // Get account details to access balances
      const account = await server.loadAccount(accountId);

      // Filter balances to find liquidity pool shares
      const liquidityPoolBalances = account.balances.filter(
        (balance) => balance.asset_type === "liquidity_pool_shares",
      ) as Horizon.HorizonApi.BalanceLineLiquidityPool[];

      // Fetch detailed pool information for each liquidity pool share
      for (const poolBalance of liquidityPoolBalances) {
        try {
          const poolId = poolBalance.liquidity_pool_id;

          // Fetch liquidity pool details from Stellar
          const poolResponse = await server
            .liquidityPools()
            .liquidityPoolId(poolId)
            .call();

          const pool = poolResponse;
          if (!pool) continue;

          // Parse asset information
          const assetA =
            pool.reserves[0].asset === "native"
              ? "XLM"
              : `${pool.reserves[0].asset.split(":")[0]}`;

          const assetB =
            pool.reserves[1].asset === "native"
              ? "XLM"
              : `${pool.reserves[1].asset.split(":")[0]}`;

          const poolData: LiquidityPoolData = {
            poolId: poolId,
            balance: poolBalance.balance,
            poolInfo: {
              id: poolId,
              assets: {
                assetA: assetA,
                assetB: assetB,
              },
              reserves: {
                assetA: pool.reserves[0].amount,
                assetB: pool.reserves[1].amount,
              },
              totalShares: pool.total_shares,
              fee: pool.fee_bp, // Fee in basis points (30 = 0.3%)
            },
          };

          pools.push(poolData);
        } catch (poolError) {
          console.error(
            `Error fetching pool details for ${poolBalance.liquidity_pool_id}:`,
            poolError,
          );
          // Continue with other pools even if one fails
        }
      }

      // Optional: Also get historical liquidity pool operations
      const operations = await server
        .operations()
        .forAccount(accountId)
        .limit(200)
        .order("desc")
        .call();

      // Filter for liquidity pool operations to get additional context
      const liquidityPoolOps = operations.records.filter((op) =>
        [
          "change_trust",
          "liquidity_pool_deposit",
          "liquidity_pool_withdraw",
        ].includes(op.type),
      );

      // You can use liquidityPoolOps for additional analytics or transaction history
      console.log(
        `Found ${pools.length} active liquidity pools for user ${accountKeypair.publicKey()}`,
      );
      console.log(
        `Found ${liquidityPoolOps.length} liquidity pool operations in recent history`,
      );

      return pools;
    } catch (error) {
      console.error("Error fetching user liquidity pools from Stellar:", error);

      // Handle specific Stellar errors
      if (error instanceof Error) {
        if (error.message.includes("404")) {
          throw new Error("Stellar account not found or not funded");
        } else if (error.message.includes("timeout")) {
          throw new Error("Stellar network timeout - please try again");
        }
      }

      throw new Error("Failed to fetch liquidity pools from Stellar network");
    }
  }

  // Helper function to get more detailed pool analytics
  async getPoolAnalytics(poolId: string, server: Horizon.Server) {
    try {
      // Get pool trades for volume calculation
      const trades = await server
        .trades()
        .forLiquidityPool(poolId)
        .limit(100)
        .order("desc")
        .call();

      // Get pool operations for deposit/withdrawal activity
      const operations = await server
        .operations()
        .forLiquidityPool(poolId)
        .limit(50)
        .order("desc")
        .call();

      return {
        recentTradesCount: trades.records.length,
        recentOperationsCount: operations.records.length,
        trades: trades.records.slice(0, 10), // Last 10 trades
        operations: operations.records.slice(0, 10), // Last 10 operations
      };
    } catch (error) {
      console.error(`Error fetching analytics for pool ${poolId}:`, error);
      return null;
    }
  }

  // Enhanced version with analytics (optional)
  async getUserLiquidityPoolsWithAnalytics(userId: string): Promise<any[]> {
    const pools = await this.getUserLiquidityPools(userId);

    // Add analytics to each pool
    const poolsWithAnalytics = await Promise.all(
      pools.map(async (pool) => {
        const analytics = await this.getPoolAnalytics(pool.poolId, server);
        return {
          ...pool,
          analytics,
        };
      }),
    );

    return poolsWithAnalytics;
  }

  /**
   * Get trading pairs available for DOPE token
   */
  async getDOPETradingPairs(): Promise<TradingPair[]> {
    const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

    return [
      {
        baseAsset: dopeAsset,
        quoteAsset: Asset.native(),
        symbol: "DOPE/XLM",
      },
      {
        baseAsset: Asset.native(),
        quoteAsset: dopeAsset,
        symbol: "XLM/DOPE",
      },
      {
        baseAsset: dopeAsset,
        quoteAsset: new Asset("USDC", USDC_ISSUER_ACCOUNT),
        symbol: "DOPE/USDC",
      },
      {
        baseAsset: new Asset("USDC", USDC_ISSUER_ACCOUNT),
        quoteAsset: dopeAsset,
        symbol: "USDC/DOPE",
      },
      {
        baseAsset: new Asset("EURC", USDC_ISSUER_ACCOUNT),
        quoteAsset: dopeAsset,
        symbol: "EURC/DOPE",
      },
      {
        baseAsset: dopeAsset,
        quoteAsset: new Asset("EURC", USDC_ISSUER_ACCOUNT),
        symbol: "DOPE/EURC",
      },
    ];
  }

  /**
   * Create a new Stellar account with starting balance
   */
  async createAccount(
    sourceKeypair: Keypair,
    newAccountPublicKey: string,
    startingBalance: string = "2.00",
  ): Promise<string> {
    try {
      // Use distributor account as the funding source
      const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.createAccount({
            destination: newAccountPublicKey,
            startingBalance: startingBalance,
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(sourceKeypair);
      const result = await server.submitTransaction(transaction);

      console.log(
        `Created new account ${newAccountPublicKey} with ${startingBalance} XLM`,
      );
      return result.hash;
    } catch (error) {
      console.error("Error creating account:", error);
      throw error;
    }
  }

  /**
   * Create account and establish trustline for DOPE token in a single transaction
   */
  async createAccountWithDopeTrustline(
    newAccountKeypair: Keypair,
    startingBalance: string = "2.00", // Increased minimum balance
  ): Promise<string> {
    try {
      // First check if account already exists

      const account = newAccountKeypair;
      try {
        await server.loadAccount(account.publicKey());
        console.log(`Account ${account.publicKey()} already exists`);

        // Account exists, just add trustline if it doesn't exist
        return await this.addDopeTrustlineToExistingAccount(account);
      } catch (error: any) {
        if (!error.response || error.response.status !== 404) {
          throw error; // Re-throw if it's not a "not found" error
        }
        // Account doesn't exist, proceed with creation
      }

      const sourceAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());
      const usdcAsset = new Asset("USDC", USDC_ISSUER_ACCOUNT);
      const eurcAsset = new Asset("EURC", USDC_ISSUER_ACCOUNT);

      // Calculate minimum balance needed:
      // Base reserve (0.5 XLM) + trustline reserve (0.5 XLM) + buffer
      const minBalance = parseFloat(startingBalance);
      if (minBalance < 1.5) {
        throw new Error(
          "Starting balance too low. Minimum 1.5 XLM required for account + trustline",
        );
      }

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: (BASE_FEE * 2).toString(), // Fee for 2 operations
        networkPassphrase,
      })
        // First: Create the account with sufficient balance
        .addOperation(
          Operation.createAccount({
            destination: account.publicKey(),
            startingBalance: startingBalance,
          }),
        )
        // Second: Establish trustline for DOPE and GAS with USDC, and EURC asset from Circle.
        .addOperation(
          Operation.changeTrust({
            source: account.publicKey(),
            asset: dopeAsset,
            limit: "100000000", // 100 Million DOPE limit
          }),
        )
        .addOperation(
          Operation.changeTrust({
            source: account.publicKey(),
            asset: gasAsset,
            limit: "1000000", // 1 Million GAS limit
          }),
        )
        .addOperation(
          Operation.changeTrust({
            source: account.publicKey(),
            asset: usdcAsset,
            limit: "10000000", // 10 Million USDC limit
          }),
        )
        .addOperation(
          Operation.changeTrust({
            source: account.publicKey(),
            asset: eurcAsset,
            limit: "10000000", // 10 Million EURC limit
          }),
        )
        .setTimeout(60)
        .build();

      // Sign with both accounts
      transaction.sign(dopeDistributorKeypair);
      transaction.sign(newAccountKeypair);

      const result = await server.submitTransaction(transaction);

      console.log(
        `Created account ${newAccountKeypair.publicKey()} with DOPE trustline`,
      );
      return result.hash;
    } catch (error: any) {
      console.error("Error creating account with DOPE trustline:", error);

      // Handle specific Stellar errors
      if (error.response && error.response.data && error.response.data.extras) {
        const resultCodes = error.response.data.extras.result_codes;

        if (resultCodes.operations) {
          resultCodes.operations.forEach((opCode: string, index: number) => {
            if (opCode === "op_already_exists") {
              console.error(`Operation ${index}: Account already exists`);
            } else if (opCode === "op_low_reserve") {
              console.error(`Operation ${index}: Insufficient reserve balance`);
            }
          });
        }
      }

      throw error;
    }
  }

  // Helper function for adding trustline to existing accounts
  async addDopeTrustlineToExistingAccount(
    accountKeypair: Keypair,
  ): Promise<string> {
    try {
      const account = await server.loadAccount(accountKeypair.publicKey());
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());
      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());
      const usdcAsset = new Asset("USDC", USDC_ISSUER_ACCOUNT);
      const eurcAsset = new Asset("EURC", USDC_ISSUER_ACCOUNT);

      // Check if trustlines already exist
      const hasDopeTrustline = account.balances.some(
        (balance: any) =>
          balance.asset_type !== "native" &&
          balance.asset_code === "DOPE" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      const hasGasTrustline = account.balances.some(
        (balance: any) =>
          balance.asset_type !== "native" &&
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      const hasUsdcTrustline = account.balances.some(
        (balance: any) =>
          balance.asset_type !== "native" &&
          balance.asset_code === "USDC" &&
          balance.asset_issuer === USDC_ISSUER_ACCOUNT,
      );

      const hasEurcTrustline = account.balances.some(
        (balance: any) =>
          balance.asset_type !== "native" &&
          balance.asset_code === "EURC" &&
          balance.asset_issuer === USDC_ISSUER_ACCOUNT,
      );

      const missingTrustlines = [];
      if (!hasDopeTrustline) missingTrustlines.push({ asset: dopeAsset, name: "DOPE" });
      if (!hasGasTrustline) missingTrustlines.push({ asset: gasAsset, name: "GAS" });
      if (!hasUsdcTrustline) missingTrustlines.push({ asset: usdcAsset, name: "USDC" });
      if (!hasEurcTrustline) missingTrustlines.push({ asset: eurcAsset, name: "EURC" });

      if (missingTrustlines.length === 0) {
        console.log("All required trustlines already exist for this account");
        return "trustline_exists";
      }

      // For accounts where we don't have the secret key (during migration),
      // we can't create trustlines. The account needs to be created properly with trustlines.
      if (!accountKeypair.canSign()) {
        console.warn(`Cannot create trustlines for account without secret key: ${accountKeypair.publicKey()}`);
        throw new Error("Destination account must have trustlines - account cannot be signed");
      }

      // Check if account has enough balance for trustline reserve
      const nativeBalance = parseFloat(
        account.balances.find((b: any) => b.asset_type === "native")?.balance ||
          "0",
      );
      const requiredReserve = (2 + account.subentry_count + missingTrustlines.length) * 0.5;

      if (nativeBalance < requiredReserve) {
        throw new Error(
          `Insufficient balance for trustlines. Required: ${requiredReserve} XLM, Available: ${nativeBalance} XLM`,
        );
      }

      const transaction = new TransactionBuilder(account, {
        fee: (BASE_FEE * missingTrustlines.length).toString(),
        networkPassphrase,
      });

      // Add operations only for missing trustlines
      missingTrustlines.forEach(({ asset, name }) => {
        transaction.addOperation(
          Operation.changeTrust({
            asset: asset,
            limit: name === "DOPE" ? "100000000" : name === "GAS" ? "1000000" : "10000000",
          }),
        );
      });

      const builtTransaction = transaction.setTimeout(60).build();
      builtTransaction.sign(accountKeypair);
      const result = await server.submitTransaction(builtTransaction);

      console.log(
        `Added ${missingTrustlines.length} trustlines to account ${accountKeypair.publicKey()}`,
      );
      return result.hash;
    } catch (error) {
      console.error("Error adding trustline to existing account:", error);
      throw error;
    }
  }

  /**
   * Issue DOPE tokens using claimable balance instead of direct payment
   * This allows users to claim tokens even if their account doesn't exist yet
   */
  async issueDopeTokens(secretKey: string, amount: string): Promise<void> {
    try {
      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

      // Check if user account exists
      const accountKeypair = Keypair.fromSecret(secretKey);
      const accountExists = await this.accountExists(
        accountKeypair.publicKey(),
      );

      let createAccountTxHash: string | null = null;
      // If account doesn't exist, create it with DOPE trustline
      if (!accountExists) {
        if (!secretKey) {
          throw new Error(
            "User stellar secret key not found for account creation",
          );
        }

        const userKeypair = Keypair.fromSecret(secretKey);
        createAccountTxHash =
          await this.createAccountWithDopeTrustline(userKeypair);

        // Wait for account creation to propagate
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        // Check if trustline exists, create if needed
        const account = await server.loadAccount(accountKeypair.publicKey());
        const existingTrustline = account.balances.find(
          (balance: any) =>
            balance.asset_type === "credit_alphanum4" &&
            balance.asset_code === "DOPE" &&
            balance.asset_issuer === dopeIssuerKeypair.publicKey(),
        );

        if (!existingTrustline) {
          await this.createUserToken(secretKey);
          // Wait for trustline to propagate
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Use distributor account to create claimable balance
      const distributorAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );

      // Create claimant - user can claim balances anytime.
      const claimant = new Claimant(
        accountKeypair.publicKey(),
        Claimant.predicateUnconditional(),
      );

      const formattedAmount = amount.replace(/[^0-9.]/g, "");

      const transaction = new TransactionBuilder(distributorAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.createClaimableBalance({
            asset: dopeAsset,
            amount: formattedAmount,
            claimants: [claimant],
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(dopeDistributorKeypair);
      const result = await server.submitTransaction(transaction);

      // Get claimable balance ID using Horizon API
      let claimableBalanceId: string | null =
        await this.extractClaimableBalanceId(result);

      console.log(
        `Created claimable balance with ${formattedAmount} DOPE tokens for user ${accountKeypair.publicKey()}`,
      );
      if (claimableBalanceId) {
        console.log(`Claimable Balance ID: ${claimableBalanceId}`);
      }

      // Note: Don't update wallet balance here as tokens are not yet claimed
      // Balance will be updated when user claims the tokens
    } catch (error) {
      console.error("Error issuing DOPE tokens via claimable balance:", error);
      throw error;
    }
  }

  /**
   * Extract claimable balance ID from transaction result
   */
  private async extractClaimableBalanceId(
    transactionResult: any,
  ): Promise<string | null> {
    try {
      // Method 1: Check transaction result effects
      if (
        transactionResult.effects &&
        Array.isArray(transactionResult.effects)
      ) {
        const claimableBalanceEffect = transactionResult.effects.find(
          (effect: any) =>
            effect.type === "claimable_balance_created" ||
            effect.type === "claimable_balance_claimant_created",
        );
        if (claimableBalanceEffect && claimableBalanceEffect.id) {
          return claimableBalanceEffect.id;
        }
      }

      // Method 2: Parse from result_meta_xdr (more reliable)
      if (transactionResult.result_meta_xdr) {
        try {
          const resultMeta = transactionResult.result_meta_xdr;
          // The claimable balance ID is embedded in the XDR
          // We need to use Stellar SDK to parse it
          const { xdr } = require("@stellar/stellar-sdk");
          const meta = xdr.TransactionMeta.fromXDR(resultMeta, "base64");

          // Look through the operation changes
          if (meta.v1() && meta.v1().operations()) {
            const operations = meta.v1().operations();
            for (let i = 0; i < operations.length; i++) {
              const opMeta = operations[i];
              if (opMeta.changes()) {
                const changes = opMeta.changes();
                for (let j = 0; j < changes.length; j++) {
                  const change = changes[j];
                  if (change.arm() === "created" && change.created()) {
                    const ledgerEntry = change.created();
                    if (ledgerEntry.data().arm() === "claimableBalance") {
                      const balanceEntry = ledgerEntry
                        .data()
                        .claimableBalance();
                      return balanceEntry.balanceId().toXDR("hex");
                    }
                  }
                }
              }
            }
          }
        } catch (xdrError) {
          console.error("Error parsing XDR:", xdrError);
        }
      }

      // Method 3: Use Stellar SDK's built-in method (if available)
      if (transactionResult.successful && transactionResult.hash) {
        // Query the transaction details from Horizon
        return await this.queryClaimableBalanceFromHorizon(
          transactionResult.hash,
        );
      }

      console.warn(
        "Could not extract claimable balance ID from transaction result",
      );
      console.log(
        "Transaction result structure:",
        JSON.stringify(transactionResult, null, 2),
      );
      return null;
    } catch (error) {
      console.error("Error extracting claimable balance ID:", error);
      return null;
    }
  }

  /**
   * Alternative method: Query Horizon server for the claimable balance ID
   */
  private async queryClaimableBalanceFromHorizon(
    transactionHash: string,
  ): Promise<string | null> {
    try {
      // Wait a moment for the transaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const transaction = await server
        .transactions()
        .transaction(transactionHash)
        .call();

      if (transaction.successful) {
        // Get the effects of this transaction
        const effects = await server
          .effects()
          .forTransaction(transactionHash)
          .call();

        const claimableBalanceEffect = effects.records.find(
          (effect: any) =>
            effect.type === "claimable_balance_created" ||
            effect.type === "claimable_balance_claimant_created",
        );

        if (claimableBalanceEffect) {
          return claimableBalanceEffect.id;
        }
      }

      return null;
    } catch (error) {
      console.error("Error querying claimable balance from Horizon:", error);
      return null;
    }
  }

  /**
   * Claim a claimable balance
   */
  async claimBalance(
    secretKey: string,
    claimableBalanceId: string,
  ): Promise<any> {
    try {
      if (!secretKey) {
        throw new Error("User stellar secret key not found");
      }

      const userKeypair = Keypair.fromSecret(secretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.claimClaimableBalance({
            balanceId: claimableBalanceId,
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      console.log(
        `User ${userKeypair.publicKey()} claimed claimable balance ${claimableBalanceId}`,
      );

      return {
        hash: result.hash,
        status: "completed",
        claimableBalanceId,
      };
    } catch (error) {
      console.error("Error claiming balance:", error);
      throw error;
    }
  }

  private isCreditAsset(balance: any) {
    return (
      balance.asset_type === "credit_alphanum4" ||
      balance.asset_type === "credit_alphanum12"
    );
  }

  getCirculatingSupply = async (): Promise<number> => {
    const assetCode = "DOPE";
    const issuer = dopeIssuerKeypair.publicKey();
    const distributor = dopeDistributorKeypair.publicKey();
    const asset = new Asset(assetCode, issuer);
    let total = 0;
    let page = await server.accounts().forAsset(asset).limit(200).call();

    while (true) {
      for (const account of page.records) {
        // Skip both issuing account and distributor account
        if (
          account.account_id === issuer ||
          account.account_id === distributor
        ) {
          continue;
        }

        const balances: any = account.balances;
        for (const balance of balances) {
          if (
            this.isCreditAsset(balance) &&
            balance.asset_code === assetCode &&
            balance.asset_issuer === issuer
          ) {
            total += parseFloat(balance.balance);
          }
        }
      }

      if (!page.records.length || !page.next) break;
      page = await page.next();
    }

    return total;
  };

  // Add this function to set up the distributor account with GAS trustline
  private async setupDistributorTrustline(): Promise<void> {
    try {
      console.log("Setting up Trustline for distributor account...");

      const distributorAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );
      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());

      // Check if trustline already exists
      const existingTrustline = distributorAccount.balances.find(
        (balance: any) =>
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      if (existingTrustline) {
        await this.buildTrustlineTransaction(distributorAccount);
        console.log("GAS trustline already exists for distributor");
        return;
      }

      // Create trustline transaction
      const transaction = new TransactionBuilder(distributorAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: gasAsset,
            // Optional: set limit, or omit for maximum limit
            // limit: "100000000" // 100 million GAS tokens max
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(dopeDistributorKeypair);
      const result = await server.submitTransaction(transaction);

      await this.buildTrustlineTransaction(distributorAccount);

      console.log(
        `Trustline created for distributor. Transaction Hash: GAS-${result.hash}`,
      );
    } catch (error: any) {
      console.error("Error setting up distributor trustline:", error);
      try {
        const dopeDistributorAccount = await server.loadAccount(
          dopeDistributorKeypair.publicKey(),
        );
        this.buildTrustlineTransaction(dopeDistributorAccount);
        console.log("Trustline created to distributor for USDC.");
      } catch (error: any) {
        throw new Error(
          "Failed to setup distributor trustline: " + error.message,
        );
      }
    }
  }

  buildTrustlineTransaction = async (account: any) => {
    try {
      const existingUSDCTrustline = account.balances.find(
        (balance: any) =>
          balance.asset_code === "USDC" &&
          balance.asset_issuer === USDC_ISSUER_ACCOUNT,
      );

      if (existingUSDCTrustline) {
        console.error("USDC trustline already exists for distributor");
        return;
      }

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset("USDC", USDC_ISSUER_ACCOUNT),
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(dopeDistributorKeypair);

      await server.submitTransaction(transaction);
    } catch (error: any) {
      console.error("Error setting up distributor trustline:", error);
    }
  };

  // Call this during your app initialization
  async initializeDistributor() {
    await this.setupDistributorTrustline();
  }

  createTrustline = async (
    secretKey: string,
    assetCode: string,
    assetIssuer: string,
  ) => {
    try {
      // Exclude native asset (XLM)
      if (Asset.native().equals(new Asset(assetCode, assetIssuer))) {
        throw new Error("Cannot create trustline for native asset (XLM)");
      }

      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const asset = new Asset(assetCode, assetIssuer);

      const userKeypair = Keypair.fromSecret(secretKey);

      const account = await server.loadAccount(userKeypair.publicKey());

      const existingTrustline = account.balances.find(
        (balance: any) =>
          balance.asset_type === asset.getAssetType() &&
          balance.asset_code === asset.code &&
          balance.asset_issuer === asset.issuer,
      );

      if (!existingTrustline) {
        const transaction = new TransactionBuilder(account, {
          fee: BASE_FEE.toString(),
          networkPassphrase,
        })
          .addOperation(
            Operation.changeTrust({
              asset: asset,
            }),
          )
          .setTimeout(30)
          .build();
        transaction.sign(userKeypair);
        await server.submitTransaction(transaction);
        console.log(`Trustline created for ${assetCode}`);
      } else {
        throw new Error(`Trustline for ${assetCode} already exists`);
      }
    } catch (error: any) {
      handleStellarError(error, "Failed to add trustline");
    }
  };

  private async getAccountOperations(
    publicKey: string,
    limit: number = 20,
    cursor?: string,
  ): Promise<OperationRecord[]> {
    try {
      // Build operations request
      let operationsRequest = server
        .operations()
        .forAccount(publicKey)
        .order("desc")
        .limit(limit)
        .includeFailed(true);

      if (cursor) {
        operationsRequest = operationsRequest.cursor(cursor);
      }

      const operationsResponse = await operationsRequest.call();
      const operations: OperationRecord[] = [];

      for (const operation of operationsResponse.records) {
        const operationRecord = await this.parseOperation(operation, publicKey);
        if (operationRecord) {
          operations.push(operationRecord);
        }
      }

      return operations;
    } catch (error: any) {
      console.error("Error fetching account operations:", error);
      throw new Error(`Failed to fetch operations: ${error.message}`);
    }
  }

  async parseOperation(
    operation: any,
    userPublicKey: string,
  ): Promise<OperationRecord | null> {
    try {
      const baseRecord = {
        id: operation.id,
        stellarTxId: operation.transaction_hash,
        status: operation.transaction_successful ? "completed" : "failed",
        metadata: {
          operationId: operation.id,
          createdAt: operation.created_at,
          pagingToken: operation.paging_token,
        },
        createdAt: operation.created_at,
      };

      switch (operation.type) {
        case "create_account":
          return {
            ...baseRecord,
            type: "account_creation",
            amount: operation.starting_balance,
            fromAddress: operation.funder,
            toAddress: operation.account,
            assetType: "XLM",
            metadata: {
              ...baseRecord.metadata,
              startingBalance: operation.starting_balance,
              funder: operation.funder,
            },
            createdAt: operation.created_at,
          };

        case "payment":
          const isReceiving = operation.to === userPublicKey;
          const assetType =
            operation.asset_type === "native"
              ? "XLM"
              : `${operation.asset_code}`;

          return {
            ...baseRecord,
            type: isReceiving ? "payment_received" : "payment_sent",
            amount: operation.amount,
            fromAddress: operation.from,
            toAddress: operation.to,
            assetType,
            metadata: {
              ...baseRecord.metadata,
              asset: {
                type: operation.asset_type,
                code: operation.asset_code,
                issuer: operation.asset_issuer,
              },
              sourceAmount: operation.source_amount,
              sourceAsset:
                operation.source_asset_type === "native"
                  ? "XLM"
                  : `${operation.source_asset_code}`,
            },
            createdAt: operation.created_at,
          };

        case "path_payment_strict_receive":
        case "path_payment_strict_send":
          const isReceivingPath = operation.to === userPublicKey;
          const destinationAsset =
            operation.asset_type === "native"
              ? "XLM"
              : `${operation.asset_code}`;

          return {
            ...baseRecord,
            type: isReceivingPath
              ? "path_payment_received"
              : "path_payment_sent",
            amount: operation.amount,
            fromAddress: operation.from,
            toAddress: operation.to,
            assetType: destinationAsset,
            metadata: {
              ...baseRecord.metadata,
              sourceAmount: operation.source_amount,
              sourceAsset:
                operation.source_asset_type === "native"
                  ? "XLM"
                  : `${operation.source_asset_code}`,
              destinationAsset: {
                type: operation.asset_type,
                code: operation.asset_code,
                issuer: operation.asset_issuer,
              },
              path: operation.path,
            },
            createdAt: operation.created_at,
          };

        case "change_trust":
          const trustAsset = `${operation.asset_code}`;
          const isRemovingTrust = parseFloat(operation.limit) === 0;

          return {
            ...baseRecord,
            type: isRemovingTrust ? "trustline_removed" : "trustline_created",
            amount: operation.limit,
            fromAddress: userPublicKey,
            toAddress: operation.asset_issuer,
            assetType: trustAsset,
            metadata: {
              ...baseRecord.metadata,
              asset: {
                code: operation.asset_code,
                issuer: operation.asset_issuer,
              },
              limit: operation.limit,
              trustor: operation.trustor,
            },
            createdAt: operation.created_at,
          };

        case "manage_sell_offer":
        case "manage_buy_offer":
          const sellingAsset =
            operation.selling_asset_type === "native"
              ? "XLM"
              : `${operation.selling_asset_code}`;
          const buyingAsset =
            operation.buying_asset_type === "native"
              ? "XLM"
              : `${operation.buying_asset_code}`;

          return {
            ...baseRecord,
            type:
              operation.type === "manage_sell_offer"
                ? "sell_offer"
                : "buy_offer",
            amount: operation.amount,
            fromAddress: userPublicKey,
            toAddress: "", // No specific recipient for offers
            assetType: `${sellingAsset}/${buyingAsset}`,
            metadata: {
              ...baseRecord.metadata,
              offerId: operation.offer_id,
              sellingAsset: {
                type: operation.selling_asset_type,
                code: operation.selling_asset_code,
                issuer: operation.selling_asset_issuer,
              },
              buyingAsset: {
                type: operation.buying_asset_type,
                code: operation.buying_asset_code,
                issuer: operation.buying_asset_issuer,
              },
              price: operation.price,
              priceR: operation.price_r,
            },
            createdAt: operation.created_at,
          };

        case "create_passive_sell_offer":
          const passiveSellingAsset =
            operation.selling_asset_type === "native"
              ? "XLM"
              : `${operation.selling_asset_code}:${operation.selling_asset_issuer}`;
          const passiveBuyingAsset =
            operation.buying_asset_type === "native"
              ? "XLM"
              : `${operation.buying_asset_code}`;

          return {
            ...baseRecord,
            type: "passive_offer",
            amount: operation.amount,
            fromAddress: userPublicKey,
            toAddress: "",
            assetType: `${passiveSellingAsset}/${passiveBuyingAsset}`,
            metadata: {
              ...baseRecord.metadata,
              sellingAsset: {
                type: operation.selling_asset_type,
                code: operation.selling_asset_code,
                issuer: operation.selling_asset_issuer,
              },
              buyingAsset: {
                type: operation.buying_asset_type,
                code: operation.buying_asset_code,
                issuer: operation.buying_asset_issuer,
              },
              price: operation.price,
            },
            createdAt: operation.created_at,
          };

        case "set_options":
          return {
            ...baseRecord,
            type: "account_options",
            amount: "0",
            fromAddress: userPublicKey,
            toAddress: userPublicKey,
            assetType: "CONFIG",
            metadata: {
              ...baseRecord.metadata,
              inflationDest: operation.inflation_dest,
              clearFlags: operation.clear_flags,
              setFlags: operation.set_flags,
              masterWeight: operation.master_weight,
              lowThreshold: operation.low_threshold,
              medThreshold: operation.med_threshold,
              highThreshold: operation.high_threshold,
              homeDomain: operation.home_domain,
              signer: operation.signer_key
                ? {
                    key: operation.signer_key,
                    weight: operation.signer_weight,
                  }
                : null,
            },
            createdAt: operation.created_at,
          };

        case "allow_trust":
          return {
            ...baseRecord,
            type: operation.authorize ? "trust_authorized" : "trust_revoked",
            amount: "0",
            fromAddress: operation.trustee,
            toAddress: operation.trustor,
            assetType: operation.asset_code,
            metadata: {
              ...baseRecord.metadata,
              assetCode: operation.asset_code,
              trustee: operation.trustee,
              trustor: operation.trustor,
              authorize: operation.authorize,
            },
            createdAt: operation.created_at,
          };

        case "account_merge":
          return {
            ...baseRecord,
            type: "account_merge",
            amount: "0", // Amount is not directly available in operation
            fromAddress: operation.account,
            toAddress: operation.destination,
            assetType: "XLM",
            metadata: {
              ...baseRecord.metadata,
              mergedAccount: operation.account,
              destination: operation.destination,
            },
            createdAt: operation.created_at,
          };

        case "inflation":
          return {
            ...baseRecord,
            type: "inflation",
            amount: "0",
            fromAddress: userPublicKey,
            toAddress: "",
            assetType: "XLM",
            metadata: {
              ...baseRecord.metadata,
            },
            createdAt: operation.created_at,
          };

        case "manage_data":
          return {
            ...baseRecord,
            type: "data_entry",
            amount: "0",
            fromAddress: userPublicKey,
            toAddress: userPublicKey,
            assetType: "DATA",
            metadata: {
              ...baseRecord.metadata,
              dataName: operation.name,
              dataValue: operation.value,
            },
            createdAt: operation.created_at,
          };

        case "bump_sequence":
          return {
            ...baseRecord,
            type: "sequence_bump",
            amount: "0",
            fromAddress: userPublicKey,
            toAddress: userPublicKey,
            assetType: "SEQ",
            metadata: {
              ...baseRecord.metadata,
              bumpTo: operation.bump_to,
            },
            createdAt: operation.created_at,
          };

        case "create_claimable_balance":
          const createAssetType =
            operation.asset === "native"
              ? "XLM"
              : `${operation.asset.split(":")[0]}`;

          return {
            ...baseRecord,
            type: "claimable_balance_created",
            amount: operation.amount,
            fromAddress: userPublicKey,
            toAddress: "", // Multiple potential claimants
            assetType: createAssetType,
            metadata: {
              ...baseRecord.metadata,
              balanceId: operation.balance_id,
              asset: operation.asset === "native" ? "XLM" : operation.asset,
              claimants:
                operation.claimants?.map((claimant: any) => ({
                  destination: claimant.destination,
                  predicate: claimant.predicate,
                })) || [],
              sponsor: operation.sponsor,
            },
            createdAt: operation.created_at,
          };

        case "claim_claimable_balance":
          const claimAssetType =
            operation.asset === "native"
              ? "XLM"
              : `${operation.asset.split(":")[0]}`;

          return {
            ...baseRecord,
            type: "claimable_balance_claimed",
            amount: operation.amount || "0", // Amount might not be directly available
            fromAddress: "", // Original creator not in operation
            toAddress: userPublicKey,
            assetType: claimAssetType,
            metadata: {
              ...baseRecord.metadata,
              balanceId: operation.balance_id,
              asset: operation.asset === "native" ? "XLM" : operation.asset,
              claimant: operation.claimant,
            },
            createdAt: operation.created_at,
          };

        case "clawback":
          const clawbackAssetType =
            operation.asset_type === "native"
              ? "XLM"
              : `${operation.asset_code}`;

          return {
            ...baseRecord,
            type: "clawback",
            amount: operation.amount,
            fromAddress: operation.from, // Account being clawed back from
            toAddress: operation.asset_issuer, // Asset issuer doing the clawback
            assetType: operation.asset_code,
            metadata: {
              ...baseRecord.metadata,
              asset: {
                type: operation.asset_type,
                code: clawbackAssetType,
                issuer: operation.asset_issuer,
              },
              from: operation.from,
            },
            createdAt: operation.created_at,
          };

        case "clawback_claimable_balance":
          return {
            ...baseRecord,
            type: "claimable_balance_clawed_back",
            amount: "0", // Amount not directly available
            fromAddress: userPublicKey,
            toAddress: "",
            assetType: "CLAIMABLE",
            metadata: {
              ...baseRecord.metadata,
              balanceId: operation.balance_id,
            },
            createdAt: operation.created_at,
          };

        case "set_trust_line_flags":
          return {
            ...baseRecord,
            type: "trustline_flags_set",
            amount: "0",
            fromAddress: operation.asset_issuer,
            toAddress: operation.trustor,
            assetType: operation.asset_code,
            metadata: {
              ...baseRecord.metadata,
              asset: {
                code: operation.asset_code,
                issuer: operation.asset_issuer,
              },
              trustor: operation.trustor,
              clearFlags: operation.clear_flags,
              setFlags: operation.set_flags,
            },
            createdAt: operation.created_at,
          };

        case "liquidity_pool_deposit":
          return {
            ...baseRecord,
            type: "liquidity_pool_deposit",
            amount: operation.max_amount_a || "0",
            fromAddress: userPublicKey,
            toAddress: "", // Pool address
            assetType: "LP_SHARES",
            metadata: {
              ...baseRecord.metadata,
              liquidityPoolId: operation.liquidity_pool_id,
              maxAmountA: operation.max_amount_a,
              maxAmountB: operation.max_amount_b,
              minPrice: operation.min_price,
              maxPrice: operation.max_price,
              reserveA: operation.reserve_a,
              reserveB: operation.reserve_b,
              shares: operation.shares_received,
            },
            createdAt: operation.created_at,
          };

        case "liquidity_pool_withdraw":
          return {
            ...baseRecord,
            type: "liquidity_pool_withdraw",
            amount: operation.shares || "0",
            fromAddress: userPublicKey,
            toAddress: "",
            assetType: "LP_SHARES",
            metadata: {
              ...baseRecord.metadata,
              liquidityPoolId: operation.liquidity_pool_id,
              shares: operation.shares,
              minAmountA: operation.min_amount_a,
              minAmountB: operation.min_amount_b,
              reserveA: operation.reserve_a,
              reserveB: operation.reserve_b,
            },
            createdAt: operation.created_at,
          };

        // Add more operation types as needed
        default:
          return {
            ...baseRecord,
            type: operation.type || "unknown",
            amount: "0",
            fromAddress: userPublicKey,
            toAddress: "",
            assetType: "UNKNOWN",
            metadata: {
              ...baseRecord.metadata,
              rawOperation: operation,
            },
            createdAt: operation.created_at,
          };
      }
    } catch (error) {
      console.error("Error parsing operation:", error, operation);
      return null;
    }
  }

  // Helper function to get operations with pagination
  async getAllUserOperations(
    publicKey: string,
    maxOperations: number = 200,
  ): Promise<OperationRecord[]> {
    const allOperations: OperationRecord[] = [];
    let cursor: string | undefined;
    const batchSize = 50;

    try {
      while (allOperations.length < maxOperations) {
        const remainingOperations = maxOperations - allOperations.length;
        const limit = Math.min(batchSize, remainingOperations);

        const operations = await this.getAccountOperations(
          publicKey,
          limit,
          cursor,
        );

        if (operations.length === 0) {
          break; // No more operations
        }

        allOperations.push(...operations);

        // Get cursor for next batch (last operation's paging token)
        const lastOperation = operations[operations.length - 1];
        cursor = lastOperation.metadata?.pagingToken;
      }

      return allOperations;
    } catch (error) {
      console.error("Error fetching all operations:", error);
      throw error;
    }
  }

  // Helper function to get claimable balances for an account
  async getClaimableBalances(publicKey: string): Promise<any[]> {
    try {
      const claimableBalances = await server
        .claimableBalances()
        .claimant(publicKey)
        .call();

      return claimableBalances.records.map((balance: any) => ({
        id: balance.id,
        asset:
          balance.asset === "native"
            ? "XLM"
            : `${balance.asset.split(":")[0]}:${balance.asset.split(":")[1]}`,
        amount: balance.amount,
        claimants: balance.claimants,
        sponsor: balance.sponsor,
        lastModifiedLedger: balance.last_modified_ledger,
        lastModifiedTime: balance.last_modified_time,
      }));
    } catch (error) {
      console.error("Error fetching claimable balances:", error);
      throw error;
    }
  }

  // Helper function to get both operations and current claimable balances
  private async getAccountActivityWithClaimableBalances(
    publicKey: string,
    limit: number = 50,
  ): Promise<{
    operations: OperationRecord[];
    claimableBalances: any[];
  }> {
    try {
      const [operations, claimableBalances] = await Promise.all([
        this.getAccountOperations(publicKey, limit),
        this.getClaimableBalances(publicKey),
      ]);

      return {
        operations,
        claimableBalances,
      };
    } catch (error) {
      console.error("Error fetching account activity:", error);
      throw error;
    }
  }

  // Helper function to get operations within date range
  filterOperationsByDateRange(
    operations: OperationRecord[],
    startDate: Date,
    endDate: Date,
  ): OperationRecord[] {
    return operations.filter((op) => {
      const opDate = new Date(op.metadata.createdAt);
      return opDate >= startDate && opDate <= endDate;
    });
  }

  private filterOperationsByType(
    operations: OperationRecord[],
    types: string[],
  ): OperationRecord[] {
    return operations.filter((op) => types.includes(op.type));
  }

  async getUserAssets(userId: string) {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet?.publicKey) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(wallet.publicKey);

      console.log("Assets held by", wallet.publicKey);

      const filteredAccount = account.balances.filter((balance: any) => {
        // Include native XLM
        if (balance.asset_type === "native") {
          return true;
        }
        // Exclude any asset that contains "DOPE", "liquidity_pool_share in the asset
        return (
          !balance.asset_code?.includes("DOPE") &&
          balance.asset_type !== "liquidity_pool_shares"
        );
      });

      filteredAccount.forEach((balance: any) => {
        if (balance.asset_type === "native") {
          console.log(`XLM: ${balance.balance}`);
        } else {
          console.log(
            `${balance.asset_code} (${balance.asset_issuer}): ${balance.balance}`,
          );
        }
      });

      return filteredAccount;
    } catch (error: any) {
      console.error(
        "Error fetching account:",
        error.response.data.extras.result_codes || error,
      );
      handleStellarError(error, "Failed to fetch account assets");
    }
  }

  async getUserTransactionHistory(
    userId: string,
    limit: number = 10,
    cursor?: string,
  ): Promise<OperationRecord[]> {
    try {
      const wallet = await storage.getWallet(userId);
      if (!wallet?.publicKey) {
        throw new Error("User stellar account not found");
      }

      const operations = await this.getAccountOperations(
        wallet.publicKey,
        limit,
        cursor,
      );

      // Filter to only payment and claimable balance related operations
      const transactionTypes = [
        "payment_sent",
        "payment_received",
        "path_payment_sent",
        "path_payment_received",
        "account_creation",
        "claimable_balance_created",
        "claimable_balance_claimed",
        "claimable_balance_clawed_back",
        "change_trust",
        "liquidity_pool_deposit",
        "liquidity_pool_withdraw",
        "manage_sell_offer",
        "manage_buy_offer",
      ];

      //return this.filterOperationsByType(operations, transactionTypes);
      return operations;
    } catch (error) {
      console.error("Error getting user transaction history:", error);
      throw error;
    }
  }
}

interface StellarError extends Error {
  response?: {
    data?: {
      extras?: {
        result_codes?: {
          transaction?: string;
          operations?: string[];
        };
      };
    };
  };
}

function handleStellarError(
  error: StellarError,
  defaultMessage: string,
): never {
  console.error("Stellar Error:", error.message);

  if (error.response?.data?.extras?.result_codes) {
    const resultCodes = error.response.data.extras.result_codes;

    if (resultCodes.transaction === "tx_insufficient_fee") {
      throw new Error("Transaction fee too low. Please try again.");
    }

    if (resultCodes.operations?.includes("op_underfunded")) {
      throw new Error("Insufficient balance for this operation");
    }

    if (resultCodes.operations?.includes("op_no_trust")) {
      throw new Error("Trustline required for this asset");
    }

    if (resultCodes.operations?.includes("op_line_full")) {
      throw new Error("Asset balance limit exceeded");
    }
  }

  throw new Error(error.message || defaultMessage);
}

export {
  server,
  BASE_FEE,
  networkPassphrase,
  dopeIssuerKeypair,
  dopeDistributorKeypair,
};

export const stellarService = new StellarService();
