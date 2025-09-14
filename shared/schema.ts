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
  rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
  totalEarned: decimal("total_earned", { precision: 18, scale: 8 }).default("0"),
  isActive: boolean("is_active").default(true),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(), // 'mining_reward', 'send', 'receive', 'referral_bonus'
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  assetType: text("asset_type").notNull(),
  stellarTxId: text("stellar_tx_id"),
  status: text("status").default("pending"), // 'pending', 'completed', 'failed'
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  dopeBalance: decimal("dope_balance", { precision: 18, scale: 8 }).default("0"),
  xlmBalance: decimal("xlm_balance", { precision: 18, scale: 8 }).default("0"),
  lastUpdated: timestamp("last_updated").default(sql`now()`),
});

export const networkStats = pgTable("network_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  activeMiners: integer("active_miners").default(0),
  totalSupply: decimal("total_supply", { precision: 15, scale: 8 }).default("0"),
  miningRate: decimal("mining_rate", { precision: 18, scale: 8 }).default("0.05"),
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
  referralCode: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Trading and Liquidity schemas
export const assetSchema = z.object({
  type: z.literal("native").optional(),
  code: z.string().optional(),
  issuer: z.string().optional(),
}).refine((data) => data.type === "native" || (data.code && data.issuer), {
  message: "Asset must be native or have both code and issuer",
});

export const executeTradeSchema = z.object({
  sellAsset: assetSchema,
  sellAmount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  buyAsset: assetSchema,
  minBuyAmount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
});

export const addLiquiditySchema = z.object({
  assetA: assetSchema,
  assetB: assetSchema,
  amountA: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  amountB: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  minPrice: z.string().regex(/^\d+(\.\d+)?$/, "Invalid price format"),
  maxPrice: z.string().regex(/^\d+(\.\d+)?$/, "Invalid price format"),
});

export const removeLiquiditySchema = z.object({
  poolId: z.string().min(1, "Pool ID is required"),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  minAmountA: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  minAmountB: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
});

export const orderbookQuerySchema = z.object({
  sellAssetCode: z.string().min(1, "Sell asset code is required"),
  sellAssetIssuer: z.string().optional(),
  buyAssetCode: z.string().min(1, "Buy asset code is required"),
  buyAssetIssuer: z.string().optional(),
});

// Profile update schemas
export const updateProfileSchema = z.object({
  fullName: z.string().min(1, "Full name is required").max(100),
  profilePicture: z.string().optional(), // Base64 encoded image
});

export const updateUsernameSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(30).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

// Email verification schemas
export const sendVerificationEmailSchema = z.object({
  email: z.string().email("Valid email is required"),
});

export const verifyEmailSchema = z.object({
  email: z.string().email("Valid email is required"),
  code: z.string().length(6, "Verification code must be 6 digits").regex(/^\d{6}$/, "Verification code must be numeric"),
});

// Multi-step registration schemas
export const registerStep1Schema = z.object({
  email: z.string().email("Valid email is required"),
  username: z.string().min(3, "Username must be at least 3 characters").max(30).regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
});

export const registerStep2Schema = z.object({
  fullName: z.string().min(1, "Full name is required").max(100),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password confirmation is required"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const registerStep3Schema = z.object({
  referralCode: z.string().optional(),
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
export type ExecuteTradeRequest = z.infer<typeof executeTradeSchema>;
export type AddLiquidityRequest = z.infer<typeof addLiquiditySchema>;
export type RemoveLiquidityRequest = z.infer<typeof removeLiquiditySchema>;
export type OrderbookQuery = z.infer<typeof orderbookQuerySchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type UpdateUsernameRequest = z.infer<typeof updateUsernameSchema>;
export type SendVerificationEmailRequest = z.infer<typeof sendVerificationEmailSchema>;
export type VerifyEmailRequest = z.infer<typeof verifyEmailSchema>;
export type RegisterStep1Request = z.infer<typeof registerStep1Schema>;
export type RegisterStep2Request = z.infer<typeof registerStep2Schema>;
export type RegisterStep3Request = z.infer<typeof registerStep3Schema>;
