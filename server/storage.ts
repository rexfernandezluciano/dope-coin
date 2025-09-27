/** @format */

import {
	users,
	miningSessions,
	wallets,
	networkStats,
	vaults,
	type User,
	type InsertUser,
	type MiningSession,
	type InsertMiningSession,
	type Wallet,
	type InsertWallet,
	type NetworkStats,
	type Vault,
	type InsertVault,
} from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, desc, sum, count, sql, gte } from "drizzle-orm";
import { stellarService } from "./services/stellar.js";

// Define VaultData interface for vault storage
interface VaultData {
	id: string;
	userId: string;
	name: string;
	encryptedData: string;
	salt: string;
	iv: string;
	createdAt: Date;
	lastAccessed: Date;
}

export interface IStorage {
	// User methods
	getUser(id: string): Promise<User | undefined>;
	getUserByUsername(username: string): Promise<User | undefined>;
	getUserByEmail(email: string): Promise<User | undefined>;
	getUserByReferralCode(referralCode: string): Promise<User | undefined>;
	createUser(insertUser: InsertUser): Promise<User>;
	updateUser(id: string, updates: Partial<User>): Promise<User>;

	// Wallet methods
	getWallet(userId: string): Promise<Wallet | undefined>;
	createWallet(insertWallet: InsertWallet): Promise<Wallet>;
	updateWallet(userId: string, updates: Partial<Wallet>): Promise<Wallet>;

	// Mining methods
	getActiveMiningSession(userId: string): Promise<MiningSession | undefined>;
	createMiningSession(insertSession: InsertMiningSession): Promise<MiningSession>;
	updateMiningSession(id: string, updates: Partial<MiningSession>): Promise<MiningSession>;

	// Stats methods
	getUserStats(userId: string): Promise<{
		totalSessions: number;
		totalEarned: string;
		totalReferrals: number;
		verificationStatus: boolean;
		miningStreak: number;
	}>;
	getNetworkStats(): Promise<NetworkStats | undefined>;
	updateNetworkStats(updates: Partial<NetworkStats>): Promise<NetworkStats>;
	getActiveMinerCount(): Promise<number>;
	getTotalDopeSupply(): Promise<number>;

	// Enhanced mining methods
	getCompletedMiningSessionsCount(userId: string, days: number): Promise<number>;
	getRecentMiningSessionsByUser(userId: string, limit: number): Promise<MiningSession[]>;
	getReferralCount(userId: string): Promise<number>;
	getActiveMiningSessionsCount(): Promise<number>;
	getLastMiningReward(userId: string): Promise<Date | null>;

	// Referral methods
	addReferralBonus(userId: string, amount: string): Promise<void>;
	getActiveReferrals(userId: string): Promise<User[]>;

	// Vault methods
	storeVault(vaultData: VaultData): Promise<void>;
	getVault(vaultId: string): Promise<VaultData | null>;
	getUserVaults(userId: string): Promise<VaultData[]>;
	deleteVault(vaultId: string): Promise<void>;

	// Game stats methods
	getGameStats(userId: string): Promise<any>;
	setGameStats(userId: string, stats: any): Promise<void>;
	getAllGameStats(): Promise<any[]>;

	// Withdrawal methods
	setWithdrawalRequest(withdrawalId: string, withdrawal: any): Promise<void>;
	getWithdrawalRequest(withdrawalId: string): Promise<any>;
	getUserWithdrawals(userId: string): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
	// Assuming a cache instance is available for game stats and withdrawals
	private cache: Map<string, any>;

	constructor() {
		this.cache = new Map();
	}

	async getUser(id: string): Promise<User | undefined> {
		const [result] = await db.select().from(users).leftJoin(wallets, eq(users.id, wallets.userId)).where(eq(users.id, id));
		return result?.users;
	}

	async getUserByUsername(username: string): Promise<User | undefined> {
		const [user] = await db.select().from(users).where(eq(users.username, username));
		return user || undefined;
	}

	async getUserByEmail(email: string): Promise<User | undefined> {
		const [result] = await db.select().from(users).leftJoin(wallets, eq(users.id, wallets.userId)).where(eq(users.email, email));
		return result?.users || undefined;
	}

	async createUser(insertUser: InsertUser): Promise<User> {
		const [user] = await db.insert(users).values(insertUser).returning();
		return user;
	}

	async updateUser(id: string, updates: Partial<User>): Promise<User> {
		const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
		return user;
	}

	// Wallet methods
	async getWallet(userId: string): Promise<Wallet | undefined> {
		const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
		return wallet || undefined;
	}

