import { PrismaClient } from "@prisma/client";

export { MessageCategory } from "@prisma/client";
export type { DeckColumn, DeckMessage, User, WhatsAppGroup } from "@prisma/client";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
