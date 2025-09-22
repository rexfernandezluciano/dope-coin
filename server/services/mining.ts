import {
  Keypair,
  TransactionBuilder,
  Operation,
  Asset,
} from "@stellar/stellar-sdk";
import { storage } from "../storage.js";
import {
  stellarService,
  server,
  dopeIssuerKeypair,
  dopeDistributorKeypair,
  networkPassphrase,
  BASE_FEE,
} from "./stellar.js";
import { Decimal } from "decimal.js";

const BASE_MINING_RATE = new Decimal(0.05); // DOPE per hour
const MINING_SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REWARD_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds
const MIN_SESSION_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown between sessions
const MAX_NETWORK_EFFECT_BONUS = new Decimal(2.0); // Maximum 2x bonus from network effects
const REFERRAL_BONUS_RATE = new Decimal(0.1); // 10% bonus for having referrals
const ACTIVE_BONUS_MULTIPLIER = new Decimal(1.2); // 20% bonus for highly active users

stellarService
  .initializeDistributor()
  .then(() => {
    console.log("Distributor initialized successfully");
  })
  .catch((error) => {
    console.error("Error initializing distributor:", error);
  });

export class MiningService {
  async startMining(userId: string, secretKey: string) {
    try {
      // Check if user already has an active mining session
      const existingSession = await storage.getActiveMiningSession(userId);
      if (existingSession) {
        return existingSession;
      }

      // Check for session cooldown
      await this.validateSessionCooldown(userId);

      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check GAS balance - require 10 GAS to start mining
      const gasBalance = await stellarService.getGASBalance(secretKey);
      const requiredGas = 10;

      if (gasBalance < requiredGas) {
        throw new Error(
          `Insufficient GAS. You need ${requiredGas} GAS to start mining. Current balance: ${gasBalance} GAS`,
        );
      }

      // Deduct GAS fee for mining
      await this.deductGasFee(userId, requiredGas);

      // Enhanced mining rate calculation with network effects
      const miningRate = await this.calculateEnhancedMiningRate(
        userId,
        user.level || 1,
      );

      const session = await storage.createMiningSession({
        userId,
        startTime: new Date(),
        rate: miningRate.toString(),
        isActive: true,
        progress: 0,
      });

      // Update network stats
      await this.updateNetworkStats();

      return session;
    } catch (error) {
      console.error("Error starting mining:", error);
      throw error;
    }
  }

