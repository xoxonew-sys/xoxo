import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/* ============================================================
   XOXO Gossip AI — Veritabanı Şeması
   routes.ts (3858 satır) analizinden yeniden türetildi.
   ============================================================ */

/* ---------- users ---------- */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name"),
    gender: text("gender").notNull().default("female"), // "male" | "female"

    avatarUrl: text("avatar_url"),
    avatarPreset: text("avatar_preset"),

    credits: integer("credits").notNull().default(0), // X-Kredi bakiyesi
    isPremium: boolean("is_premium").notNull().default(false),
    isGodMode: boolean("is_god_mode").notNull().default(false),
    isAdmin: boolean("is_admin").notNull().default(false),

    emailVerified: boolean("email_verified").notNull().default(false),
    otpCode: text("otp_code"),
    otpExpiry: timestamp("otp_expiry"),

    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    rememberToken: text("remember_token"),

    lastLogin: timestamp("last_login"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
    usernameIdx: index("users_username_idx").on(t.username),
  }),
);

/* ---------- confessions (legacy itiraf akışı) ---------- */
export const confessions = pgTable("confessions", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  judgmentLevel: integer("judgment_level").notNull(), // 1=Angel 2=Bestie 3=Snake
  response: text("response").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ---------- chatSessions ---------- */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull().default("anonymous"),
    judgmentLevel: integer("judgment_level").notNull(),
    subLevel: integer("sub_level").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("chat_sessions_user_idx").on(t.userId),
  }),
);

/* ---------- chatMessages ---------- */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "user" | "assistant"
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index("chat_messages_session_idx").on(t.sessionId),
  }),
);

/* ---------- payments ---------- */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    stripeSessionId: text("stripe_session_id").notNull().unique(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    amount: integer("amount").notNull(), // cent cinsinden
    currency: text("currency").notNull().default("usd"),
    productType: text("product_type").notNull(), // "credits" | "subscription"
    creditsAmount: integer("credits_amount"),
    status: text("status").notNull().default("pending"), // pending|completed|failed
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("payments_user_idx").on(t.userId),
    sessionIdx: index("payments_session_idx").on(t.stripeSessionId),
  }),
);

/* ---------- rooms (X-Room) ---------- */
export const rooms = pgTable(
  "rooms",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    adminId: text("admin_id").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(15),
    aiMode: integer("ai_mode").default(2), // 0=kapalı 1=sessiz 2=aktif
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    codeIdx: index("rooms_code_idx").on(t.code),
  }),
);

/* ---------- roomMembers ---------- */
export const roomMembers = pgTable(
  "room_members",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    nickname: text("nickname").notNull(),
    avatarUrl: text("avatar_url"),
    isAdmin: boolean("is_admin").notNull().default(false),
    isPro: boolean("is_pro").notNull().default(false),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index("room_members_room_idx").on(t.roomId),
  }),
);

/* ---------- roomMessages ---------- */
export const roomMessages = pgTable(
  "room_messages",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(), // "ai" olabilir
    nickname: text("nickname").notNull(),
    content: text("content").notNull(),
    messageType: text("message_type").notNull().default("text"), // text|ai|voice|image|system
    mediaUrl: text("media_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    roomIdx: index("room_messages_room_idx").on(t.roomId),
  }),
);

