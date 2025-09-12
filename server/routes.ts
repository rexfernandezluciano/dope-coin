import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { authMiddleware } from "./middleware/auth";
import { rateLimiter } from "./middleware/rateLimiter";
import { jwtService } from "./services/jwt";
// Stellar service import will be fixed
// import { stellarService } from "./services/stellar";
// Mining service import will be fixed  
// import { miningService } from "./services/mining";
import { loginSchema, registerSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth routes
  app.post("/api/auth/register", rateLimiter, async (req, res) => {
    try {
      const validatedData = registerSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      
      // Create Stellar keypair (temporarily disabled)
      // const stellarKeypair = stellarService.generateKeypair();
      
      // Generate referral code
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const userData = {
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        fullName: validatedData.fullName,
        stellarPublicKey: null,
        stellarSecretKey: null,
        referralCode,
      };

      const user = await storage.createUser(userData);
      
      // Initialize wallet
      await storage.createWallet({ userId: user.id });
      
      // Create DOPE token for user if needed (temporarily disabled)
      // await stellarService.createUserToken(user.id);

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
        return res.status(400).json({ message: "Validation error", errors: error.errors });
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

      const isValidPassword = await bcrypt.compare(validatedData.password, user.password);
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
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Protected routes
  app.use("/api/protected", authMiddleware);

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
          createdAt: user.createdAt,
        },
        wallet,
        stats,
      });
    } catch (error) {
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

      const updatedUser = await storage.updateUser(userId, {
        fullName,
        profilePicture,
        updatedAt: new Date(),
      });

      // Remove sensitive data from updated user object
      const { password, stellarSecretKey, ...safeUpdatedUser } = updatedUser;
      
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
      // const session = await miningService.startMining(userId);
      // Temporarily return mock response
      res.json({ message: "Mining started - temporarily disabled", session: { id: "mock", userId, isActive: true, rate: "0.25" } });
    } catch (error) {
      console.error("Mining start error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/mining/stop", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      // const session = await miningService.stopMining(userId);
      // Temporarily return mock response
      res.json({ message: "Mining stopped - temporarily disabled", session: { id: "mock", userId, isActive: false } });
    } catch (error) {
      console.error("Mining stop error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/protected/mining/status", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      // const status = await miningService.getMiningStatus(userId);
      // Temporarily return mock response
      const status = { isActive: false, session: null, nextReward: null, progress: 0, currentEarned: 0 };
      res.json(status);
    } catch (error) {
      console.error("Mining status error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/protected/mining/claim", rateLimiter, async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      // const reward = await miningService.claimReward(userId);
      // Temporarily return mock response
      const reward = { amount: "0.25", totalEarned: "0.25" };
      res.json({ message: "Reward claimed", reward });
    } catch (error) {
      console.error("Mining claim error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Wallet routes
  app.get("/api/protected/wallet", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const wallet = await storage.getWallet(userId);
      
      // Get latest XLM balance from Stellar (temporarily disabled)
      // const xlmBalance = await stellarService.getXLMBalance(userId);
      const xlmBalance = 0;
      
      // Update wallet with latest balance
      const updatedWallet = await storage.updateWallet(userId, {
        xlmBalance: xlmBalance.toString(),
        lastUpdated: new Date(),
      });

      res.json(updatedWallet);
    } catch (error) {
      console.error("Wallet fetch error:", error);
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

      // const transaction = await stellarService.sendTokens(userId, toAddress, amount, assetType);
      // Temporarily return mock response
      const transaction = { hash: "mock-hash", status: "completed", amount, assetType };
      
      res.json({
        message: "Transaction sent",
        transaction,
      });
    } catch (error) {
      console.error("Send transaction error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

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
    } catch (error) {
      console.error("Transactions fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Network stats
  app.get("/api/network/stats", async (req, res) => {
    try {
      const stats = await storage.getNetworkStats();
      res.json(stats);
    } catch (error) {
      console.error("Network stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Dashboard data
  app.get("/api/protected/dashboard", async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      
      const [user, wallet, recentTransactions, networkStats] = await Promise.all([
        storage.getUser(userId),
        storage.getWallet(userId),
        storage.getTransactions(userId, 1, 5),
        storage.getNetworkStats(),
      ]);
      // Mock mining status for now
      const miningStatus = { isActive: false, rate: "0.25" };

      // Remove sensitive data from user object
      const { password, stellarSecretKey, ...safeUser } = user || {};
      
      res.json({
        user: safeUser,
        wallet,
        mining: miningStatus,
        recentTransactions,
        networkStats,
      });
    } catch (error) {
      console.error("Dashboard fetch error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
