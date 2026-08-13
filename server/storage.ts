import { db } from "./db";
import {
  users,
  confessions,
  chatSessions,
  chatMessages,
  payments,
  rooms,
  roomMembers,
  roomMessages,
  adminSettings,
  emailLogs,
  type User,
  type InsertUser,
  type InsertConfession,
  type InsertChatSession,
  type InsertChatMessage,
  type InsertPayment,
  type InsertRoom,
  type InsertRoomMember,
  type InsertRoomMessage,
} from "@shared/schema";
import { eq, and, gt, lt, desc, asc, sql, inArray } from "drizzle-orm";

/* ============================================================
   XOXO Gossip AI — Storage katmanı
   routes.ts'in çağırdığı 55 metodun tamamı.
   ============================================================ */

/* X-Room kredi maliyet tablosu (dakika → kredi) */
const ROOM_COST_TABLE: Record<number, number> = {
  5: 10,
  15: 25,
  30: 45,
  60: 80,
};

export const storage = {
  /* ---------------- Kullanıcılar ---------------- */

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  },

  async getUserById(id: number | string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(id)))
      .limit(1);
    return user;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`)
      .limit(1);
    return user;
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = lower(${username})`)
      .limit(1);
    return user;
  },

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  },

  async updateUserOTP(
    userId: number | string,
    otpCode: string,
    otpExpiry: Date,
  ): Promise<void> {
    await db
      .update(users)
      .set({ otpCode, otpExpiry })
      .where(eq(users.id, Number(userId)));
  },

  async clearUserOTP(userId: number | string): Promise<void> {
    await db
      .update(users)
      .set({ otpCode: null, otpExpiry: null })
      .where(eq(users.id, Number(userId)));
  },

  async verifyUserEmail(userId: number | string): Promise<void> {
    await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.id, Number(userId)));
  },

  async updateUserPassword(
    userId: number | string,
    passwordHash: string,
  ): Promise<void> {
    await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.id, Number(userId)));
  },

  async updateUserLastLogin(userId: number | string): Promise<void> {
    await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, Number(userId)));
  },

  async updateUserRememberToken(
    userId: number | string,
    token: string | null,
  ): Promise<void> {
    await db
      .update(users)
      .set({ rememberToken: token })
      .where(eq(users.id, Number(userId)));
  },

  async updateUserAvatar(
    userId: number | string,
    avatarUrl: string | null,
    avatarPreset?: string | null,
  ): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ avatarUrl, ...(avatarPreset !== undefined ? { avatarPreset } : {}) })
      .where(eq(users.id, Number(userId)))
      .returning();
    return user;
  },

  async updateUserGender(
    userId: number | string,
    gender: string,
  ): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ gender })
      .where(eq(users.id, Number(userId)))
      .returning();
    return user;
  },

  async updateUserDisplayName(
    userId: number | string,
    displayName: string,
  ): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ displayName })
      .where(eq(users.id, Number(userId)))
      .returning();
    return user;
  },

  async updateUserStripeCustomerId(
    userId: number | string,
    stripeCustomerId: string,
  ): Promise<void> {
    await db
      .update(users)
      .set({ stripeCustomerId })
      .where(eq(users.id, Number(userId)));
  },

  async updateUserPremiumStatus(
    userId: number | string,
    isPremium: boolean,
    stripeSubscriptionId?: string,
  ): Promise<void> {
    await db
      .update(users)
      .set({
        isPremium,
        ...(stripeSubscriptionId ? { stripeSubscriptionId } : {}),
      })
      .where(eq(users.id, Number(userId)));
  },

  /** Admin panelinden serbest alan güncelleme */
  async updateUserAdmin(
    userId: number | string,
    updates: Partial<User>,
  ): Promise<User> {
    const allowed: (keyof User)[] = [
      "credits",
      "isPremium",
      "isGodMode",
      "isAdmin",
      "emailVerified",
      "displayName",
      "gender",
    ];
    const safe: Record<string, unknown> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safe[key as string] = updates[key];
    }
    const [user] = await db
      .update(users)
      .set(safe)
      .where(eq(users.id, Number(userId)))
      .returning();
    return user;
  },

  async deleteUserAccount(userId: number | string): Promise<void> {
    const id = Number(userId);
    const uid = String(userId);
    // Bağlı kayıtları temizle
    const sessions = await db
      .select({ id: chatSessions.id })
      .from(chatSessions)
      .where(eq(chatSessions.userId, uid));
    if (sessions.length > 0) {
      await db.delete(chatMessages).where(
        inArray(
          chatMessages.sessionId,
          sessions.map((s) => s.id),
        ),
      );
      await db.delete(chatSessions).where(eq(chatSessions.userId, uid));
    }
    await db.delete(users).where(eq(users.id, id));
  },

  /* ---------------- Krediler ---------------- */

  getRoomCreditCost(duration: number): number {
    if (ROOM_COST_TABLE[duration] !== undefined) return ROOM_COST_TABLE[duration];
    // Tabloda yoksa dakika başına 2 kredi
    return Math.max(10, Math.ceil(duration * 2));
  },

  async getVoiceCredits(
    userId: number | string,
  ): Promise<{ credits: number; isPremium: boolean; isGodMode: boolean }> {
    const user = await this.getUserById(userId);
    return {
      credits: user?.credits ?? 0,
      isPremium: user?.isPremium ?? false,
      isGodMode: user?.isGodMode ?? false,
    };
  },

  /** Atomik kredi düşme — negatife düşmez */
  async useXCredits(
    userId: number | string,
    amount: number,
  ): Promise<{ success: boolean; remaining: number }> {
    const id = Number(userId);
    const [updated] = await db
      .update(users)
      .set({ credits: sql`${users.credits} - ${amount}` })
      .where(and(eq(users.id, id), sql`${users.credits} >= ${amount}`))
      .returning({ credits: users.credits });

    if (!updated) {
      const user = await this.getUserById(id);
      return { success: false, remaining: user?.credits ?? 0 };
    }
    return { success: true, remaining: updated.credits };
  },

  async addXCredits(
    userId: number | string,
    amount: number,
  ): Promise<{ success: boolean; newBalance: number }> {
    const [updated] = await db
      .update(users)
      .set({ credits: sql`${users.credits} + ${amount}` })
      .where(eq(users.id, Number(userId)))
      .returning({ credits: users.credits });
    return { success: !!updated, newBalance: updated?.credits ?? 0 };
  },

  async getCreditStatistics(): Promise<{
    totalCredits: number;
    activeCredits: number;
    totalUsed: number;
    creditUsageRate: number;
  }> {
    const [purchased] = await db
      .select({ total: sql<number>`coalesce(sum(${payments.creditsAmount}), 0)` })
      .from(payments)
      .where(
        and(eq(payments.productType, "credits"), eq(payments.status, "completed")),
      );

    const [active] = await db
      .select({ total: sql<number>`coalesce(sum(${users.credits}), 0)` })
      .from(users);

    const totalCredits = Number(purchased?.total ?? 0);
    const activeCredits = Number(active?.total ?? 0);
    const totalUsed = Math.max(0, totalCredits - activeCredits);

    return {
      totalCredits,
      activeCredits,
      totalUsed,
      creditUsageRate: totalCredits > 0 ? (totalUsed / totalCredits) * 100 : 0,
    };
  },

  /* ---------------- Ödemeler ---------------- */

  async recordPayment(data: InsertPayment) {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  },

  async getPaymentBySessionId(stripeSessionId: string) {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.stripeSessionId, stripeSessionId))
      .limit(1);
    return payment;
  },

  async getPaymentsByUserId(userId: number | string) {
    return db
      .select()
      .from(payments)
      .where(eq(payments.userId, String(userId)))
      .orderBy(desc(payments.createdAt));
  },

  async getAllPayments() {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  },

  async getRevenueStats(): Promise<{
    totalRevenue: number;
    pendingPayments: number;
    failedPayments: number;
    completedCount: number;
  }> {
    const [completed] = await db
      .select({
        total: sql<number>`coalesce(sum(${payments.amount}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(payments)
      .where(eq(payments.status, "completed"));

    const [pending] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.status, "pending"));

    const [failed] = await db
      .select({ count: sql<number>`count(*)` })
      .from(payments)
      .where(eq(payments.status, "failed"));

    return {
      totalRevenue: Number(completed?.total ?? 0),
      completedCount: Number(completed?.count ?? 0),
      pendingPayments: Number(pending?.count ?? 0),
      failedPayments: Number(failed?.count ?? 0),
    };
  },

  async getTopUsersByPurchases(limit = 10) {
    return db
      .select({
        userId: payments.userId,
        totalSpent: sql<number>`sum(${payments.amount})`,
        purchaseCount: sql<number>`count(*)`,
      })
      .from(payments)
      .where(eq(payments.status, "completed"))
      .groupBy(payments.userId)
      .orderBy(sql`sum(${payments.amount}) DESC`)
      .limit(limit);
  },

  /* ---------------- İtiraflar ---------------- */

  async createConfession(data: InsertConfession) {
    const [confession] = await db.insert(confessions).values(data).returning();
    return confession;
  },

  async getConfessions(limit = 50) {
    return db
      .select()
      .from(confessions)
      .orderBy(desc(confessions.createdAt))
      .limit(limit);
  },

  /* ---------------- Sohbet ---------------- */

  async createChatSession(data: InsertChatSession) {
    const [session] = await db.insert(chatSessions).values(data).returning();
    return session;
  },

  async getChatSession(id: number) {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, id))
      .limit(1);
    return session;
  },

  async createChatMessage(data: InsertChatMessage) {
    const [message] = await db.insert(chatMessages).values(data).returning();
    return message;
  },

  async getChatMessages(sessionId: number) {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));
  },

  /** Bellek bağlamı için: kullanıcının son oturumları + mesajları */
  async getUserChatHistory(userId: string, limit = 5) {
    const sessions = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.createdAt))
      .limit(limit);

    return Promise.all(
      sessions.map(async (session) => ({
        session,
        messages: await this.getChatMessages(session.id),
      })),
    );
  },

  /** Admin listesi için: kullanıcının son konuştuğu karakter */
  async getLastCharacterByUser(userId: string): Promise<number | null> {
    const [session] = await db
      .select({ judgmentLevel: chatSessions.judgmentLevel })
      .from(chatSessions)
      .where(eq(chatSessions.userId, userId))
      .orderBy(desc(chatSessions.createdAt))
      .limit(1);
    return session?.judgmentLevel ?? null;
  },

  /* ---------------- X-Room ---------------- */

  async createRoom(data: InsertRoom) {
    const [room] = await db.insert(rooms).values(data).returning();
    return room;
  },

  async getRoomByCode(code: string) {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.code, code.toUpperCase()))
      .limit(1);
    return room;
  },

  async getActiveRooms() {
    return db
      .select()
      .from(rooms)
      .where(gt(rooms.expiresAt, new Date()))
      .orderBy(desc(rooms.createdAt));
  },

  async getExpiredRooms() {
    return db.select().from(rooms).where(lt(rooms.expiresAt, new Date()));
  },

  async updateRoomAiMode(roomId: number, aiMode: number) {
    const [room] = await db
      .update(rooms)
      .set({ aiMode })
      .where(eq(rooms.id, roomId))
      .returning();
    return room;
  },

  async deleteRoom(roomId: number) {
    await db.delete(roomMessages).where(eq(roomMessages.roomId, roomId));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
    await db.delete(rooms).where(eq(rooms.id, roomId));
  },

  async deleteRoomMessages(roomId: number) {
    await db.delete(roomMessages).where(eq(roomMessages.roomId, roomId));
  },

  /** Süresi dolan odanın medya kayıtlarını temizler */
  async deleteRoomMedia(roomId: number) {
    await db
      .update(roomMessages)
      .set({ mediaUrl: null })
      .where(eq(roomMessages.roomId, roomId));
  },

  async addRoomMember(data: InsertRoomMember) {
    const [member] = await db.insert(roomMembers).values(data).returning();
    return member;
  },

  async getRoomMember(roomId: number, memberId: string) {
    const [member] = await db
      .select()
      .from(roomMembers)
      .where(
        and(eq(roomMembers.roomId, roomId), eq(roomMembers.memberId, memberId)),
      )
      .limit(1);
    return member;
  },

  async getRoomMembers(roomId: number) {
    return db
      .select()
      .from(roomMembers)
      .where(eq(roomMembers.roomId, roomId))
      .orderBy(asc(roomMembers.joinedAt));
  },

  async createRoomMessage(data: InsertRoomMessage) {
    const [message] = await db.insert(roomMessages).values(data).returning();
    return message;
  },

  async getRoomMessages(roomId: number, limit = 200) {
    return db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.roomId, roomId))
      .orderBy(asc(roomMessages.createdAt))
      .limit(limit);
  },

  async getRoomMessagesAfter(roomId: number, afterId: number) {
    return db
      .select()
      .from(roomMessages)
      .where(
        and(eq(roomMessages.roomId, roomId), gt(roomMessages.id, afterId)),
      )
      .orderBy(asc(roomMessages.createdAt));
  },

  /** AI bağlamı için son N mesaj */
  async getLastRoomMessages(roomId: number, limit = 10) {
    const rows = await db
      .select()
      .from(roomMessages)
      .where(eq(roomMessages.roomId, roomId))
      .orderBy(desc(roomMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  },

  /* ---------------- Admin ayarları ---------------- */

  async getAllAdminSettings() {
    return db.select().from(adminSettings);
  },

  async setAdminSetting(settingKey: string, settingValue: string) {
    const [setting] = await db
      .insert(adminSettings)
      .values({ settingKey, settingValue })
      .onConflictDoUpdate({
        target: adminSettings.settingKey,
        set: { settingValue, updatedAt: new Date() },
      })
      .returning();
    return setting;
  },

  /* ---------------- E-posta logları ---------------- */

  async getLatestEmailLogByEmail(email: string) {
    const [log] = await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.email, email))
      .orderBy(desc(emailLogs.createdAt))
      .limit(1);
    return log;
  },

  async logEmail(
    email: string,
    type: string,
    success: boolean,
    errorMessage?: string,
  ) {
    await db
      .insert(emailLogs)
      .values({ email, type, success, errorMessage: errorMessage ?? null });
  },
};

export type Storage = typeof storage;