/* ---------- adminSettings ---------- */
export const adminSettings = pgTable("admin_settings", {
  id: serial("id").primaryKey(),
  settingKey: text("setting_key").notNull().unique(),
  settingValue: text("setting_value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ---------- userBans ---------- */
export const userBans = pgTable("user_bans", {
  id: serial("id").primaryKey(),
  email: text("email"),
  ipAddress: text("ip_address"),
  banType: text("ban_type").notNull(), // "email" | "ip" | "both"
  reason: text("reason"),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  bannedBy: text("banned_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ---------- globalNotifications ---------- */
export const globalNotifications = pgTable("global_notifications", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull().default("info"), // info|warning|success|error
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ---------- usageAnalytics ---------- */
export const usageAnalytics = pgTable("usage_analytics", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  userEmail: text("user_email"),
  mode: text("mode").notNull(), // "chat" | "voice" | "xroom"
  messageCount: integer("message_count").notNull().default(0),
  voiceCount: integer("voice_count").notNull().default(0),
  creditsSpent: integer("credits_spent").notNull().default(0),
  sessionDuration: integer("session_duration").notNull().default(0), // saniye
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ---------- apiCostTracking ---------- */
export const apiCostTracking = pgTable("api_cost_tracking", {
  id: serial("id").primaryKey(),
  service: text("service").notNull(), // anthropic|openai|gemini|elevenlabs
  tokensUsed: integer("tokens_used").default(0),
  charactersUsed: integer("characters_used").default(0),
  userId: text("user_id"),
  endpoint: text("endpoint"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/* ---------- emailLogs ---------- */
export const emailLogs = pgTable(
  "email_logs",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    type: text("type").notNull(), // "verification" | "password_reset"
    success: boolean("success").notNull().default(false),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("email_logs_email_idx").on(t.email),
  }),
);

/* ============================================================
   Zod doğrulama şemaları — routes.ts'in beklediği isimlerle
   ============================================================ */

export const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Kullanıcı adı en az 3 karakter olmalı")
    .max(20, "Kullanıcı adı en fazla 20 karakter olabilir")
    .regex(/^[a-zA-Z0-9_]+$/, "Sadece harf, rakam ve alt çizgi kullanılabilir"),
  email: z.string().email("Geçerli bir e-posta adresi girin"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalı"),
  displayName: z.string().max(30).optional(),
  gender: z.enum(["male", "female"]).default("female"),
  avatarUrl: z.string().nullable().optional(),
  avatarPreset: z.string().nullable().optional(),
});

export const loginSchema = z.object({
  // Kullanıcı adı VEYA e-posta kabul edilir
  identifier: z.string().min(1, "Kullanıcı adı veya e-posta gerekli"),
  password: z.string().min(1, "Şifre gerekli"),
  rememberMe: z.boolean().optional().default(false),
});

export const verifyOtpSchema = z.object({
  email: z.string().email(),
  otpCode: z.string().length(6, "Doğrulama kodu 6 haneli olmalı"),
});

export const resendOtpSchema = z.object({
  email: z.string().email(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Geçerli bir e-posta adresi girin"),
});

export const passwordResetSchema = z.object({
  email: z.string().email(),
  otpCode: z.string().length(6),
  newPassword: z.string().min(6, "Şifre en az 6 karakter olmalı"),
});

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/* ---------- insert şemaları ---------- */
export const insertUserSchema = createInsertSchema(users);
export const insertConfessionSchema = createInsertSchema(confessions);
export const insertChatSessionSchema = createInsertSchema(chatSessions);
export const insertChatMessageSchema = createInsertSchema(chatMessages);
export const insertPaymentSchema = createInsertSchema(payments);
export const insertRoomSchema = createInsertSchema(rooms);
export const insertRoomMemberSchema = createInsertSchema(roomMembers);
export const insertRoomMessageSchema = createInsertSchema(roomMessages);

/* ---------- tipler ---------- */
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Confession = typeof confessions.$inferSelect;
export type InsertConfession = typeof confessions.$inferInsert;
export type ChatSession = typeof chatSessions.$inferSelect;
export type InsertChatSession = typeof chatSessions.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type InsertRoom = typeof rooms.$inferInsert;
export type RoomMember = typeof roomMembers.$inferSelect;
export type InsertRoomMember = typeof roomMembers.$inferInsert;
export type RoomMessage = typeof roomMessages.$inferSelect;
export type InsertRoomMessage = typeof roomMessages.$inferInsert;
export type AdminSetting = typeof adminSettings.$inferSelect;
export type UserBan = typeof userBans.$inferSelect;
export type GlobalNotification = typeof globalNotifications.$inferSelect;
export type EmailLog = typeof emailLogs.$inferSelect;