  private async deductGasFee(secretKey: string, gasAmount: number): Promise<void> {
    try {
      console.log(
        `Starting GAS deduction for user ${userId}, amount: ${gasAmount}`,
      );

      // Validate input
      if (gasAmount <= 0) {
        throw new Error("Gas amount must be positive");
      }

      if (!secretKey) {
        throw new Error("User stellar account not found");
      }

      const userKeypair = Keypair.fromSecret(user.stellarSecretKey);
      console.log(`User public key: ${userKeypair.publicKey()}`);

      // Load account with detailed logging
      console.log("Loading account...");
      const account = await server.loadAccount(userKeypair.publicKey());
      console.log(`Account sequence: ${account.sequenceNumber()}`);
      console.log(`Account balances:`, account.balances);

      // Validate keypair objects
      console.log(`Issuer public key: ${dopeIssuerKeypair.publicKey()}`);
      console.log(
        `Distributor public key: ${dopeDistributorKeypair.publicKey()}`,
      );

      const gasAsset = new Asset("GAS", dopeIssuerKeypair.publicKey());
      console.log(`GAS Asset: ${gasAsset.code} - ${gasAsset.issuer}`);

      // Check trustline and balance
      const gasBalance = account.balances.find(
        (balance: any) =>
          balance.asset_code === "GAS" &&
          balance.asset_issuer === dopeIssuerKeypair.publicKey(),
      );

      if (!gasBalance) {
        console.error(
          "Available balances:",
          account.balances.map((b: any) => ({
            asset:
              b.asset_type === "native"
                ? "XLM"
                : `${b.asset_code}-${b.asset_issuer}`,
            balance: b.balance,
          })),
        );
        throw new Error("User does not have a trustline to GAS asset");
      }

      const availableGas = parseFloat(gasBalance.balance);
      console.log(`Available GAS: ${availableGas}, Required: ${gasAmount}`);

      if (availableGas < gasAmount) {
        throw new Error(
          `Insufficient GAS balance. Required: ${gasAmount}, Available: ${availableGas}`,
        );
      }

      // Format amount properly
      const formattedAmount = parseFloat(gasAmount.toFixed(7)).toString();
      console.log(`Formatted amount: ${formattedAmount}`);

      // Validate network passphrase
      console.log(`Network passphrase: ${networkPassphrase}`);
      console.log(`Base fee: ${BASE_FEE}`);

      // Build transaction with detailed logging
      console.log("Building transaction...");
      const transactionBuilder = new TransactionBuilder(account, {
        fee: BASE_FEE.toString(),
        networkPassphrase,
      });

      console.log("Adding payment operation...");
      const transaction = transactionBuilder
        .addOperation(
          Operation.payment({
            destination: dopeDistributorKeypair.publicKey(),
            asset: gasAsset,
            amount: formattedAmount,
          }),
        )
        .setTimeout(30)
        .build();

      console.log("Transaction built successfully");
      console.log(
        `Transaction XDR before signing: ${transaction.toEnvelope().toXDR("base64")}`,
      );

      // Sign transaction
      console.log("Signing transaction...");
      transaction.sign(userKeypair);

      console.log(
        `Transaction XDR after signing: ${transaction.toEnvelope().toXDR("base64")}`,
      );

      // Submit transaction
      console.log("Submitting transaction...");
      const result = await server.submitTransaction(transaction);

      console.log(
        `Successfully deducted ${gasAmount} GAS from user ${userId}. Transaction: ${result.hash}`,
      );
    } catch (error: any) {
      console.error("Detailed error information:");
      console.error("Error message:", error.message);
      console.error("Error response:", error.response?.data);

      if (error.response?.data) {
        const errorData = error.response.data;
        console.error("Status:", errorData.status);
        console.error("Title:", errorData.title);
        console.error("Detail:", errorData.detail);

        if (errorData.extras) {
          console.error("Extras:", JSON.stringify(errorData.extras, null, 2));

          if (errorData.extras.result_codes) {
            const codes = errorData.extras.result_codes;
            console.error("Transaction result code:", codes.transaction);
            console.error("Operation result codes:", codes.operations);

            // Common 400 error scenarios
            if (codes.transaction === "tx_bad_seq") {
              throw new Error(
                "Transaction sequence number is invalid. Account may have pending transactions.",
              );
            }
            if (codes.transaction === "tx_insufficient_fee") {
              throw new Error(
                "Transaction fee is too low or insufficient XLM balance.",
              );
            }
            if (codes.operations?.includes("op_malformed")) {
              throw new Error(
                "Payment operation is malformed. Check asset or amount format.",
              );
            }
            if (codes.operations?.includes("op_underfunded")) {
              throw new Error("Insufficient balance for the payment.");
            }
            if (codes.operations?.includes("op_no_destination")) {
              throw new Error("Destination account does not exist.");
            }
            if (codes.operations?.includes("op_no_trust")) {
              throw new Error(
                "Destination account has no trustline for this asset.",
              );
            }
          }

          if (errorData.extras.envelope_xdr) {
            console.error(
              "Transaction envelope XDR:",
              errorData.extras.envelope_xdr,
            );
          }

          if (errorData.extras.result_xdr) {
            console.error("Result XDR:", errorData.extras.result_xdr);
          }
        }
      }

      throw new Error(`Failed to deduct GAS fee: ${error.message}`);
    }
  }

