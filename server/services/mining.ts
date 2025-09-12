import { storage } from "../storage";
import { stellarService } from "./stellar";

const BASE_MINING_RATE = 0.25; // DOPE per hour
const MINING_SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REWARD_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

export class MiningService {
  async startMining(userId: string) {
    try {
      // Check if user already has an active mining session
      const existingSession = await storage.getActiveMiningSession(userId);
      if (existingSession) {
        return existingSession;
      }

      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Calculate mining rate based on user level
      const miningRate = this.calculateMiningRate(user.level || 1);

      const session = await storage.createMiningSession({
        userId,
        startTime: new Date(),
        rate: miningRate.toString(),
        isActive: true,
        progress: 0,
      });

      return session;
    } catch (error) {
      console.error("Error starting mining:", error);
      throw error;
    }
  }

  async stopMining(userId: string) {
    try {
      const session = await storage.getActiveMiningSession(userId);
      if (!session) {
        throw new Error("No active mining session found");
      }

      const endTime = new Date();
      const miningDuration = endTime.getTime() - new Date(session.startTime).getTime();
      const hoursMinned = miningDuration / (60 * 60 * 1000);
      const totalEarned = hoursMinned * parseFloat(session.rate);

      const updatedSession = await storage.updateMiningSession(session.id, {
        endTime,
        totalEarned: totalEarned.toString(),
        isActive: false,
        progress: 100,
      });

      // Issue DOPE tokens to user
      if (totalEarned > 0) {
        await stellarService.issueDopeTokens(userId, totalEarned.toFixed(8));
      }

      return updatedSession;
    } catch (error) {
      console.error("Error stopping mining:", error);
      throw error;
    }
  }

  async getMiningStatus(userId: string) {
    try {
      const session = await storage.getActiveMiningSession(userId);
      if (!session) {
        return {
          isActive: false,
          session: null,
          nextReward: null,
          progress: 0,
          currentEarned: 0,
        };
      }

      const now = new Date();
      const startTime = new Date(session.startTime);
      const elapsedTime = now.getTime() - startTime.getTime();
      const sessionDuration = MINING_SESSION_DURATION;
      
      // Calculate progress (0-100)
      const progress = Math.min((elapsedTime / sessionDuration) * 100, 100);
      
      // Calculate current earnings
      const hoursElapsed = elapsedTime / (60 * 60 * 1000);
      const currentEarned = hoursElapsed * parseFloat(session.rate);
      
      // Calculate next reward time
      const lastRewardTime = Math.floor(elapsedTime / REWARD_INTERVAL) * REWARD_INTERVAL;
      const nextRewardTime = lastRewardTime + REWARD_INTERVAL;
      const timeToNextReward = Math.max(0, nextRewardTime - elapsedTime);

      return {
        isActive: true,
        session,
        nextReward: timeToNextReward,
        progress: Math.round(progress),
        currentEarned: currentEarned.toFixed(8),
        rate: session.rate,
      };
    } catch (error) {
      console.error("Error getting mining status:", error);
      throw error;
    }
  }

  async claimReward(userId: string) {
    try {
      const session = await storage.getActiveMiningSession(userId);
      if (!session) {
        throw new Error("No active mining session found");
      }

      const now = new Date();
      const elapsedTime = now.getTime() - new Date(session.startTime).getTime();
      const rewardsPossible = Math.floor(elapsedTime / REWARD_INTERVAL);
      const rewardsClaimed = Math.floor(parseFloat(session.totalEarned || "0") / parseFloat(session.rate));
      
      const unclaimedRewards = rewardsPossible - rewardsClaimed;
      
      if (unclaimedRewards <= 0) {
        throw new Error("No rewards available to claim");
      }

      const rewardAmount = unclaimedRewards * parseFloat(session.rate);
      const newTotalEarned = parseFloat(session.totalEarned || "0") + rewardAmount;

      // Update session
      await storage.updateMiningSession(session.id, {
        totalEarned: newTotalEarned.toString(),
      });

      // Issue DOPE tokens
      await stellarService.issueDopeTokens(userId, rewardAmount.toFixed(8));

      return {
        amount: rewardAmount.toFixed(8),
        totalEarned: newTotalEarned.toFixed(8),
      };
    } catch (error) {
      console.error("Error claiming reward:", error);
      throw error;
    }
  }

  private calculateMiningRate(level: number): number {
    // Increase mining rate by 10% per level
    return BASE_MINING_RATE * Math.pow(1.1, level - 1);
  }

  async updateNetworkStats() {
    try {
      const activeMiners = await storage.getActiveMinerCount();
      const totalSupply = await storage.getTotalDopeSupply();

      await storage.updateNetworkStats({
        activeMiners,
        totalSupply: totalSupply.toString(),
        lastBlockTime: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error updating network stats:", error);
    }
  }
}

export const miningService = new MiningService();

// Update network stats every 5 minutes
setInterval(() => {
  miningService.updateNetworkStats();
}, 5 * 60 * 1000);
