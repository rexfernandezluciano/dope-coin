import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import path from "path";
import { storage } from "../storage.js";
import { authMiddleware } from "../middleware/auth.js";
import { walletAuthMiddleware } from "../middleware/wallet-auth.js";
import { walletService } from "../services/wallet.js";
import { jwtService } from "../services/jwt.js";
import { stellarService } from "../services/stellar.js";
import { miningService } from "../services/mining.js";
import {
  loginSchema,
  registerSchema,
  executeTradeSchema,
  addLiquiditySchema,
  removeLiquiditySchema,
  orderbookQuerySchema,
  updateProfileSchema,
  updateUsernameSchema,
  verifyEmailSchema,
} from "../../shared/schema.js";
import { Asset, Keypair } from "@stellar/stellar-sdk";
import z from "zod";
import { rateLimit } from "express-rate-limit";
import { KeypairGenerator } from "../utils/keypair-generator.js";

// Middleware to ensure wallet session is established
const requireWalletAuth = (req: any, res: any, next: any) => {
  if (req.walletSession && req.walletSession.secretKey) {
    next();
  } else {
    res.status(401).json({ error: "Wallet session required" });
  }
};

var rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 requests per windowMs
  message: {
    error: "Too many requests, please try again later.",
    retryAfter: 15 * 60 * 1000,
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export async function registerRoutes(app: Express): Promise<Server> {
  // .well-known/stellar.toml endpoint
  app.get("/.well-known/stellar.toml", (req, res) => {
    const stellarTomlPath = path.join(
      import.meta.dirname,
      process.env.STELLAR_NETWORK === "mainnet"
        ? "../.well-known/stellar-mainnet.toml"
        : "../.well-known/stellar-testnet.toml",
    );
    res
      .header("Content-Type", "text/pain; charset=utf-8")
      .sendFile(stellarTomlPath);
  });

  // DOPE Image
  app.get("/static/:path", (req, res) => {
    const imagePath = req.params.path;
    res
      .header("Content-Type", "image/png")
      .sendFile(path.join(import.meta.dirname, `../static/${imagePath}`));
  });

  // Auth routes
  app.post("/api/auth/register", rateLimiter, async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Validate referral code if provided
      let referrerUser = null;
      if (validatedData.referralCode) {
        referrerUser = await storage.getUserByReferralCode(
          validatedData.referralCode,
        );
        if (!referrerUser) {
          return res.status(400).json({ message: "Invalid referral code" });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);

      const generator = new KeypairGenerator();

      // Create Stellar keypair
      const stellarKeypair = generator.generateKeypair();

      // Generate referral code
      const referralCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      const userData = {
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        fullName: validatedData.fullName,
        referralCode,
        referredBy: referrerUser?.id || null,
      };

      const publicKey = stellarKeypair.publicKey;
      const secretKey = stellarKeypair.secretKey;
      const mnemonic = stellarKeypair.mnemonic;

      if (!publicKey || !secretKey || !mnemonic) {
        throw new Error("Failed to generate keypair");
      }

      const user = await storage.createUser(userData);

      // Initialize wallet
      await storage.createWallet({
        userId: user.id,
        publicKey: publicKey,
      });

      // Give referral bonus to referrer if applicable
      if (referrerUser) {
        try {
          const referralBonusAmount = "1.0"; // 1 DOPE bonus for successful referral
          await storage.addReferralBonus(referrerUser.id, referralBonusAmount);
          console.log(
            `Referral bonus of ${referralBonusAmount} DOPE given to user ${referrerUser.id}`,
          );
        } catch (error) {
          console.error("Error giving referral bonus:", error);
          // Continue registration even if referral bonus fails
        }
      }

      const token = jwtService.generateToken(user.id);

      // Note: Secret key will be stored in wallet service when user sets up their PIN
      // Do not store with default PIN for security reasons

      res.status(201).json({
        message: "User created successfully",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          level: user.level,
          publicKey: publicKey,
          referralCode: user.referralCode,
        },
        // Security: Include sensitive keys only for initial setup
        // TODO: Move to client-side key generation for better security
        secretKey: secretKey,
        passphrase: mnemonic,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error(
        "Registration error:",
        error?.response?.data?.extras?.result_codes || error,
      );
      res
        .status(500)
        .json({ message: error.message || "Internal server error" });
    }
  });

  app.post("/api/auth/login", rateLimiter, async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);

      const user = await storage.getUserByEmail(validatedData.email);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValidPassword = await bcrypt.compare(
        validatedData.password,
        user.password,
      );
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const token = jwtService.generateToken(user.id);

      res.json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          level: user.level,
          publicKey: (await storage.getWallet(user.id))?.publicKey || "",
          referralCode: user.referralCode,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Protected routes
  app.use("/api/protected", rateLimiter, authMiddleware);

  // Wallet session management
  app.post("/api/protected/wallet/session", async (req, res) => {
    try {
      const userId = req.user?.id;
      const { secretKey, pin } = req.body;

      if (!userId || !secretKey || !pin) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Validate secret key format
      try {
        Keypair.fromSecret(secretKey);
      } catch (error) {
        return res.status(400).json({ message: "Invalid secret key format" });
      }

      // Validate PIN format
      if (!/^\d{4,6}$/.test(pin)) {
        return res.status(400).json({ message: "PIN must be 4-6 digits" });
      }

      // Generate session password
      const sessionPassword = walletService.generateSessionPassword(
        userId,
        pin,
      );

      // Store encrypted secret key in session
      await walletService.storeUserSecretKey(
        userId,
        secretKey,
        sessionPassword,
      );

      // Set wallet session in req object for subsequent middleware
      req.walletSession = { secretKey };

      res.json({ message: "Wallet session established successfully" });
    } catch (error: any) {
      console.error("Wallet session error:", error);
      res
        .status(500)
        .json({
          message: error.message || "Failed to establish wallet session",
        });
    }
  });

  app.delete("/api/protected/wallet/session", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (userId) {
        walletService.clearUserSession(userId);
        // Clear wallet session from req object
        if (req.walletSession) {
          delete req.walletSession;
        }
      }
      res.json({ message: "Wallet session cleared" });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear wallet session" });
    }
  });

  // User profile routes
  app.get("/api/protected/profile", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const wallet = await storage.getWallet(userId);
      const stats = await storage.getUserStats(userId);

      res.json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          profilePicture: user.profilePicture,
          level: user.level,
          isVerified: user.isVerified,
          referralCode: user.referralCode,
          publicKey: (wallet && wallet.publicKey) || "",
          createdAt: user.createdAt,
        },
        wallet,
        stats,
      });
    } catch (error: any) {
      console.error("Profile fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.put("/api/protected/profile", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { fullName, profilePicture } = req.body;

      if (!fullName && !profilePicture) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const updatedUser = await storage.updateUser(userId, {
        fullName,
        profilePicture,
        updatedAt: new Date(),
      });

      const wallet = await storage.getWallet(userId);

      // Create safe updated user object without sensitive fields
      const safeUpdatedUser = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        profilePicture: updatedUser.profilePicture,
        publicKey: (wallet && wallet.publicKey) || "",
        isVerified: updatedUser.isVerified,
        level: updatedUser.level,
        referralCode: updatedUser.referralCode,
        referredBy: updatedUser.referredBy,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      };

      res.json({
        message: "Profile updated successfully",
        user: safeUpdatedUser,
      });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Mining routes
  app.post("/api/protected/mining/start", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      const { secretKey } = req.body;
      if (!userId || !secretKey) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const session = await miningService.startMining(userId, secretKey);
      res.json({ message: "Mining started successfully", session });
    } catch (error: any) {
      console.error("Mining start error:", error.message);
      if (error.message.includes("Mining cooldown")) {
        res.status(400).json({ message: error.message });
      } else {
        res
          .status(500)
          .json({ message: error.message || "Something went wrong" });
      }
    }
  });

  app.post("/api/protected/mining/stop", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const session = await miningService.stopMining(userId);
      res.json({ message: "Mining stopped successfully", session });
    } catch (error: any) {
      console.error("Mining stop error:", error.message);
      if (error.message.includes("No active mining session")) {
        res.status(400).json({ message: error.message });
      } else {
        res
          .status(500)
          .json({ message: "Internal server error: " + error.message });
      }
    }
  });

  app.get("/api/protected/mining/status", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const status = await miningService.getMiningStatus(userId);
      res.json(status);
    } catch (error: any) {
      console.error("Mining status error:", error.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/mining/claim", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const reward = await miningService.claimReward(userId);
      res.json({ message: "Reward claimed successfully", reward });
    } catch (error: any) {
      console.error("Mining claim error:", error.message);
      if (
        error.message.includes("No rewards available") ||
        error.message.includes("No active mining session")
      ) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
    }
  });

  app.get("/api/protected/mining/claimable", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { secretKey } = req.query;

      const claimbleBalances = await miningService.getClaimbaleBalances(
        secretKey as string,
      );

      if (!claimbleBalances || claimbleBalances.length < 0) {
        return res.status(404).json({ message: "No claimable balances found" });
      }

      return res.json({ balance: claimbleBalances });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/mining/claimable", rateLimiter, async (req, res) => {
    const { secretKey } = req.query;

    if (!secretKey) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      await miningService.claimUnclaimedRewards(secretKey as string);
      return res.json({ message: "Rewards claimed successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Vault management routes
  app.post("/api/protected/vault/sync", authMiddleware, async (req, res) => {
    try {
      const { vault } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (
        !vault ||
        !vault.id ||
        !vault.name ||
        !vault.encryptedData ||
        !vault.salt ||
        !vault.iv ||
        !vault.createdAt
      ) {
        return res.status(400).json({ message: "Invalid vault data" });
      }

      await storage.storeVault({
        id: vault.id,
        userId,
        name: vault.name,
        encryptedData: vault.encryptedData,
        salt: vault.salt,
        iv: vault.iv,
        createdAt: new Date(vault.createdAt),
        lastAccessed: new Date(vault.lastAccessed || Date.now()),
      });

      res.json({ success: true, message: "Vault synced successfully" });
    } catch (error: any) {
      console.error("Error syncing vault:", error);
      res
        .status(500)
        .json({ error: "Failed to sync vault", details: error.message });
    }
  });

  app.get("/api/protected/vault/list", authMiddleware, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const vaults = await storage.getUserVaults(userId);
      res.json({ vaults });
    } catch (error: any) {
      console.error("Error fetching vaults:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch vaults", details: error.message });
    }
  });

  // Wallet management routes
  app.get("/api/protected/wallet", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [xlmBalance, dopeBalance, usdcBalance, gasBalance] =
        await Promise.all([
          stellarService.getXLMBalance(userId),
          stellarService.getDOPEBalance(userId),
          stellarService.getUSDCBalance(userId),
          stellarService.getGASBalance(userId),
        ]);

      res.json({
        xlmBalance: xlmBalance.toString(),
        dopeBalance: dopeBalance.toString(),
        usdcBalance: usdcBalance.toString(),
        gasBalance: gasBalance.toString(),
      });
    } catch (error: any) {
      console.error("Wallet error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/protected/wallet/send",
    rateLimiter,
    walletAuthMiddleware,
    async (req, res) => {
      try {
        const secretKey = (req as any).secretKey;
        const { toAddress, amount, assetType } = req.body;

        if (!toAddress || !amount || amount <= 0) {
          return res.status(400).json({ message: "Invalid parameters" });
        }

        const transaction = await stellarService.sendTokens(
          secretKey,
          toAddress,
          amount,
          assetType,
        );

        res.json({
          message: "Transaction sent",
          transaction,
        });
      } catch (error: any) {
        console.error("Send transaction error:", error);
        res
          .status(500)
          .json({ message: error.message || "Internal server error" });
      }
    },
  );

  // Trust a new asset
  app.post("/api/protected/wallet/trust-asset", requireWalletAuth, async (req, res) => {
    try {
      const { assetCode, assetIssuer } = req.body;

      if (!assetCode || !assetIssuer) {
        return res.status(400).json({ error: "Asset code and issuer are required" });
      }

      const secretKey = req.walletSession?.secretKey;
      if (!secretKey) {
        return res.status(401).json({ error: "Wallet session required" });
      }

      await stellarService.createTrustline(secretKey, assetCode, assetIssuer);

      res.json({
        success: true,
        message: `Trustline created for ${assetCode}`
      });
    } catch (error: any) {
      console.error("Trust asset error:", error);
      res.status(500).json({
        error: error.message || "Failed to create trustline"
      });
    }
  });

  // Convert XLM to GAS
  app.post("/api/protected/wallet/convert-gas", rateLimiter, walletAuthMiddleware, async (req, res) => {
    try {
      const secretKey = (req as any).secretKey;

      const { xlmAmount } = req.body;
      if (!xlmAmount || parseFloat(xlmAmount) <= 0) {
        return res.status(400).json({ message: "Invalid XLM amount" });
      }

      const result = await stellarService.convertXLMToGAS(
        secretKey,
        xlmAmount,
      );
      res.json(result);
    } catch (error: any) {
      console.error("GAS conversion error:", error);
      res
        .status(500)
        .json({ message: error.message || "Internal server error" });
    }
  });

  // Transaction history
  app.get("/api/protected/transactions", async (req, res) => {
    try {
      const userId = req?.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const transactions = await stellarService.getUserTransactionHistory(
        userId,
        limit,
      );
      res.json(transactions);
    } catch (error: any) {
      console.error("Transactions fetch error:", error);
      res
        .status(500)
        .json({ message: "Internal server error: " + error.message });
    }
  });

  // User statistics endpoint
  app.get("/api/protected/stats", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const stats: any = await storage.getUserStats(userId);
      res.json({
        id: stats.id,
        activeMiners: stats.activeMiners,
        totalSupply: await stellarService.getCirculatingSupply(),
        miningRate: stats.miningRate,
        lastBlockTime: stats.lastBlockTime,
        updatedAt: stats.updatedAt,
      });
    } catch (error: any) {
      console.error("User stats error:", error);
      res
        .status(500)
        .json({ message: "Internal server error: " + error.message });
    }
  });

  // Wallet migration endpoints
  app.post("/api/protected/wallet/migrate", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      const { oldSecretKey, newPublicKey } = req.body;

      if (!userId || !oldSecretKey || !newPublicKey) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Validate the old secret key belongs to the user
      const oldKeypair = Keypair.fromSecret(oldSecretKey);
      const currentWallet = await storage.getWallet(userId);

      if (
        !currentWallet ||
        currentWallet.publicKey !== oldKeypair.publicKey()
      ) {
        return res
          .status(400)
          .json({ message: "Invalid old wallet credentials" });
      }

      // Prepare old account for merge
      await stellarService.prepareAccountForMerge(oldSecretKey);

      // Perform account merge
      const mergeResult = await stellarService.mergeAccounts(
        oldSecretKey,
        newPublicKey,
      );

      // Update user's wallet in database
      await storage.updateWallet(userId, { publicKey: newPublicKey });

      res.json({
        message: "Wallet migration completed successfully",
        result: mergeResult,
      });
    } catch (error: any) {
      console.error("Wallet migration error:", error);
      res.status(500).json({
        message: error.message || "Failed to migrate wallet",
      });
    }
  });

  app.post(
    "/api/protected/wallet/prepare-migration",
    rateLimiter,
    async (req, res) => {
      try {
        const userId = req.user?.id;
        const { secretKey } = req.body;

        if (!userId || !secretKey) {
          return res
            .status(400)
            .json({ message: "Missing required parameters" });
        }

        // Validate the secret key belongs to the user
        const keypair = Keypair.fromSecret(secretKey);
        const currentWallet = await storage.getWallet(userId);

        if (!currentWallet || currentWallet.publicKey !== keypair.publicKey()) {
          return res
            .status(400)
            .json({ message: "Invalid wallet credentials" });
        }

        // Prepare account for migration
        await stellarService.prepareAccountForMerge(secretKey);

        res.json({
          message: "Account prepared for migration successfully",
        });
      } catch (error: any) {
        console.error("Prepare migration error:", error);
        res.status(500).json({
          message: error.message || "Failed to prepare account for migration",
        });
      }
    },
  );

  // Referrals endpoint
  app.get("/api/protected/referrals", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const activeReferrals = await storage.getActiveReferrals(userId);
      const totalReferrals = await storage.getReferralCount(userId);

      res.json({
        totalReferrals,
        activeReferrals: activeReferrals.length,
        referrals: activeReferrals.map((user) => ({
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          level: user.level,
          joinedAt: user.createdAt,
          lastActive: user.updatedAt,
        })),
      });
    } catch (error) {
      console.error("Referrals fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Network stats
  app.get("/api/network/stats", async (req, res) => {
    try {
      const stats: any = await storage.getNetworkStats();
      res.json({
        id: stats.id,
        activeMiners: stats.activeMiners,
        totalSupply: await stellarService.getCirculatingSupply(),
        miningRate: stats.miningRate,
        lastBlockTime: stats.lastBlockTime,
        updatedAt: stats.updatedAt,
      });
    } catch (error) {
      console.error("Network stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Trading routes
  app.post(
    "/api/protected/trade/execute",
    rateLimiter,
    walletAuthMiddleware,
    async (req, res) => {
      try {
        const secretKey = (req as any).secretKey;

        const validatedData = executeTradeSchema.parse(req.body);
        const { sellAsset, sellAmount, buyAsset, minBuyAmount } = validatedData;

        // Convert schema assets to Stellar SDK assets
        const stellarSellAsset =
          sellAsset.type === "native"
            ? Asset.native()
            : new Asset(sellAsset.code!, sellAsset.issuer!);
        const stellarBuyAsset =
          buyAsset.type === "native"
            ? Asset.native()
            : new Asset(buyAsset.code!, buyAsset.issuer!);

        const result = await stellarService.executeTrade(
          secretKey,
          stellarSellAsset,
          sellAmount,
          stellarBuyAsset,
          minBuyAmount,
        );

        res.json({ message: "Trade executed successfully", result });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Validation error", errors: error.errors });
        }
        console.error("Trade execution error:", error);
        res
          .status(500)
          .json({ message: error.message || "Internal server error" });
      }
    },
  );

  app.post(
    "/api/protected/asset/trust",
    rateLimiter,
    walletAuthMiddleware,
    async (req, res) => {
      try {
        const secretKey = (req as any).secretKey;
        const { assetCode, assetIssuer } = req.body;

        if (!assetCode || !assetIssuer) {
          return res.status(400).json({ message: "Invalid asset details" });
        }

        await stellarService.createTrustline(secretKey, assetCode, assetIssuer);
        return res.json({ message: "Trustline created successfully" });
      } catch (error: any) {
        console.error("Trustline error:", error);
        return res.status(500).json({
          message:
            error.data?.extras?.result_codes?.operations ||
            error.message ||
            "Internal server error",
        });
      }
    },
  );

  app.get("/api/protected/trade/pairs", rateLimiter, async (req, res) => {
    try {
      const pairs = await stellarService.getDOPETradingPairs();
      res.json(pairs);
    } catch (error: any) {
      console.error("Trading pairs error:", error);
      res
        .status(500)
        .json({ message: "Internal server error: " + error.message });
    }
  });

  app.post(
    "/api/protected/trade/exchange-rate",
    rateLimiter,
    async (req, res) => {
      try {
        const { sellingAsset, buyingAsset, sellAmount, issuerA, issuerB } =
          req.body;

        if (!sellingAsset || !buyingAsset || !sellAmount || !issuerA) {
          return res
            .status(400)
            .json({ message: "Missing required parameters" });
        }

        const rate = await stellarService.getExchangeRate(
          new Asset(sellingAsset, issuerA),
          new Asset(buyingAsset, issuerB),
        );

        const estimatedAmount = (parseFloat(sellAmount) * rate).toFixed(6);

        res.json({
          sellAmount,
          estimatedAmount,
          rate: rate.toString(),
        });
      } catch (error: any) {
        console.error("Trade calculation error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get("/api/protected/asset/holders", rateLimiter, async (req, res) => {
    try {
      const userId = req?.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const assets = await stellarService.getUserAssets(userId);
      res.json(assets);
    } catch (error: any) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/trade/orderbook", rateLimiter, async (req, res) => {
    try {
      const validatedQuery = orderbookQuerySchema.parse(req.body);
      const { selling, buying } = validatedQuery;

      if (!selling || !buying) {
        return res.status(400).json({ message: "Invalid parameters" });
      }

      const sellAsset =
        selling?.code === "XLM"
          ? Asset.native()
          : new Asset(selling?.code, selling?.issuer);
      const buyAsset =
        buying?.code === "XLM"
          ? Asset.native()
          : new Asset(buying?.code, buying?.issuer);

      const orderbook = await stellarService.getOrderbook(sellAsset, buyAsset);
      const bids = orderbook.bids;
      const asks = orderbook.asks;
      const allOrders = [...bids, ...asks].sort((a, b) => a.price - b.price);
      res.json(allOrders);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error("Orderbook error:", error);
      res
        .status(500)
        .json({ message: error.message || "Internal server error" });
    }
  });

  app.post(
    "/api/protected/trade/limit-orders",
    rateLimiter,
    async (req, res) => {
      try {
        const { secretKey } = req.query as any;
        if (!secretKey) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { sellAsset, amount, buyAsset, price, orderType } = req.body;

        if (
          !sellAsset?.code ||
          !amount ||
          !buyAsset?.code ||
          !price ||
          !orderType
        ) {
          return res.status(400).json({ message: "Invalid parameters" });
        }

        await stellarService.placeLimitOrder(
          secretKey,
          sellAsset?.code === "XLM"
            ? Asset.native()
            : new Asset(sellAsset?.code, sellAsset?.issuer),
          buyAsset?.code === "XLM"
            ? Asset.native()
            : new Asset(buyAsset?.code, buyAsset?.issuer),
          amount,
          parseFloat(price).toString(),
          orderType,
        );
        res.json({ message: "Limit order placed successfully" });
      } catch (error: any) {
        res.status(500).json({
          message: error?.response?.data?.extras?.result_codes?.operations
            ? Array.from(
                error?.response?.data?.extras?.result_codes?.operations,
              )
            : error.message || "Internal server error",
        });
      }
    },
  );

  app.get("/api/protected/trade/offers", rateLimiter, async (req, res) => {
    try {
      const { secretKey } = req.query as any;

      if (!secretKey) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const orders = await stellarService.getUserOrders(secretKey);
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({
        message: error.message || "Something went wrong.",
      });
    }
  });

  app.delete(
    "/api/protected/trade/offers/:id",
    rateLimiter,
    async (req, res) => {
      try {
        const { secretKey } = req.query as any;

        if (!secretKey) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { id } = req.params;
        const { selling, buying } = req.body;

        await stellarService.cancelLimitOrder(
          secretKey,
          id,
          new Asset(selling?.code, selling?.issuer),
          new Asset(buying?.code, buying?.issuer),
        );
        res.json({ message: "Limit order cancelled successfully" });
      } catch (error: any) {
        res.status(500).json({
          message: error.message || "Something went wrong.",
        });
      } finally {
        console.log("Limit order cancelled successfully");
      }
    },
  );

  // Liquidity pool routes
  app.post(
    "/api/protected/liquidity/add",
    rateLimiter,
    walletAuthMiddleware,
    async (req, res) => {
      try {
        const secretKey = (req as any).secretKey;

        const validatedData = addLiquiditySchema.parse(req.body);
        const { assetA, assetB, amountA, amountB, minPrice, maxPrice } =
          validatedData;

        // Convert schema assets to Stellar SDK assets
        const stellarAssetA =
          assetA.type === "native"
            ? Asset.native()
            : new Asset(assetA.code!, assetA.issuer!);
        const stellarAssetB =
          assetB.type === "native"
            ? Asset.native()
            : new Asset(assetB.code!, assetB.issuer!);

        const result = await stellarService.addLiquidity(
          secretKey,
          stellarAssetA,
          stellarAssetB,
          amountA,
          amountB,
          minPrice,
          maxPrice,
        );

        res.json({ message: "Liquidity added successfully", result });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Validation error", errors: error.errors });
        }
        console.error("Add liquidity error:", error);
        console.error(
          "Error details:",
          error.response?.data?.extras.result_codes.operations,
        );
        res
          .status(500)
          .json({ message: error.message || "Internal server error" });
      }
    },
  );

  app.post(
    "/api/protected/liquidity/remove",
    rateLimiter,
    walletAuthMiddleware,
    async (req, res) => {
      try {
        const secretKey = (req as any).secretKey;

        const validatedData = removeLiquiditySchema.parse(req.body);
        const { poolId, amount, minAmountA, minAmountB } = validatedData;

        const result = await stellarService.removeLiquidity(
          secretKey,
          poolId,
          amount,
          minAmountA,
          minAmountB,
        );

        res.json({ message: "Liquidity removed successfully", result });
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return res
            .status(400)
            .json({ message: "Validation error", errors: error.errors });
        }
        console.error("Remove liquidity error:", error);
        res
          .status(500)
          .json({ message: error.message || "Internal server error" });
      }
    },
  );

  app.get(
    "/api/protected/liquidity/pools",
    rateLimiter,
    walletAuthMiddleware,
    async (req, res) => {
      try {
        const secretKey = (req as any).secretKey;

        const pools = await stellarService.getUserLiquidityPools(secretKey);
        res.json(pools);
      } catch (error: any) {
        console.error("Liquidity pools error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/protected/liquidity/pool/:id",
    rateLimiter,
    async (req, res) => {
      try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
          return res.status(400).json({ message: "Valid Pool ID is required" });
        }

        const pool = await stellarService.getLiquidityPool(id);
        if (!pool) {
          return res.status(404).json({ message: "Pool not found" });
        }

        res.json(pool);
      } catch (error: any) {
        console.error("Get liquidity pool error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // Network supply endpoint
  app.get("/api/network/supply", rateLimiter, async (req, res) => {
    try {
      const query = req.query;

      const totalSupply = await stellarService.getCirculatingSupply();
      const maxSupply = 100000000;

      if (query.type === "total") {
        return res.status(200).send(totalSupply.toString()); // Total Supply
      }

      if (query.type === "circulating") {
        return res.status(200).send(totalSupply.toString()); // Total Circulating Supply
      }

      if (query.type === "max") {
        return res.status(200).send(maxSupply.toString());
      }

      // Default response when no type is specified
      const stats = await storage.getNetworkStats();
      const circulatingSupply = stats?.totalSupply || "0";

      res.json({
        totalSupply: circulatingSupply,
        circulatingSupply,
        maxSupply, // 100 million DOPE max supply
      });
    } catch (error: any) {
      console.error("Network supply error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Profile update routes
  app.patch("/api/protected/profile", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = updateProfileSchema.parse(req.body);
      const { fullName, profilePicture } = validatedData;

      // Update user profile
      const updatedUser = await storage.updateUser(userId, {
        fullName,
        ...(profilePicture && { profilePicture }),
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return user without sensitive data
      const { password, ...safeUser } = updatedUser;
      res.json({ message: "Profile updated successfully", user: safeUser });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/protected/username", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = updateUsernameSchema.parse(req.body);
      const { username } = validatedData;

      // Check if username is already taken
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Username is already taken" });
      }

      // Update username
      const updatedUser = await storage.updateUser(userId, { username });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Return user without sensitive data
      const { password, ...safeUser } = updatedUser;
      res.json({ message: "Username updated successfully", user: safeUser });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error("Username update error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard data
  // Email verification endpoints
  app.post(
    "/api/protected/send-verification",
    rateLimiter,
    async (req, res) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await storage.getUser(userId);
        if (!user) {
          return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified) {
          return res.status(400).json({ message: "Email already verified" });
        }

        // In a real implementation, you would send an email here
        // For now, we'll just mark as verified after 24 hours simulation
        console.log(`Verification email would be sent to ${user.email}`);

        res.json({ message: "Verification email sent" });
      } catch (error) {
        console.error("Send verification error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  app.post("/api/protected/verify-email", async (req, res) => {
    try {
      const userId = req.user?.id;
      const { code } = verifyEmailSchema.parse(req.body);
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // In a real implementation, you would validate the verification code
      // For demo purposes, accept any 6-digit code
      if (!code || code.length !== 6) {
        return res.status(400).json({ message: "Invalid verification code" });
      }

      const updatedUser = await storage.updateUser(userId, {
        isVerified: true,
        updatedAt: new Date(),
      });

      // Give verification bonus
      await storage.addReferralBonus(userId, "5.0"); // 5 DOPE bonus for verification

      res.json({
        message: "Email verified successfully",
        user: {
          id: updatedUser.id,
          isVerified: updatedUser.isVerified,
        },
      });
    } catch (error) {
      console.error("Verify email error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Game routes
  app.get("/api/protected/games/stats", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get or create game stats
      let gameStats = await storage.getGameStats(userId);
      if (!gameStats) {
        gameStats = {
          userId,
          totalEarned: 0,
          gamesPlayed: 0,
          bestScore: 0,
          totalDogeClicks: 0,
          totalPepeClicks: 0,
          dailyStreak: 0,
          lastClaimDate: null,
          rank: 0
        };
        await storage.setGameStats(userId, gameStats);
      }

      // Check if user can claim daily reward (24 hours since last claim)
      const now = new Date();
      const lastClaim = gameStats.lastClaimDate ? new Date(gameStats.lastClaimDate) : null;
      const canClaimDaily = !lastClaim || 
        (now.getTime() - lastClaim.getTime()) >= 24 * 60 * 60 * 1000;

      // Calculate rank
      const allStats = await storage.getAllGameStats();
      const sortedStats = allStats.sort((a, b) => b.totalEarned - a.totalEarned);
      const userRank = sortedStats.findIndex(s => s.userId === userId) + 1;

      res.json({
        ...gameStats,
        canClaimDaily,
        rank: userRank || 999
      });
    } catch (error) {
      console.error("Get game stats error:", error);
      res.status(500).json({ error: "Failed to get game stats" });
    }
  });

  app.get("/api/protected/games/leaderboard", async (req, res) => {
    try {
      const allStats = await storage.getAllGameStats();
      const leaderboard = [];
      
      for (const stats of allStats.sort((a, b) => b.totalEarned - a.totalEarned).slice(0, 50)) {
        try {
          const user = await storage.getUser(stats.userId);
          leaderboard.push({
            id: stats.userId,
            username: user?.username || `Player${stats.userId.slice(0, 8)}`,
            totalScore: stats.bestScore,
            totalEarned: stats.totalEarned,
            rank: leaderboard.length + 1
          });
        } catch (userError) {
          // Skip if user not found
          console.warn(`User ${stats.userId} not found for leaderboard`);
        }
      }

      res.json(leaderboard);
    } catch (error) {
      console.error("Get leaderboard error:", error);
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  app.post("/api/protected/games/submit-score", async (req, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { gameType, score, dogeClicks, pepeClicks, pin } = req.body;

      if (!gameType || score < 0) {
        return res.status(400).json({ error: "Invalid score data" });
      }

      // Different reward calculations based on game type
      let totalReward = 0;
      
      switch (gameType) {
        case "tap-to-earn":
          const baseReward = Math.floor(score / 20); // 1 DOPE per 20 points
          const dogeBonus = (dogeClicks || 0) * 0.3; // Bonus for DOGE clicks
          const pepeBonus = (pepeClicks || 0) * 0.2; // Bonus for PEPE clicks
          totalReward = baseReward + dogeBonus + pepeBonus;
          break;
          
        case "spin-wheel":
          totalReward = score * 0.1; // Spin rewards are already calculated
          break;
          
        case "hamster-tap":
          totalReward = score * 0.001; // Small reward for hamster taps
          break;
          
        default:
          totalReward = Math.floor(score / 100); // Default calculation
      }

      // Minimum reward cap
      totalReward = Math.max(0.0001, Math.min(totalReward, 50)); // Max 50 DOPE per game

      // Update game stats
      let gameStats = await storage.getGameStats(userId);
      if (!gameStats) {
        gameStats = {
          userId,
          totalEarned: 0,
          gamesPlayed: 0,
          bestScore: 0,
          totalDogeClicks: 0,
          totalPepeClicks: 0,
          dailyStreak: 0,
          lastClaimDate: null,
          rank: 0
        };
      }

      gameStats.totalEarned += totalReward;
      gameStats.gamesPlayed += 1;
      gameStats.bestScore = Math.max(gameStats.bestScore, score);
      gameStats.totalDogeClicks += dogeClicks || 0;
      gameStats.totalPepeClicks += pepeClicks || 0;

      await storage.setGameStats(userId, gameStats);

      // Issue DOPE tokens to user if PIN provided and wallet session available
      if (totalReward > 0) {
        try {
          let secretKey = null;
          
          if (pin) {
            // Generate session password from PIN
            const sessionPassword = walletService.generateSessionPassword(userId, pin);
            
            // Try to retrieve secret key
            try {
              secretKey = await walletService.getUserSecretKey(userId, sessionPassword);
            } catch (error) {
              console.log("No wallet session found for token issuance");
            }
          }
          
          if (secretKey) {
            await stellarService.issueDopeTokens(secretKey, totalReward.toFixed(4));
            console.log(`Issued ${totalReward.toFixed(4)} DOPE tokens to user ${userId}`);
          } else {
            console.log("No wallet session - rewards tracked but tokens not issued");
          }
        } catch (error) {
          console.error("Failed to issue DOPE tokens:", error);
          // Don't fail the request if token issuance fails
        }
      }

      res.json({
        success: true,
        reward: totalReward.toFixed(4),
        newStats: gameStats
      });
    } catch (error) {
      console.error("Submit score error:", error);
      res.status(500).json({ error: "Failed to submit score" });
    }
  });

  app.post("/api/protected/games/daily-reward", async (req, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { pin } = req.body;

      let gameStats = await storage.getGameStats(userId);
      if (!gameStats) {
        gameStats = {
          userId,
          totalEarned: 0,
          gamesPlayed: 0,
          bestScore: 0,
          totalDogeClicks: 0,
          totalPepeClicks: 0,
          dailyStreak: 0,
          lastClaimDate: null,
          rank: 0
        };
      }

      const now = new Date();
      const lastClaim = gameStats.lastClaimDate ? new Date(gameStats.lastClaimDate) : null;

      // Check if 24 hours have passed since last claim
      if (lastClaim && (now.getTime() - lastClaim.getTime()) < 24 * 60 * 60 * 1000) {
        return res.status(400).json({ error: "Daily reward already claimed. Please wait 24 hours." });
      }

      // Calculate streak
      let newStreak = 1;
      if (lastClaim) {
        const timeDiff = now.getTime() - lastClaim.getTime();
        const daysDiff = Math.floor(timeDiff / (24 * 60 * 60 * 1000));

        if (daysDiff === 1) {
          newStreak = gameStats.dailyStreak + 1;
        } else if (daysDiff > 1) {
          newStreak = 1; // Reset streak
        }
      }

      // Calculate reward based on streak
      const baseReward = 5;
      const streakBonus = Math.min(newStreak * 1, 25); // Max 25 bonus
      const totalReward = baseReward + streakBonus;

      // Update stats
      gameStats.dailyStreak = newStreak;
      gameStats.lastClaimDate = now.toISOString();
      gameStats.totalEarned += totalReward;

      await storage.setGameStats(userId, gameStats);

      // Issue DOPE tokens if PIN provided and wallet session available
      let tokensIssued = false;
      if (pin) {
        try {
          // Generate session password from PIN
          const sessionPassword = walletService.generateSessionPassword(userId, pin);
          
          // Try to retrieve secret key
          const secretKey = await walletService.getUserSecretKey(userId, sessionPassword);
          
          if (secretKey) {
            await stellarService.issueDopeTokens(secretKey, totalReward.toFixed(4));
            tokensIssued = true;
            console.log(`Issued ${totalReward.toFixed(4)} DOPE daily reward tokens to user ${userId}`);
          }
        } catch (error) {
          console.error("Failed to issue daily reward DOPE tokens:", error);
          // Continue without failing - reward is still tracked
        }
      }

      res.json({
        success: true,
        reward: totalReward,
        streak: newStreak,
        tokensIssued
      });
    } catch (error) {
      console.error("Daily reward error:", error);
      res.status(500).json({ error: "Failed to claim daily reward" });
    }
  });

  // Withdrawal routes
  app.get("/api/protected/withdrawal/methods", async (req, res) => {
    try {
      const methods = [
        { id: "bank", name: "Bank Transfer", fee: "2.5%", time: "3-5 business days" },
        { id: "paypal", name: "PayPal", fee: "3.0%", time: "1-2 business days" },
        { id: "venmo", name: "Venmo", fee: "2.0%", time: "1-2 business days" },
        { id: "cashapp", name: "Cash App", fee: "2.0%", time: "1-2 business days" },
        { id: "crypto", name: "Cryptocurrency", fee: "1.0%", time: "10-30 minutes" },
      ];
      res.json(methods);
    } catch (error) {
      console.error("Get withdrawal methods error:", error);
      res.status(500).json({ error: "Failed to get withdrawal methods" });
    }
  });

  app.post("/api/protected/withdrawal/submit", requireWalletAuth, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { amount, method, accountDetails } = req.body;

      if (!amount || !method || parseFloat(amount) < 10) {
        return res.status(400).json({ error: "Invalid withdrawal amount" });
      }

      const secretKey = req.walletSession?.secretKey;
      if (!secretKey) {
        return res.status(401).json({ error: "Wallet session required" });
      }

      // Check user's DOPE balance
      const dopeBalance = await stellarService.getDOPEBalance(userId);
      if (dopeBalance < parseFloat(amount)) {
        return res.status(400).json({ error: "Insufficient DOPE balance" });
      }

      // Calculate processing fee
      const fees = {
        bank: 0.025,
        paypal: 0.03,
        venmo: 0.02,
        cashapp: 0.02,
        crypto: 0.01,
      };

      const fee = fees[method as keyof typeof fees] || 0.025;
      const feeAmount = parseFloat(amount) * fee;
      const netAmount = parseFloat(amount) - feeAmount;

      // Create withdrawal record
      const withdrawalId = `wd_${Date.now()}_${userId.slice(0, 8)}`;
      const withdrawal = {
        id: withdrawalId,
        userId,
        amount: parseFloat(amount),
        netAmount,
        feeAmount,
        method,
        accountDetails,
        status: "pending",
        createdAt: new Date().toISOString(),
        processedAt: null,
      };

      // Store withdrawal request
      await storage.setWithdrawalRequest(withdrawalId, withdrawal);

      // For crypto withdrawals, process immediately
      if (method === "crypto" && accountDetails.cryptoAddress) {
        try {
          // Convert DOPE to USDC and send to user's address
          const usdcAmount = (netAmount * 0.25).toFixed(6); // Assuming 1 DOPE = 0.25 USDC

          // Send USDC to user's address
          await stellarService.sendTokens(
            secretKey,
            accountDetails.cryptoAddress,
            usdcAmount,
            "USDC"
          );

          // Burn the DOPE tokens from user's wallet
          await stellarService.sendTokens(
            secretKey,
            stellarService.dopeDistributorKeypair.publicKey(),
            amount,
            "DOPE"
          );

          withdrawal.status = "completed";
          withdrawal.processedAt = new Date().toISOString();
          await storage.setWithdrawalRequest(withdrawalId, withdrawal);

          return res.json({
            success: true,
            withdrawalId,
            amount: netAmount,
            processingTime: "Completed",
            txHash: "completed_instantly"
          });
        } catch (error) {
          console.error("Crypto withdrawal error:", error);
          withdrawal.status = "failed";
          await storage.setWithdrawalRequest(withdrawalId, withdrawal);
          return res.status(500).json({ error: "Failed to process crypto withdrawal" });
        }
      }

      // For other methods, mark as pending for manual processing
      const processingTimes = {
        bank: "3-5 business days",
        paypal: "1-2 business days",
        venmo: "1-2 business days",
        cashapp: "1-2 business days",
      };

      // Reserve the DOPE tokens (send to a holding address)
      try {
        await stellarService.sendTokens(
          secretKey,
          stellarService.dopeDistributorKeypair.publicKey(),
          amount,
          "DOPE"
        );
      } catch (error) {
        console.error("Failed to reserve DOPE tokens:", error);
        return res.status(500).json({ error: "Failed to process withdrawal" });
      }

      res.json({
        success: true,
        withdrawalId,
        amount: netAmount,
        processingTime: processingTimes[method as keyof typeof processingTimes] || "1-3 business days"
      });

    } catch (error) {
      console.error("Withdrawal submission error:", error);
      res.status(500).json({ error: "Failed to submit withdrawal" });
    }
  });

  // Mining routes
  app.get("/api/protected/mining/status", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const status = await miningService.getMiningStatus(userId);
      res.json(status);
    } catch (error: any) {
      console.error("Mining status error:", error.message);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/protected/dashboard", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [user, wallet, networkStats] = (await Promise.all([
        storage.getUser(userId),
        storage.getWallet(userId),
        storage.getNetworkStats(),
      ])) as any;

      const miningStatus = await miningService.getMiningStatus(userId);

      // Create safe user object without sensitive fields
      const safeUser = user
        ? {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            profilePicture: user.profilePicture,
            publicKey: (wallet && wallet.publicKey) || "",
            isVerified: user.isVerified,
            level: user.level,
            referralCode: user.referralCode,
            referredBy: user.referredBy,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          }
        : null;

      // Get latest XLM balance from Stellar
      const xlmBalance = await stellarService.getXLMBalance(userId);
      // Get latest DOPE balance from Stellar
      const dopeBalance = await stellarService.getDOPEBalance(userId);
      // Get latest USDC balance from Stellar
      const usdcBalance = await stellarService.getUSDCBalance(userId);
      // Get latest GAS balance from Stellar
      const gasBalance = await stellarService.getGASBalance(userId);

      res.json({
        user: {
          ...safeUser,
          isActivated:
            (await stellarService.accountExists(wallet.publicKey)) &&
            xlmBalance >= 2,
        },
        wallet: {
          xlmBalance: xlmBalance.toString(),
          dopeBalance: dopeBalance.toString(),
          usdcBalance: usdcBalance.toString(),
          gasBalance: gasBalance.toString(),
        },
        mining: miningStatus,
        networkStats: {
          id: networkStats.id,
          activeMiners: networkStats.activeMiners,
          totalSupply: await stellarService.getCirculatingSupply(),
          miningRate: networkStats.miningRate,
          lastBlockTime: networkStats.lastBlockTime,
          updatedAt: networkStats.updatedAt,
        },
      });
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/protected/trade/values", async (req, res) => {
    try {
      const userId = req?.user?.id;

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const marketValue = (await stellarService.getMarketValue(userId)) as any;
      res.json({
        selling_price: marketValue?.selling_price,
        buying_price: marketValue?.buying_price,
      });
    } catch (error) {
      res.status(500).json({
        message: "Something went wrong",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}