  async stopMining(userId: string) {
    try {
      const session = await storage.getActiveMiningSession(userId);
      if (!session) {
        throw new Error("No active mining session found");
      }

      const endTime = new Date();
      const miningDuration =
        endTime.getTime() - new Date(session.startTime).getTime();
      const hoursMinned = miningDuration / (60 * 60 * 1000);

      // Add validation for rate
      const rate = parseFloat(session.rate);
      if (isNaN(rate)) {
        throw new Error("Invalid mining rate");
      }

      const totalShouldHaveEarned = hoursMinned * rate;
      const alreadyIssued = parseFloat(session.totalEarned || "0");

      // Add validation for calculated amounts
      if (isNaN(totalShouldHaveEarned) || isNaN(alreadyIssued)) {
        throw new Error("Invalid earnings calculation");
      }

      // Calculate only the amount owed (not yet issued)
      const amountOwed = Math.max(0, totalShouldHaveEarned - alreadyIssued);

      const updatedSession = await storage.updateMiningSession(session.id, {
        endTime,
        totalEarned: totalShouldHaveEarned.toFixed(7),
        isActive: false,
        progress: 100,
      });

      // Issue only the incremental DOPE tokens that haven't been claimed yet
      if (amountOwed > 0 && !isNaN(amountOwed)) {
        const amountString = amountOwed.toFixed(7);
        console.log(`Issuing ${amountString} DOPE tokens to user ${userId}`);
        await stellarService.issueDopeTokens(userId, amountString);
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
      const currentEarned = hoursElapsed * parseFloat(session.rate || "0");

      // Calculate next reward time
      const lastRewardTime =
        Math.floor(elapsedTime / REWARD_INTERVAL) * REWARD_INTERVAL;
      const nextRewardTime = lastRewardTime + REWARD_INTERVAL;
      const timeToNextReward = Math.max(0, nextRewardTime - elapsedTime);

      if (progress === 100) {
        await this.stopMining(userId);
        return {
          isActive: false,
          session,
          nextReward: null,
          progress: 100,
          currentEarned: currentEarned.toFixed(8),
          rate: session.rate,
        };
      }

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
      const rewardsClaimed = Math.floor(
        parseFloat(session.totalEarned || "0") / parseFloat(session.rate),
      );

      const unclaimedRewards = rewardsPossible - rewardsClaimed;

      if (unclaimedRewards <= 0) {
        throw new Error("No rewards available to claim");
      }

      const rewardAmount = unclaimedRewards * parseFloat(session.rate);
      const newTotalEarned =
        parseFloat(session.totalEarned || "0") + rewardAmount;

      // Update session
      await storage.updateMiningSession(session.id, {
        totalEarned: newTotalEarned.toString(),
      });

      // Issue DOPE tokens
      await stellarService.issueDopeTokens(userId, rewardAmount.toFixed(8));

      // Check for level progression
      await this.checkLevelProgression(userId, newTotalEarned);

      return {
        amount: rewardAmount.toFixed(8),
        totalEarned: newTotalEarned.toFixed(8),
      };
    } catch (error) {
      console.error("Error claiming reward:", error);
      throw error;
    }
  }

  async claimUnclaimedRewards(userId: string): Promise<void> {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }

      const claimableBalances =
        await stellarService.getClaimableBalances(userId);

      if (Array.isArray(claimableBalances) && claimableBalances.length > 0) {
        for (const balance of claimableBalances) {
          await stellarService.claimBalance(userId, balance.id);
          storage.updateTransactionStatus(balance.id, "completed");
          await storage.updateWallet(userId, {
            dopeBalance: balance.amount,
          });
        }
      }
    } catch (error) {
      console.error("Error claiming unclaimed rewards:", error);
      throw error;
    }
  }

  async getClaimbaleBalances(userId: string): Promise<any[]> {
    try {
      if (!userId) {
        throw new Error("User ID is required");
      }
      const claimableBalances =
        await stellarService.getClaimableBalances(userId);
      return claimableBalances;
    } catch (error) {
      return [];
    }
  }

  private calculateMiningRate(level: number): number {
    // Increase mining rate by 10% per level
    return BASE_MINING_RATE.times(Math.pow(1.1, level - 1)).toNumber();
  }

  private async checkLevelProgression(
    userId: string,
    totalEarned: number,
  ): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) return;

      const currentLevel = user.level || 1;
      // Level progression: 10 DOPE per level
      const newLevel = Math.floor(totalEarned / 10) + 1;

      if (newLevel > currentLevel) {
        await storage.updateUser(userId, { level: newLevel });

        // Give level up bonus
        const levelUpBonus = (newLevel - currentLevel) * 2; // 2 DOPE per level gained
        await storage.addReferralBonus(userId, levelUpBonus.toString());

        console.log(
          `User ${userId} leveled up to level ${newLevel}! Bonus: ${levelUpBonus} DOPE`,
        );
      }
    } catch (error) {
      console.error("Error checking level progression:", error);
    }
  }

  private async calculateEnhancedMiningRate(
    userId: string,
    level: number,
  ): Promise<number> {
    // Start with base level rate
    let rate = this.calculateMiningRate(level);

    // Network effect bonus - higher bonus when network is smaller
    const networkBonus = await this.calculateNetworkEffect();
    rate *= networkBonus;

    // Referral bonus - bonus for users who have referred others
    const referralBonus = await this.calculateReferralBonus(userId);
    rate *= 1 + referralBonus;

    // Activity bonus - bonus for users who actively mine
    const activityBonus = await this.calculateActivityBonus(userId);
    rate *= 1 + activityBonus;

    return Number(rate.toFixed(8));
  }

  private async calculateNetworkEffect(): Promise<number> {
    try {
      const activeMiners = await storage.getActiveMiningSessionsCount();
      // Network effect: Early users get higher rates when network is smaller
      // Bonus decreases as network grows (Pi Network style)
      const networkFactor = Math.max(0.1, 1000 / (activeMiners + 100));
      return Math.min(MAX_NETWORK_EFFECT_BONUS.toNumber(), 1 + networkFactor);
    } catch (error) {
      console.error("Error calculating network effect:", error);
      return 1;
    }
  }

  private async calculateReferralBonus(userId: string): Promise<number> {
    try {
      // Count active referrals (users referred who are actively mining)
      const activeReferrals = await this.getActiveReferralCount(userId);
      return Math.min(0.5, activeReferrals * REFERRAL_BONUS_RATE.toNumber()); // Max 50% bonus
    } catch (error) {
      console.error("Error calculating referral bonus:", error);
      return 0;
    }
  }

  private async calculateActivityBonus(userId: string): Promise<number> {
    try {
      // Check user's mining activity in the last 7 days
      const recentActivity = await this.getRecentMiningActivity(userId);
      if (recentActivity >= 5) {
        // 5 or more mining sessions in 7 days
        return 0.2; // 20% bonus for active miners
      }
      return 0;
    } catch (error) {
      console.error("Error calculating activity bonus:", error);
      return 0;
    }
  }

  private async validateSessionCooldown(userId: string): Promise<void> {
    try {
      // Check if user has completed a session recently
      const recentSessions = await this.getRecentCompletedSessions(userId, 1);
      if (recentSessions.length > 0) {
        const lastSession = recentSessions[0];
        if (lastSession.endTime) {
          const timeSinceLastSession =
            Date.now() - new Date(lastSession.endTime).getTime();
          if (timeSinceLastSession < MIN_SESSION_COOLDOWN) {
            const remainingCooldown = Math.ceil(
              (MIN_SESSION_COOLDOWN - timeSinceLastSession) / 1000 / 60,
            );
            throw new Error(
              `Mining cooldown active. Please wait ${remainingCooldown} minutes before starting a new session.`,
            );
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("Mining cooldown")) {
        throw error;
      }
      console.error("Error validating session cooldown:", error);
      // Don't block mining if we can't check cooldown
    }
  }

  private async getActiveReferralCount(userId: string): Promise<number> {
    try {
      return await storage.getReferralCount(userId);
    } catch (error) {
      console.error("Error getting active referral count:", error);
      return 0;
    }
  }

  private async getRecentMiningActivity(userId: string): Promise<number> {
    try {
      return await storage.getCompletedMiningSessionsCount(userId, 7);
    } catch (error) {
      console.error("Error getting recent mining activity:", error);
      return 0;
    }
  }

  private async getRecentCompletedSessions(
    userId: string,
    limit: number,
  ): Promise<any[]> {
    try {
      return await storage.getRecentMiningSessionsByUser(userId, limit);
    } catch (error) {
      console.error("Error getting recent completed sessions:", error);
      return [];
    }
  }

  async updateNetworkStats() {
    try {
      const activeMiners = await storage.getActiveMinerCount();
      const totalSupply = await stellarService.getCirculatingSupply();

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
setInterval(
  () => {
    miningService.updateNetworkStats();
  },
  5 * 60 * 1000,
);
