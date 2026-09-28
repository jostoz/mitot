import { z } from "zod";

export const messageCategories = ["INCIDENT", "TASK", "DECISION", "KNOWLEDGE", "GENERAL_CHAT", "NOISE"] as const;
export const MessageCategorySchema = z.enum(messageCategories);

export const mediaKinds = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER"] as const;
export const MediaKindSchema = z.enum(mediaKinds);
export type MediaKind = z.infer<typeof MediaKindSchema>;
export const IngestedMediaSchema = z.object({
  kind: MediaKindSchema,
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});
export type IngestedMedia = z.infer<typeof IngestedMediaSchema>;

export const IngestedMessageSchema = z.object({
  id: z.string().min(1),
  groupId: z.string().endsWith("@g.us"),
  groupName: z.string().min(1),
  senderJid: z.string().min(1),
  senderName: z.string().min(1),
  content: z.string().min(1),
  parentMessageId: z.string().optional(),
  timestamp: z.string().datetime(),
  isOutbound: z.boolean().default(false),
  media: IngestedMediaSchema.optional(),
});
export type IngestedMessage = z.infer<typeof IngestedMessageSchema>;

export const ClassificationSchema = z.object({
  category: MessageCategorySchema,
  title: z.string().max(120).catch("").transform((value) => (value.trim().length ? value : "Untitled")),
  topic: z.string().max(80).catch("").transform((value) => (value.trim().length ? value : "General")),
  summary: z.string().max(500).catch(""),
  links: z.array(z.string().url()).max(20).nullable().catch([]).transform((value) => value ?? []),
  assignedTo: z.array(z.string()).max(20).nullable().catch([]).transform((value) => value ?? []),
  isTask: z.boolean().nullable().catch(false).transform((value) => value ?? false),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const DeckEventSchema = z.object({
  type: z.literal("message.created"),
  message: z.object({
    id: z.string(), groupId: z.string(), columnId: z.string().nullable(), senderName: z.string(),
    content: z.string(), category: MessageCategorySchema, parentMessageId: z.string().nullable(),
    metadata: z.unknown().nullable(), timestamp: z.string(), isOutbound: z.boolean(),
  }),
});
export type DeckEvent = z.infer<typeof DeckEventSchema>;
