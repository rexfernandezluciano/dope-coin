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
} from "@stellar/stellar-sdk";
import { storage } from "../storage.js";

// Replace the current STELLAR_NETWORK and STELLAR_SERVER_URL configuration
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_SERVER_URLS = {
  testnet: "https://horizon-testnet.stellar.org",
  mainnet: "https://horizon.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
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

const BASE_FEE = parseFloat(process.env.BASE_FEE || "1000");
const LIQUIDITY_FEE = parseFloat(process.env.LIQUIDITY_FEE || "3000");
const ACCOUNT_FEE = parseFloat(process.env.ACCOUNT_FEE || "100000");

// Platform DOPE token issuer (should be in environment variables in production)
const DOPE_ISSUER_SECRET =
  process.env.DOPE_ISSUER_SECRET || Keypair.random().secret();
const DOPE_DISTRIBUTOR_SECRET =
  process.env.DOPE_DISTRIBUTOR_SECRET || Keypair.random().secret();

const dopeIssuerKeypair = Keypair.fromSecret(DOPE_ISSUER_SECRET);
const dopeDistributorKeypair = Keypair.fromSecret(DOPE_DISTRIBUTOR_SECRET);

const UsdtIssuerPublicKey =
  "GA5IK5GGEH2ZPSJOLHS6X5DXNX7VVV35PPMUUKAZPCQ7NB7NSVRZ3WOI";

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
      console.log("DOPE and GAS token platform setup completed");
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
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(user.stellarPublicKey);
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

  async getGASBalance(userId: string): Promise<number> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const account = await server.loadAccount(user.stellarPublicKey);
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

  async createUserToken(userId: string): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);

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
        console.log(`All trustlines already exist for user ${userId}`);
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
      console.log(`Token trustlines created for user ${userId}`);
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
  async convertXLMToGAS(userId: string, xlmAmount: string): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const userAccount = await server.loadAccount(userKeypair.publicKey());

      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());
      const gasAmount = (parseFloat(xlmAmount) * 100).toString(); // 1 XLM = 100 GAS

      // Check if user has GAS trustline, create if needed
      const existingGasTrustline = userAccount.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      if (!existingGasTrustline) {
        // Create GAS trustline first
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

      // Use a single transaction to convert XLM to GAS
      // The issuer creates new GAS tokens in exchange for XLM
      const updatedUserAccount = await server.loadAccount(
        userKeypair.publicKey(),
      );

      const conversionTransaction = new TransactionBuilder(updatedUserAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        // Send XLM to issuer
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

      // Now issuer creates and sends GAS tokens to user
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

      // Record the conversion transaction
      await storage.createTransaction({
        userId,
        type: "gas_conversion",
        amount: xlmAmount,
        fromAddress: userKeypair.publicKey(),
        toAddress: dopeIssuerKeypair.publicKey(),
        stellarTxId: gasResult.hash,
        assetType: "XLM->GAS",
        status: "completed",
        metadata: {
          xlmAmount,
          gasAmount,
          conversionRate: "100",
          xlmTxHash: xlmResult.hash,
          gasTxHash: gasResult.hash,
        },
      });

      return {
        hash: gasResult.hash,
        xlmAmount,
        gasAmount,
        status: "completed",
        xlmTxHash: xlmResult.hash,
        gasTxHash: gasResult.hash,
      };
    } catch (error: any) {
      console.error("Error converting XLM to GAS:", error);

      // Provide more specific error messages
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient XLM balance for conversion");
        }
        if (resultCodes.operations?.includes("op_no_trust")) {
          throw new Error("GAS trustline creation failed");
        }
        if (resultCodes.operations?.includes("op_line_full")) {
          throw new Error("GAS balance limit exceeded");
        }
      }

      throw new Error(`Conversion failed: ${error.message || "Unknown error"}`);
    }
  }

  async sendTokens(
    userId: string,
    toAddress: string,
    amount: string,
    assetType: "XLM" | "DOPE",
  ): Promise<any> {
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

      // Record transaction in database
      await storage.createTransaction({
        userId,
        type: "send",
        amount: amount,
        fromAddress: sourceKeypair.publicKey(),
        toAddress,
        stellarTxId: result.hash,
        assetType: assetType,
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
      return this.executeTestnetTrade(
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

    if (NetworkHandler.isTestnet()) {
      // Use simplified liquidity for testnet
      return this.addTestnetLiquidity(
        userId,
        assetA,
        assetB,
        amountA,
        amountB,
        minPrice,
        maxPrice,
      );
    } else {
      // Use real AMM for mainnet
      return this.addRealLiquidity(
        userId,
        assetA,
        assetB,
        amountA,
        amountB,
        minPrice,
        maxPrice,
      );
    }
  }

  async executeRealTrade(
    userId: string,
    sellAsset: Asset,
    sellAmount: string,
    buyAsset: Asset,
    minBuyAmount: string,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const userAccount = await server.loadAccount(userKeypair.publicKey());

      // Get the current orderbook to determine market price
      const orderbook = await server
        .orderbook(sellAsset, buyAsset)
        .limit(10)
        .call();

      // Calculate expected price based on orderbook
      const bestAsk = orderbook.asks?.[0];
      const bestBid = orderbook.bids?.[0];

      if (!bestAsk || !bestBid) {
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

      // Use path payments for better execution
      const transaction = new TransactionBuilder(userAccount, {
        fee: baseFee,
        networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: sellAsset,
            sendAmount: sellAmount,
            destination: userKeypair.publicKey(),
            destAsset: buyAsset,
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
          parseFloat(sellAmount) / parseFloat(bestAsk.price)
        ).toFixed(7);
        receivedAmount = estimatedReceived;
      }

      // Record trade
      await storage.createTransaction({
        userId,
        type: "trade",
        amount: sellAmount,
        fromAddress: userKeypair.publicKey(),
        toAddress: userKeypair.publicKey(),
        stellarTxId: result.hash,
        assetType: `${sellAsset.code || "XLM"}->${buyAsset.code || "XLM"}`,
        status: "completed",
        metadata: {
          tradeType: "path_payment",
          sellAsset: sellAsset.code || "XLM",
          buyAsset: buyAsset.code || "XLM",
          sellAmount,
          receivedAmount,
          minBuyAmount,
          bestAskPrice: bestAsk.price,
          bestBidPrice: bestBid.price,
        },
      });

      return {
        hash: result.hash,
        status: "completed",
        sellAsset: sellAsset.code || "XLM",
        buyAsset: buyAsset.code || "XLM",
        sellAmount,
        receivedAmount,
      };
    } catch (error: any) {
      console.error("Error executing real trade:", error);

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
  async executeTestnetTrade(
    userId: string,
    sellAsset: Asset,
    sellAmount: string,
    buyAsset: Asset,
    minBuyAmount: string,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const userAccount = await server.loadAccount(userKeypair.publicKey());

      // Validate user has sufficient balance
      const sellAmountNum = parseFloat(sellAmount);
      const minBuyAmountNum = parseFloat(minBuyAmount);

      if (sellAmountNum <= 0 || minBuyAmountNum <= 0) {
        throw new Error("Invalid trade amounts");
      }

      // Check user balance for sell asset
      if (sellAsset.isNative()) {
        const xlmBalance = userAccount.balances.find(
          (balance: any) => balance.asset_type === "native",
        );
        if (parseFloat(xlmBalance?.balance || "0") < sellAmountNum + 0.1) {
          throw new Error("Insufficient XLM balance (including fees)");
        }
      } else {
        const assetBalance = userAccount.balances.find(
          (balance: any) =>
            balance.asset_type === "credit_alphanum4" &&
            balance.asset_code === sellAsset.code &&
            balance.asset_issuer === sellAsset.issuer,
        );
        if (parseFloat(assetBalance?.balance || "0") < sellAmountNum) {
          throw new Error(`Insufficient ${sellAsset.code} balance`);
        }
      }

      // Calculate exchange rate (1 XLM = 10 DOPE, 1 DOPE = 0.1 XLM)
      let expectedReceive: number;
      if (sellAsset.isNative() && buyAsset.code === "DOPE") {
        expectedReceive = sellAmountNum * 10; // XLM to DOPE
      } else if (sellAsset.code === "DOPE" && buyAsset.isNative()) {
        expectedReceive = sellAmountNum * 0.1; // DOPE to XLM
      } else {
        throw new Error("Unsupported trading pair");
      }

      if (expectedReceive < minBuyAmountNum) {
        throw new Error(
          `Trade would receive ${expectedReceive.toFixed(6)} but minimum required is ${minBuyAmount}`,
        );
      }

      const receiveAmount = expectedReceive.toFixed(7);

      // Execute the swap as two separate payments
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

      // Record trade transaction
      await storage.createTransaction({
        userId,
        type: "trade",
        amount: sellAmount,
        fromAddress: userKeypair.publicKey(),
        toAddress: userKeypair.publicKey(),
        stellarTxId: buyResult.hash,
        assetType: `${sellAsset.code || "XLM"}->${buyAsset.code || "XLM"}`,
        status: "completed",
        metadata: {
          tradeType: "swap",
          sellAsset: sellAsset.code || "XLM",
          buyAsset: buyAsset.code || "XLM",
          sellAmount,
          receiveAmount,
          minBuyAmount,
          sellTxHash: sellResult.hash,
          buyTxHash: buyResult.hash,
          exchangeRate: sellAsset.isNative() ? "10" : "0.1",
        },
      });

      console.log(
        `Trade executed: ${sellAmount} ${sellAsset.code || "XLM"} -> ${receiveAmount} ${buyAsset.code || "XLM"}`,
      );

      return {
        hash: buyResult.hash,
        status: "completed",
        sellAsset: sellAsset.code || "XLM",
        buyAsset: buyAsset.code || "XLM",
        sellAmount,
        receiveAmount,
        sellTxHash: sellResult.hash,
        buyTxHash: buyResult.hash,
      };
    } catch (error: any) {
      console.error("Error executing trade:", error);

      // Provide more specific error messages
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
      }

      throw new Error(error.message || "Failed to execute trade");
    }
  }

  /**
   * Place a limit order on the DEX
   */
  async placeLimitOrder(
    userId: string,
    selling: Asset,
    buying: Asset,
    amount: string,
    price: string,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.manageSellOffer({
            selling: selling,
            buying: buying,
            amount: amount,
            price: price,
            offerId: "0", // 0 creates new offer
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      // Record limit order
      await storage.createTransaction({
        userId,
        type: "limit_order",
        amount: amount,
        fromAddress: userKeypair.publicKey(),
        toAddress: userKeypair.publicKey(),
        stellarTxId: result.hash,
        assetType: `${selling.code || "XLM"}->${buying.code || "XLM"}`,
        status: "pending",
        metadata: {
          orderType: "limit",
          selling: selling.code || "XLM",
          buying: buying.code || "XLM",
          amount,
          price,
        },
      });

      console.log(
        `Limit order placed: ${amount} ${selling.code || "XLM"} at ${price}`,
      );

      return {
        hash: result.hash,
        status: "pending",
        selling: selling.code || "XLM",
        buying: buying.code || "XLM",
        amount,
        price,
      };
    } catch (error: any) {
      console.error("Error placing limit order:", error);
      throw new Error(error.message || "Failed to place limit order");
    }
  }

  /**
   * Cancel an existing limit order
   */
  async cancelLimitOrder(
    userId: string,
    offerId: string,
    selling: Asset,
    buying: Asset,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
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

      return {
        bids: orderbook.bids.map((bid: any) => ({
          price: bid.price,
          amount: bid.amount,
          priceR: bid.price_r,
        })),
        asks: orderbook.asks.map((ask: any) => ({
          price: ask.price,
          amount: ask.amount,
          priceR: ask.price_r,
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
  async getUserOrders(userId: string): Promise<any[]> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const offers = await server
        .offers()
        .forAccount(user.stellarPublicKey)
        .call();

      return offers.records.map((offer: any) => ({
        id: offer.id,
        selling: offer.selling,
        buying: offer.buying,
        amount: offer.amount,
        price: offer.price,
        priceR: offer.price_r,
        lastModifiedLedger: offer.last_modified_ledger,
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
    userId: string,
    assetA: Asset,
    assetB: Asset,
    amountA: string,
    amountB: string,
    minPrice: string,
    maxPrice: string,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
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

      await storage.createTransaction({
        userId,
        type: "add_liquidity",
        amount: amountA,
        fromAddress: userKeypair.publicKey(),
        toAddress: liquidityPoolId,
        stellarTxId: result.hash,
        assetType: `${assetA.code || "XLM"}-${assetB.code || "XLM"}-LP`,
        status: "completed",
        metadata: {
          poolId: liquidityPoolId,
          assetA: assetA.code || "XLM",
          assetB: assetB.code || "XLM",
          amountA: actualAmountA,
          amountB: actualAmountB,
          minPrice,
          maxPrice,
          sharesReceived: poolShares,
          poolExists: poolExists,
        },
      });

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
  async addTestnetLiquidity(
    userId: string,
    assetA: Asset,
    assetB: Asset,
    amountA: string,
    amountB: string,
    minPrice: string,
    maxPrice: string,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      const account = await server.loadAccount(userKeypair.publicKey());

      // Validate amounts
      const amountANum = parseFloat(amountA);
      const amountBNum = parseFloat(amountB);

      if (amountANum <= 0 || amountBNum <= 0) {
        throw new Error("Invalid liquidity amounts");
      }

      // Check minimum amounts for fees
      if (amountANum < 0.5) {
        throw new Error("Minimum XLM amount for liquidity is 0.5 XLM");
      }

      if (amountBNum < 0.1) {
        throw new Error("Minimum DOPE amount for liquidity is 0.1 DOPE");
      }

      // Validate user has sufficient balances
      const xlmBalance = account.balances.find(
        (balance: any) => balance.asset_type === "native",
      );
      const dopeBalance = account.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "DOPE" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      const xlmAmount = parseFloat(xlmBalance?.balance || "0");
      const dopeAmount = parseFloat(dopeBalance?.balance || "0");

      // Check if user has sufficient XLM (including fees)
      if (xlmAmount < amountANum + 1.0) {
        throw new Error(
          `Insufficient XLM balance. You have ${xlmAmount.toFixed(2)} XLM but need ${(amountANum + 1.0).toFixed(2)} XLM (including fees)`,
        );
      }

      // Check if user has sufficient DOPE
      if (dopeAmount < amountBNum) {
        throw new Error(
          `Insufficient DOPE balance. You have ${dopeAmount.toFixed(2)} DOPE but need ${amountBNum} DOPE`,
        );
      }

      // Use simple direct swap approach instead of liquidity pools for now
      // This will be more reliable on testnet

      // Send XLM to distributor
      const xlmToDistributorTx = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: dopeDistributorKeypair.publicKey(),
            asset: Asset.native(),
            amount: amountA,
          }),
        )
        .setTimeout(60)
        .build();

      xlmToDistributorTx.sign(userKeypair);
      const xlmResult = await server.submitTransaction(xlmToDistributorTx);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send DOPE to distributor
      const updatedAccount = await server.loadAccount(userKeypair.publicKey());
      const dopeToDistributorTx = new TransactionBuilder(updatedAccount, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: dopeDistributorKeypair.publicKey(),
            asset: new Asset("DOPE", dopeIssuerKeypair.publicKey()),
            amount: amountB,
          }),
        )
        .setTimeout(60)
        .build();

      dopeToDistributorTx.sign(userKeypair);
      const dopeResult = await server.submitTransaction(dopeToDistributorTx);

      // Create a fake pool ID for tracking
      const poolId = `${userKeypair.publicKey().slice(0, 8)}-${Date.now()}`;

      // Record liquidity addition
      await storage.createTransaction({
        userId,
        type: "add_liquidity",
        amount: amountA, // Store primary amount (XLM) as the main amount
        fromAddress: userKeypair.publicKey(),
        toAddress: poolId,
        stellarTxId: dopeResult.hash,
        assetType: `${assetA.code || "XLM"}-${assetB.code || "XLM"}-LP`,
        status: "completed",
        metadata: {
          poolId,
          assetA: assetA.code || "XLM",
          assetB: assetB.code || "XLM",
          amountA,
          amountB,
          minPrice,
          maxPrice,
          xlmTxHash: xlmResult.hash,
          dopeTxHash: dopeResult.hash,
          liquidityShares: (amountANum * amountBNum).toFixed(6), // Simple calculation
        },
      });

      console.log(
        `Added liquidity: ${amountA} ${assetA.code || "XLM"} + ${amountB} ${assetB.code || "XLM"}`,
      );

      return {
        hash: dopeResult.hash,
        status: "completed",
        poolId,
        assetA: assetA.code || "XLM",
        assetB: assetB.code || "XLM",
        amountA,
        amountB,
      };
    } catch (error: any) {
      console.error("Error adding liquidity:", error);

      // Provide more specific error messages
      if (error.response?.data?.extras?.result_codes) {
        const resultCodes = error.response.data.extras.result_codes;
        if (resultCodes.transaction === "tx_insufficient_balance") {
          throw new Error("Insufficient balance for this operation");
        }
        if (resultCodes.operations?.includes("op_underfunded")) {
          throw new Error("Insufficient funds to complete liquidity operation");
        }
        if (resultCodes.operations?.includes("op_line_full")) {
          throw new Error("Asset balance limit exceeded");
        }
        if (resultCodes.operations?.includes("op_no_trust")) {
          throw new Error("Missing trustline for liquidity pool");
        }
      }

      throw new Error(error.message || "Failed to add liquidity");
    }
  }

  /**
   * Remove liquidity from a pool
   */
  async removeLiquidity(
    userId: string,
    poolId: string,
    amount: string,
    minAmountA: string,
    minAmountB: string,
  ): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
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

      // Record liquidity removal
      await storage.createTransaction({
        userId,
        type: "remove_liquidity",
        amount: amount,
        fromAddress: poolId,
        toAddress: userKeypair.publicKey(),
        stellarTxId: result.hash,
        assetType: "LP-WITHDRAWAL",
        status: "completed",
        metadata: {
          poolId,
          amount,
          minAmountA,
          minAmountB,
        },
      });

      console.log(`Removed liquidity: ${amount} LP tokens from pool ${poolId}`);

      return {
        hash: result.hash,
        status: "completed",
        poolId,
        amount,
        minAmountA,
        minAmountB,
      };
    } catch (error) {
      console.error("Error removing liquidity:", error);
      throw error;
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
  async getUserLiquidityPools(userId: string): Promise<any[]> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      // Get liquidity transactions from our database
      const liquidityTransactions = await storage.getTransactionsByType(
        userId,
        "add_liquidity",
      );

      const pools = liquidityTransactions.map((tx: any) => {
        const metadata = tx.metadata || {};
        return {
          poolId: metadata.poolId || `pool-${tx.id}`,
          balance: metadata.liquidityShares || "100.000000",
          poolInfo: {
            id: metadata.poolId || `pool-${tx.id}`,
            assets: {
              assetA: metadata.assetA || "XLM",
              assetB: metadata.assetB || "DOPE",
            },
            reserves: {
              assetA: metadata.amountA || "100.0",
              assetB: metadata.amountB || "1000.0",
            },
            totalShares: "1000.000000",
            fee: 30, // 0.3%
          },
        };
      });

      return pools;
    } catch (error) {
      console.error("Error fetching user liquidity pools:", error);
      return [];
    }
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
        quoteAsset: new Asset("USDT", UsdtIssuerPublicKey),
        symbol: "DOPE/USDT",
      },
    ];
  }

  /**
   * Create a new Stellar account with starting balance
   */
  async createAccount(
    newAccountPublicKey: string,
    startingBalance: string = "1.00",
  ): Promise<string> {
    try {
      // Use distributor account as the funding source
      const sourceAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );

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

      transaction.sign(dopeDistributorKeypair);
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
    startingBalance: string = "1.00",
  ): Promise<string> {
    try {
      const sourceAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );
      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE.toString() + ACCOUNT_FEE.toString(), // Higher fee for multiple operations
        networkPassphrase,
      })
        // First: Create the account
        .addOperation(
          Operation.createAccount({
            destination: newAccountKeypair.publicKey(),
            startingBalance: startingBalance,
          }),
        )
        // Second: Establish trustline for DOPE asset
        .addOperation(
          Operation.changeTrust({
            source: newAccountKeypair.publicKey(),
            asset: dopeAsset,
            limit: "1000000", // Max trust limit
          }),
        )
        .setTimeout(60)
        .build();

      // Sign with both accounts
      transaction.sign(dopeDistributorKeypair); // Source account (pays fees)
      transaction.sign(newAccountKeypair); // New account (authorizes trustline)

      const result = await server.submitTransaction(transaction);

      console.log(
        `Created account ${newAccountKeypair.publicKey()} with DOPE trustline`,
      );
      return result.hash;
    } catch (error) {
      console.error("Error creating account with DOPE trustline:", error);
      throw error;
    }
  }

  /**
   * Issue DOPE tokens using claimable balance instead of direct payment
   * This allows users to claim tokens even if their account doesn't exist yet
   */
  async issueDopeTokens(userId: string, amount: string): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      const dopeAsset = new Asset("DOPE", dopeIssuerKeypair.publicKey());

      // Check if user account exists
      const accountExists = await this.accountExists(user.stellarPublicKey);

      let createAccountTxHash: string | null = null;

      // If account doesn't exist, create it with DOPE trustline
      if (!accountExists) {
        if (!user.stellarSecretKey) {
          throw new Error(
            "User stellar secret key not found for account creation",
          );
        }

        const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
        createAccountTxHash = await this.createAccountWithDopeTrustline(
          userKeypair,
          "1.0",
        );

        // Wait for account creation to propagate
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        // Check if trustline exists, create if needed
        const account = await server.loadAccount(user.stellarPublicKey);
        const existingTrustline = account.balances.find(
          (balance: any) =>
            balance.asset_type === "credit_alphanum4" &&
            balance.asset_code === "DOPE" &&
            balance.asset_issuer === dopeIssuerKeypair.publicKey(),
        );

        if (!existingTrustline) {
          await this.createUserToken(userId);
          // Wait for trustline to propagate
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      // Use distributor account to create claimable balance
      const distributorAccount = await server.loadAccount(
        dopeDistributorKeypair.publicKey(),
      );

      // Create claimant - user can claim balances within 24 hours
      const claimant = new Claimant(
        user.stellarPublicKey,
        Claimant.predicateBeforeRelativeTime("86400"),
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

      // Record the transaction
      await storage.createTransaction({
        userId,
        type: "mining_reward",
        amount: formattedAmount,
        toAddress: user.stellarPublicKey,
        stellarTxId: result.hash,
        assetType: "DOPE",
        status: claimableBalanceId ? "pending" : "completed",
        metadata: {
          assetType: "DOPE",
          source: "mining",
          issuer: dopeIssuerKeypair.publicKey(),
          claimableBalanceId: claimableBalanceId,
          createAccountTxHash: createAccountTxHash,
          rewardType: "claimable_balance",
        },
      });

      console.log(
        `Created claimable balance with ${formattedAmount} DOPE tokens for user ${userId}`,
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
  async claimBalance(userId: string, claimableBalanceId: string): Promise<any> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarSecretKey) {
        throw new Error("User stellar secret key not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
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

      // Update transaction status to completed
      await storage.updateTransactionStatus(claimableBalanceId, "completed");

      console.log(
        `User ${userId} claimed claimable balance ${claimableBalanceId}`,
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

  /**
   * Get all claimable balances for a user
   */
  async getClaimableBalances(userId: string): Promise<any[]> {
    try {
      const user = await storage.getUser(userId);
      if (!user?.stellarPublicKey) {
        throw new Error("User stellar account not found");
      }

      // Query Stellar for claimable balances
      const claimableBalances = await server
        .claimableBalances()
        .claimant(user.stellarPublicKey)
        .call();

      return claimableBalances.records.map((cb: any) => ({
        id: cb.id,
        asset: cb.asset,
        amount: cb.amount,
        sponsor: cb.sponsor,
        lastModifiedLedger: cb.last_modified_ledger,
        claimants: cb.claimants,
      }));
    } catch (error) {
      console.error("Error fetching claimable balances:", error);
      return [];
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
      console.log("Setting up GAS trustline for distributor account...");

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
            // limit: "1000000000" // 1 billion GAS tokens max
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(dopeDistributorKeypair);
      const result = await server.submitTransaction(transaction);

      console.log(
        `GAS trustline created for distributor. Transaction: ${result.hash}`,
      );
    } catch (error: any) {
      console.error("Error setting up distributor trustline:", error);
      throw new Error(
        "Failed to setup distributor trustline: " + error.message,
      );
    }
  }

  // Call this during your app initialization
  async initializeDistributor() {
    await this.setupDistributorTrustline();
  }
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

  throw new Error(defaultMessage);
}

export {
  server,
  BASE_FEE,
  networkPassphrase,
  dopeIssuerKeypair,
  dopeDistributorKeypair,
};

export const stellarService = new StellarService();
