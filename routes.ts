import { z } from "zod";

/**
 * routes.ts'in "@shared/routes" olarak import ettiği API sözleşmesi.
 * Yol ve girdi şemaları kullanım yerlerinden birebir türetildi.
 */
export const api = {
  confessions: {
    create: {
      path: "/api/confessions",
      method: "POST" as const,
      input: z.object({
        content: z.string().min(1, "İtiraf boş olamaz").max(2000),
        judgmentLevel: z.coerce.number().int().min(1).max(3),
      }),
    },
    list: {
      path: "/api/confessions",
      method: "GET" as const,
    },
  },
  chatSessions: {
    create: {
      path: "/api/chat/sessions",
      method: "POST" as const,
      input: z.object({
        judgmentLevel: z.coerce.number().int().min(1).max(3),
        userId: z.string().optional(),
      }),
    },
  },
  chatMessages: {
    send: {
      path: "/api/chat/sessions/:sessionId/messages",
      method: "POST" as const,
      input: z.object({
        content: z.string().min(1).max(4000),
      }),
    },
  },
} as const;