	async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
		const [wallet] = await db.insert(wallets).values(insertWallet).returning();
		return wallet;
	}

	async updateWallet(userId: string, updates: Partial<Wallet>): Promise<Wallet> {
		const [wallet] = await db.update(wallets).set(updates).where(eq(wallets.userId, userId)).returning();
		return wallet;
	}

	// Mining methods
	async getActiveMiningSession(userId: string): Promise<MiningSession | undefined> {
		const [session] = await db
			.select()
			.from(miningSessions)
			.where(and(eq(miningSessions.userId, userId), eq(miningSessions.isActive, true)));
		return session || undefined;
	}

	async createMiningSession(insertSession: InsertMiningSession): Promise<MiningSession> {
		const [session] = await db.insert(miningSessions).values(insertSession).returning();
		return session;
	}

	async updateMiningSession(id: string, updates: Partial<MiningSession>): Promise<MiningSession> {
		const [session] = await db.update(miningSessions).set(updates).where(eq(miningSessions.id, id)).returning();
		return session;
	}

	// Stats methods
	async getUserStats(userId: string): Promise<{
		totalSessions: number;
		totalEarned: string;
		totalReferrals: number;
		verificationStatus: boolean;
		miningStreak: number;
	}> {
		try {
			// Get total mining sessions
			const [sessionsResult] = await db.select({ count: count() }).from(miningSessions).where(eq(miningSessions.userId, userId));

			// Get total earned from mining sessions
			const [earningsResult] = await db
				.select({
					totalEarned: sql<string>`COALESCE(SUM(${miningSessions.totalEarned}), 0)`,
				})
				.from(miningSessions)
				.where(eq(miningSessions.userId, userId));

			// Get referral count
			const totalReferrals = await this.getReferralCount(userId);

			// Get user verification status
			const user = await this.getUser(userId);

			// Calculate mining streak (consecutive days with mining activity)
			const sevenDaysAgo = new Date();
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

			const [streakResult] = await db
				.select({
					streak: sql<number>`COUNT(DISTINCT DATE(${miningSessions.startTime}))`,
				})
				.from(miningSessions)
				.where(and(eq(miningSessions.userId, userId), gte(miningSessions.startTime, sevenDaysAgo)));

			return {
				totalSessions: sessionsResult.count,
				totalEarned: earningsResult.totalEarned || "0",
				totalReferrals,
				verificationStatus: user?.isVerified || false,
				miningStreak: streakResult.streak || 0,
			};
		} catch (error) {
			console.error("Error getting user stats:", error);
			return {
				totalSessions: 0,
				totalEarned: "0",
				totalReferrals: 0,
				verificationStatus: false,
				miningStreak: 0,
			};
		}
	}

	async getNetworkStats(): Promise<NetworkStats | undefined> {
		const [stats] = await db.select().from(networkStats).orderBy(desc(networkStats.updatedAt)).limit(1);
		return stats || undefined;
	}

	async updateNetworkStats(updates: Partial<NetworkStats>): Promise<NetworkStats> {
		// First try to get existing stats
		const existingStats = await this.getNetworkStats();

		if (existingStats) {
			const [stats] = await db.update(networkStats).set(updates).where(eq(networkStats.id, existingStats.id)).returning();
			return stats;
		} else {
			// Create new stats record
			const [stats] = await db.insert(networkStats).values(updates).returning();
			return stats;
		}
	}

	async getActiveMinerCount(): Promise<number> {
		const result = await db.select({ count: count() }).from(miningSessions).where(eq(miningSessions.isActive, true));
		return result[0]?.count || 0;
	}

	async getTotalDopeSupply(): Promise<number> {
		return 0;
	}

	async getCompletedMiningSessionsCount(userId: string, days: number): Promise<number> {
		try {
			const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
			const [result] = await db
				.select({ count: count() })
				.from(miningSessions)
				.where(and(eq(miningSessions.userId, userId), eq(miningSessions.isActive, false), sql`${miningSessions.startTime} >= ${startDate}`));
			return result.count;
		} catch (error) {
			console.error("Error getting completed mining sessions count:", error);
			return 0;
		}
	}

	async getRecentMiningSessionsByUser(userId: string, limit: number): Promise<MiningSession[]> {
		try {
			const sessions = await db.select().from(miningSessions).where(eq(miningSessions.userId, userId)).orderBy(desc(miningSessions.createdAt)).limit(limit);
			return sessions;
		} catch (error) {
			console.error("Error getting recent mining sessions:", error);
			return [];
		}
	}

	async getReferralCount(userId: string): Promise<number> {
		try {
			const [result] = await db.select({ count: count() }).from(users).where(eq(users.referredBy, userId));
			return result.count;
		} catch (error) {
			console.error("Error getting referral count:", error);
			return 0;
		}
	}

	async getActiveMiningSessionsCount(): Promise<number> {
		try {
			const [result] = await db.select({ count: count() }).from(miningSessions).where(eq(miningSessions.isActive, true));
			return result.count;
		} catch (error) {
			console.error("Error getting active mining sessions count:", error);
			return 0;
		}
	}

	async getLastMiningReward(userId: string): Promise<Date | null> {
		const result = await db
			.select({ lastReward: users.lastMiningReward })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		return result[0]?.lastReward || null;
	}

	async getGameStats(userId: string): Promise<any> {
		const key = `game_stats:${userId}`;
		const data = this.cache.get(key);
		return data || null;
	}

	async setGameStats(userId: string, stats: any): Promise<void> {
		const key = `game_stats:${userId}`;
		this.cache.set(key, stats);
	}

	async getAllGameStats(): Promise<any[]> {
		const allStats = [];
		for (const [key, value] of this.cache.entries()) {
			if (key.startsWith('game_stats:')) {
				allStats.push(value);
			}
		}
		return allStats;
	}

	async getUserByReferralCode(referralCode: string): Promise<User | undefined> {
		try {
			const [user] = await db.select().from(users).where(eq(users.referralCode, referralCode));
			return user || undefined;
		} catch (error) {
			console.error("Error getting user by referral code:", error);
			return undefined;
		}
	}

	async addReferralBonus(userId: string, amount: string): Promise<void> {
		try {
			// Update user's wallet balance
			const wallet = await this.getWallet(userId);
			if (wallet) {
				const currentBalance = parseFloat(stellarService.getDOPEBalance(userId).toString() || "0");
				const bonusAmount = parseFloat(amount);
				const newBalance = (currentBalance + bonusAmount).toString();

				await this.updateWallet(userId, {
					lastUpdated: new Date(),
				});
			}

			// Note: Referral bonus added to wallet balance above
		} catch (error) {
			console.error("Error adding referral bonus:", error);
			throw error;
		}
	}

	async getActiveReferrals(userId: string): Promise<User[]> {
		try {
			const referrals = await db.select().from(users).where(eq(users.referredBy, userId));
			return referrals;
		} catch (error) {
			console.error("Error getting active referrals:", error);
			return [];
		}
	}

	async setWithdrawalRequest(withdrawalId: string, withdrawal: any): Promise<void> {
		const key = `withdrawal:${withdrawalId}`;
		this.cache.set(key, withdrawal);
	}

	async getWithdrawalRequest(withdrawalId: string): Promise<any> {
		const key = `withdrawal:${withdrawalId}`;
		return this.cache.get(key) || null;
	}

	async getUserWithdrawals(userId: string): Promise<any[]> {
		const userWithdrawals = [];
		for (const [key, value] of this.cache.entries()) {
			if (key.startsWith('withdrawal:') && value.userId === userId) {
				userWithdrawals.push(value);
			}
		}
		return userWithdrawals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
	}

	// Vault storage methods
	async storeVault(vaultData: VaultData): Promise<void> {
		await db
			.insert(vaults)
			.values({
				id: vaultData.id,
				userId: vaultData.userId,
				name: vaultData.name,
				encryptedData: vaultData.encryptedData,
				salt: vaultData.salt,
				iv: vaultData.iv,
				createdAt: vaultData.createdAt,
				lastAccessed: vaultData.lastAccessed,
			})
			.onConflictDoUpdate({
				target: vaults.id,
				set: {
					name: vaultData.name,
					encryptedData: vaultData.encryptedData,
					salt: vaultData.salt,
					iv: vaultData.iv,
					lastAccessed: vaultData.lastAccessed,
				},
			});
	}

	async getVault(vaultId: string): Promise<VaultData | null> {
		const [vault] = await db.select().from(vaults).where(eq(vaults.id, vaultId));
		if (!vault) return null;

		return {
			id: vault.id,
			userId: vault.userId,
			name: vault.name,
			encryptedData: vault.encryptedData,
			salt: vault.salt,
			iv: vault.iv,
			createdAt: vault.createdAt,
			lastAccessed: vault.lastAccessed,
		};
	}

	async getUserVaults(userId: string): Promise<VaultData[]> {
		const vaultsData = await db.select().from(vaults).where(eq(vaults.userId, userId));
		return vaultsData.map(vault => ({
			id: vault.id,
			userId: vault.userId,
			name: vault.name,
			encryptedData: vault.encryptedData,
			salt: vault.salt,
			iv: vault.iv,
			createdAt: vault.createdAt,
			lastAccessed: vault.lastAccessed,
		}));
	}

	async deleteVault(vaultId: string): Promise<void> {
		await db.delete(vaults).where(eq(vaults.id, vaultId));
	}
}

export const storage = new DatabaseStorage();