import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, decimal, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  profilePicture: text("profile_picture"),
  stellarPublicKey: text("stellar_public_key"),
  stellarSecretKey: text("stellar_secret_key"),
  isVerified: boolean("is_verified").default(false),
  level: integer("level").default(1),
  referralCode: text("referral_code").unique(),
  referredBy: varchar("referred_by"),
  createdAt: timestamp("created_at").default(sql`now()`),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

export const miningSessions = pgTable("mining_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time"),
  rate: decimal("rate", { precision: 10, scale: 8 }).notNull(),
  totalEarned: decimal("total_earned", { precision: 10, scale: 8 }).default("0"),
  isActive: boolean("is_active").default(true),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'mining_reward', 'send', 'receive', 'referral_bonus'
  amount: decimal("amount", { precision: 10, scale: 8 }).notNull(),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  stellarTxId: text("stellar_tx_id"),
  status: text("status").default("pending"), // 'pending', 'completed', 'failed'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  dopeBalance: decimal("dope_balance", { precision: 10, scale: 8 }).default("0"),
  xlmBalance: decimal("xlm_balance", { precision: 10, scale: 8 }).default("0"),
  lastUpdated: timestamp("last_updated").default(sql`now()`),
});

export const networkStats = pgTable("network_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activeMiners: integer("active_miners").default(0),
  totalSupply: decimal("total_supply", { precision: 15, scale: 8 }).default("0"),
  lastBlockTime: timestamp("last_block_time"),
  updatedAt: timestamp("updated_at").default(sql`now()`),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  mininingSessions: many(miningSessions),
  transactions: many(transactions),
  wallet: one(wallets, {
    fields: [users.id],
    references: [wallets.userId],
  }),
  referrer: one(users, {
    fields: [users.referredBy],
    references: [users.id],
  }),
}));

export const miningSessionsRelations = relations(miningSessions, ({ one }) => ({
  user: one(users, {
    fields: [miningSessions.userId],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMiningSessionSchema = createInsertSchema(miningSessions).omit({
  id: true,
  createdAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export const insertWalletSchema = createInsertSchema(wallets).omit({
  id: true,
});

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = insertUserSchema.pick({
  username: true,
  email: true,
  password: true,
  fullName: true,
}).extend({
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type MiningSession = typeof miningSessions.$inferSelect;
export type InsertMiningSession = z.infer<typeof insertMiningSessionSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type NetworkStats = typeof networkStats.$inferSelect;
export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
