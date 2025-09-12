import type { Express } from "express";
import { createServer, type Server } from "http";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { authMiddleware } from "./middleware/auth";
import { rateLimiter } from "./middleware/rateLimiter";
import { jwtService } from "./services/jwt";
import { stellarService } from "./services/stellar";
import { miningService } from "./services/mining";
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
      
      // Create Stellar keypair
      const stellarKeypair = stellarService.generateKeypair();
      
      // Generate referral code
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const userData = {
        username: validatedData.username,
        email: validatedData.email,
        password: hashedPassword,
        fullName: validatedData.fullName,
        stellarPublicKey: stellarKeypair.publicKey(),
        stellarSecretKey: stellarKeypair.secret(),
        referralCode,
      };

      const user = await storage.createUser(userData);
      
      // Initialize wallet
      await storage.createWallet({ userId: user.id });
      
      // Create DOPE token for user if needed
      await stellarService.createUserToken(user.id);

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
    } catch (error) {
      console.error("Mining start error:", error.message);
      if (error.message.includes('Mining cooldown')) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
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
    } catch (error) {
      console.error("Mining stop error:", error.message);
      if (error.message.includes('No active mining session')) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
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
    } catch (error) {
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
    } catch (error) {
      console.error("Mining claim error:", error.message);
      if (error.message.includes('No rewards available') || error.message.includes('No active mining session')) {
        res.status(400).json({ message: error.message });
      } else {
        res.status(500).json({ message: "Internal server error" });
      }
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
      
      // Get latest XLM balance from Stellar
      const xlmBalance = await stellarService.getXLMBalance(userId);
      
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

      const transaction = await stellarService.sendTokens(userId, toAddress, amount, assetType);
      
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

      // Create safe user object without sensitive fields
      const safeUser = user ? {
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
      } : null;
      
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
