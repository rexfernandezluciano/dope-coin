import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import path from "path";
import { storage } from "../storage.js";
import { authMiddleware } from "../middleware/auth.js";
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
import { Asset } from "@stellar/stellar-sdk";
import z from "zod";
import rateLimit from "express-rate-limit";

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
    res.header("Content-Type", "application/toml").sendFile(stellarTomlPath);
  });

  // DOPE Image
  app.get("/assets/dope.png", (req, res) => {
    res
      .header("Content-Type", "image/png")
      .sendFile(path.join(import.meta.dirname, "../assets/dope.png"));
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

      // Create Stellar keypair
      const stellarKeypair = stellarService.generateKeypair();

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
        stellarPublicKey: stellarKeypair.publicKey(),
        stellarSecretKey: stellarKeypair.secret(),
        referralCode,
        referredBy: referrerUser?.id || null,
      };

      const user = await storage.createUser(userData);

      // Initialize wallet
      await storage.createWallet({ userId: user.id });

      // Create DOPE trustline for new user
      await stellarService.createAccountWithDopeTrustline(
        stellarKeypair,
        "1.0",
      );

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

      res.status(201).json({
        message: "User created successfully",
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          level: user.level,
          referralCode: user.referralCode,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
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
          stellarPublicKey: user.stellarPublicKey, // Keep public key, but not secret
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

      // Create safe updated user object without sensitive fields
      const safeUpdatedUser = {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        profilePicture: updatedUser.profilePicture,
        stellarPublicKey: updatedUser.stellarPublicKey, // Keep public key, but not secret
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
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const session = await miningService.startMining(userId);
      res.json({ message: "Mining started successfully", session });
    } catch (error: any) {
      console.error("Mining start error:", error.message);
      if (error.message.includes("Mining cooldown")) {
        res.status(400).json({ message: error.message });
      } else {
        res
          .status(500)
          .json({ message: "Internal server error: " + error.message });
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

      const claimbleBalances = await miningService.getClaimbaleBalances(userId);

      if (!claimbleBalances) {
        return res.status(404).json({ message: "No claimable balances found" });
      }

      return res.json({ balance: claimbleBalances });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/mining/claimable", rateLimiter, async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      await miningService.claimUnclaimedRewards(userId);
      return res.json({ message: "Rewards claimed successfully" });
    } catch (error) {
      return res.status(500).json({ message: "Internal server error" });
    }
  });

  // Wallet routes
  app.get("/api/protected/wallet", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [xlmBalance, dopeBalance, gasBalance] = await Promise.all([
        stellarService.getXLMBalance(userId),
        stellarService.getDOPEBalance(userId),
        stellarService.getGASBalance(userId),
      ]);

      res.json({
        xlmBalance: xlmBalance.toString(),
        dopeBalance: dopeBalance.toString(),
        gasBalance: gasBalance.toString(),
      });
    } catch (error: any) {
      console.error("Wallet error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/wallet/send", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const { toAddress, amount, assetType } = req.body;

      if (!toAddress || !amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid parameters" });
      }

      const transaction = await stellarService.sendTokens(
        userId,
        toAddress,
        amount,
        assetType,
      );

      res.json({
        message: "Transaction sent",
        transaction,
      });
    } catch (error) {
      console.error("Send transaction error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post(
    "/api/protected/wallet/convert-gas",
    rateLimiter,
    async (req, res) => {
      try {
        const userId = req.user?.id;
        if (!userId) {
          return res.status(401).json({ message: "Unauthorized" });
        }

        const { xlmAmount } = req.body;
        if (!xlmAmount || parseFloat(xlmAmount) <= 0) {
          return res.status(400).json({ message: "Invalid XLM amount" });
        }

        const result = await stellarService.convertXLMToGAS(userId, xlmAmount);
        res.json(result);
      } catch (error: any) {
        console.error("GAS conversion error:", error);
        res
          .status(500)
          .json({ message: error.message || "Internal server error" });
      }
    },
  );

  // Transaction history
  app.get("/api/protected/transactions", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const transactions = await storage.getTransactions(userId, page, limit);
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
  app.post("/api/protected/trade/execute", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

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
        userId,
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
  });

  app.post("/api/protected/asset/trust", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const { assetCode, assetIssuer } = req.body;

      if (!assetCode || !assetIssuer) {
        return res.status(400).json({ message: "Invalid asset details" });
      }

      await stellarService.createTrustline(userId, assetCode, assetIssuer);
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
  });

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

  app.post("/api/protected/trade/calculate", rateLimiter, async (req, res) => {
    try {
      const { sellAmount, tradingPair } = req.body;

      if (!sellAmount || !tradingPair) {
        return res.status(400).json({ message: "Missing required parameters" });
      }

      // Simple calculation for demo purposes
      // In production, this would query real market data
      const rate =
        tradingPair === "DOPE/XLM"
          ? 10
          : tradingPair === "XLM/DOPE"
            ? 0.1
            : tradingPair === "DOPE/USDC"
              ? 8
              : 0.1; // 1 XLM = 10 DOPE
      const estimatedAmount = (parseFloat(sellAmount) * rate).toFixed(6);

      res.json({
        sellAmount,
        tradingPair,
        estimatedAmount,
        rate: rate.toString(),
      });
    } catch (error: any) {
      console.error("Trade calculation error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/protected/trade/orderbook", rateLimiter, async (req, res) => {
    try {
      const validatedQuery = orderbookQuerySchema.parse(req.query);
      const { sellAssetCode, sellAssetIssuer, buyAssetCode, buyAssetIssuer } =
        validatedQuery;

      const sellAsset =
        sellAssetCode === "XLM"
          ? Asset.native()
          : new Asset(sellAssetCode, sellAssetIssuer);
      const buyAsset =
        buyAssetCode === "XLM"
          ? Asset.native()
          : new Asset(buyAssetCode, buyAssetIssuer);

      const orderbook = await stellarService.getOrderbook(sellAsset, buyAsset);
      res.json(orderbook);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Validation error", errors: error.errors });
      }
      console.error("Orderbook error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Liquidity pool routes
  app.post("/api/protected/liquidity/add", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

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
        userId,
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
  });

  app.post("/api/protected/liquidity/remove", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const validatedData = removeLiquiditySchema.parse(req.body);
      const { poolId, amount, minAmountA, minAmountB } = validatedData;

      const result = await stellarService.removeLiquidity(
        userId,
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
  });

  app.get("/api/protected/liquidity/pools", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const pools = await stellarService.getUserLiquidityPools(userId);
      res.json(pools);
    } catch (error: any) {
      console.error("Liquidity pools error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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
      const { password, stellarSecretKey, ...safeUser } = updatedUser;
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
      const { password, stellarSecretKey, ...safeUser } = updatedUser;
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

  app.get("/api/protected/dashboard", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const [user, wallet, recentTransactions, networkStats] =
        (await Promise.all([
          storage.getUser(userId),
          storage.getWallet(userId),
          storage.getTransactions(userId, 1, 5),
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
            stellarPublicKey: user.stellarPublicKey, // Keep public key, but not secret
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

      res.json({
        user: safeUser,
        wallet: {
          xlmBalance: xlmBalance.toString(),
          dopeBalance: dopeBalance.toString(),
        },
        mining: miningStatus,
        recentTransactions,
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

  const httpServer = createServer(app);
  return httpServer;
}
