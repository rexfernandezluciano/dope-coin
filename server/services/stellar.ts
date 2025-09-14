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

const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_SERVER_URL =
  STELLAR_NETWORK === "mainnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
const BASE_FEE = process.env.BASE_FEE || (100 as number);
const LIQUIDITY_FEE = (process.env.LIQUIDITY_FEE || 300 + 100) as number;
const ACCOUNT_FEE = process.env.ACCOUNT_FEE || (1000 as number);

// Platform DOPE token issuer (should be in environment variables in production)
const DOPE_ISSUER_SECRET =
  process.env.DOPE_ISSUER_SECRET || Keypair.random().secret();
const DOPE_DISTRIBUTOR_SECRET =
  process.env.DOPE_DISTRIBUTOR_SECRET || Keypair.random().secret();

const dopeIssuerKeypair = Keypair.fromSecret(DOPE_ISSUER_SECRET);
const dopeDistributorKeypair = Keypair.fromSecret(DOPE_DISTRIBUTOR_SECRET);

const server = new Horizon.Server(STELLAR_SERVER_URL);
const networkPassphrase =
  STELLAR_NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

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

interface TradeOrder {
  type: "buy" | "sell";
  amount: string;
  price: string;
  asset: Asset;
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
            amount: "1000000", // 1M DOPE initial supply
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

      // Fund account if needed
      const funded = await this.fundAccount(userKeypair.publicKey());
      if (!funded) {
        console.log("Account funding failed, skipping token setup");
        return;
      }

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

      operations.forEach(op => transaction.addOperation(op));
      
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
      const updatedUserAccount = await server.loadAccount(userKeypair.publicKey());
      
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
      const issuerAccount = await server.loadAccount(dopeIssuerKeypair.publicKey());
      
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
   * Execute a market trade (buy/sell) using path payments
   */
  async executeTrade(
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
      const account = await server.loadAccount(userKeypair.publicKey());

      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: sellAsset,
            sendAmount: sellAmount,
            destination: userKeypair.publicKey(), // Trade within same account
            destAsset: buyAsset,
            destMin: minBuyAmount,
            path: [], // Direct trade, no intermediate assets
          }),
        )
        .setTimeout(30)
        .build();

      transaction.sign(userKeypair);
      const result = await server.submitTransaction(transaction);

      // Record trade transaction
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
          tradeType: "market",
          sellAsset: sellAsset.code || "XLM",
          buyAsset: buyAsset.code || "XLM",
          sellAmount,
          minBuyAmount,
        },
      });

      console.log(
        `Trade executed: ${sellAmount} ${sellAsset.code || "XLM"} -> ${buyAsset.code || "XLM"}`,
      );

      return {
        hash: result.hash,
        status: "completed",
        sellAsset: sellAsset.code || "XLM",
        buyAsset: buyAsset.code || "XLM",
        sellAmount,
        minBuyAmount,
      };
    } catch (error) {
      console.error("Error executing trade:", error);
      throw error;
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
    } catch (error) {
      console.error("Error placing limit order:", error);
      throw error;
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
  async addLiquidity(
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

      // Validate user has sufficient balances
      const xlmBalance = account.balances.find(
        (balance: any) => balance.asset_type === "native"
      );
      const dopeBalance = account.balances.find(
        (balance: any) =>
          balance.asset_type === "credit_alphanum4" &&
          balance.asset_code === "DOPE" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey()
      );

      const xlmAmount = parseFloat(xlmBalance?.balance || "0");
      const dopeAmount = parseFloat(dopeBalance?.balance || "0");

      // Check if user has sufficient XLM (including fees)
      if (xlmAmount < parseFloat(amountA) + 0.1) {
        throw new Error(`Insufficient XLM balance. You have ${xlmAmount} XLM but need ${parseFloat(amountA) + 0.1} XLM (including fees)`);
      }

      // Check if user has sufficient DOPE
      if (dopeAmount < parseFloat(amountB)) {
        throw new Error(`Insufficient DOPE balance. You have ${dopeAmount} DOPE but need ${amountB} DOPE`);
      }

      // Create liquidity pool asset
      const poolAsset = new LiquidityPoolAsset(assetA, assetB, 30); // 30 basis points fee
      const poolId = getLiquidityPoolId("constant_product", poolAsset).toString(
        "hex",
      );

      // Check if user already has trustline for this pool
      const existingPoolTrustline = account.balances.find(
        (balance: any) =>
          balance.asset_type === "liquidity_pool_shares" &&
          balance.liquidity_pool_id === poolId
      );

      const operations = [];

      // Add trustline operation only if it doesn't exist
      if (!existingPoolTrustline) {
        operations.push(
          Operation.changeTrust({
            asset: poolAsset,
            limit: "1000000",
          })
        );
      }

      // Add liquidity deposit operation
      operations.push(
        Operation.liquidityPoolDeposit({
          liquidityPoolId: poolId,
          maxAmountA: amountA,
          maxAmountB: amountB,
          minPrice: minPrice,
          maxPrice: maxPrice,
        })
      );

      const transaction = new TransactionBuilder(account, {
        fee: (BASE_FEE * operations.length).toString(),
        networkPassphrase,
      });

      operations.forEach(op => transaction.addOperation(op));
      
      const builtTransaction = transaction.setTimeout(60).build();
      builtTransaction.sign(userKeypair);

      const result = await server.submitTransaction(builtTransaction);

      // Record liquidity addition
      await storage.createTransaction({
        userId,
        type: "add_liquidity",
        amount: `${amountA}:${amountB}`,
        fromAddress: userKeypair.publicKey(),
        toAddress: poolId,
        stellarTxId: result.hash,
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
        },
      });

      console.log(
        `Added liquidity: ${amountA} ${assetA.code || "XLM"} + ${amountB} ${assetB.code || "XLM"}`,
      );

      return {
        hash: result.hash,
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

      const account = await server.loadAccount(user.stellarPublicKey);

      // Filter for liquidity pool balances
      const poolBalances = account.balances.filter(
        (balance: any) => balance.asset_type === "liquidity_pool_shares",
      );

      const poolsWithDetails = await Promise.all(
        poolBalances.map(async (balance: any) => {
          const poolInfo = await this.getLiquidityPool(
            balance.liquidity_pool_id,
          );
          return {
            poolId: balance.liquidity_pool_id,
            balance: balance.balance,
            poolInfo,
          };
        }),
      );

      return poolsWithDetails;
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
          const { xdr } = require("stellar-sdk");
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
    const asset = new Asset(assetCode, issuer);
    let total = 0;
    let page = await server.accounts().forAsset(asset).limit(200).call();

    while (true) {
      for (const account of page.records) {
        if (account.account_id === issuer) continue; // Skip issuing account
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
}

export const stellarService = new StellarService();
