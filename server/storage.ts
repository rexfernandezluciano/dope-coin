import { 
  users, 
  miningSessions, 
  transactions, 
  wallets, 
  networkStats,
  type User, 
  type InsertUser,
  type MiningSession,
  type InsertMiningSession,
  type Transaction,
  type InsertTransaction,
  type Wallet,
  type InsertWallet,
  type NetworkStats
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sum, count } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
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
  
  // Transaction methods
  createTransaction(insertTransaction: InsertTransaction): Promise<Transaction>;
  getTransactions(userId: string, page: number, limit: number): Promise<Transaction[]>;
  
  // Stats methods
  getUserStats(userId: string): Promise<any>;
  getNetworkStats(): Promise<NetworkStats | undefined>;
  updateNetworkStats(updates: Partial<NetworkStats>): Promise<NetworkStats>;
  getActiveMinerCount(): Promise<number>;
  getTotalDopeSupply(): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Wallet methods
  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return wallet || undefined;
  }

  async createWallet(insertWallet: InsertWallet): Promise<Wallet> {
    const [wallet] = await db
      .insert(wallets)
      .values(insertWallet)
      .returning();
    return wallet;
  }

  async updateWallet(userId: string, updates: Partial<Wallet>): Promise<Wallet> {
    const [wallet] = await db
      .update(wallets)
      .set(updates)
      .where(eq(wallets.userId, userId))
      .returning();
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
    const [session] = await db
      .insert(miningSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async updateMiningSession(id: string, updates: Partial<MiningSession>): Promise<MiningSession> {
    const [session] = await db
      .update(miningSessions)
      .set(updates)
      .where(eq(miningSessions.id, id))
      .returning();
    return session;
  }

  // Transaction methods
  async createTransaction(insertTransaction: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(insertTransaction)
      .returning();
    return transaction;
  }

  async getTransactions(userId: string, page: number, limit: number): Promise<Transaction[]> {
    const offset = (page - 1) * limit;
    return db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  // Stats methods
  async getUserStats(userId: string): Promise<any> {
    // Return basic user stats for now
    const user = await this.getUser(userId);
    return {
      totalSessions: 0,
      totalEarned: "0"
    };
  }

  async getNetworkStats(): Promise<NetworkStats | undefined> {
    const [stats] = await db.select().from(networkStats).orderBy(desc(networkStats.updatedAt)).limit(1);
    return stats || undefined;
  }

  async updateNetworkStats(updates: Partial<NetworkStats>): Promise<NetworkStats> {
    // First try to get existing stats
    const existingStats = await this.getNetworkStats();
    
    if (existingStats) {
      const [stats] = await db
        .update(networkStats)
        .set(updates)
        .where(eq(networkStats.id, existingStats.id))
        .returning();
      return stats;
    } else {
      // Create new stats record
      const [stats] = await db
        .insert(networkStats)
        .values(updates)
        .returning();
      return stats;
    }
  }

  async getActiveMinerCount(): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(miningSessions)
      .where(eq(miningSessions.isActive, true));
    return result[0]?.count || 0;
  }

  async getTotalDopeSupply(): Promise<number> {
    const result = await db
      .select({ total: sum(wallets.dopeBalance) })
      .from(wallets);
    return parseFloat(result[0]?.total?.toString() || "0");
  }
}

export const storage = new DatabaseStorage();