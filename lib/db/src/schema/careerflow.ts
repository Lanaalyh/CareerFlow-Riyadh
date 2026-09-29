import { pgTable, serial, text, integer, jsonb, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const profiles = pgTable("cf_profiles", {
  userId: text("user_id").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opportunities = pgTable("cf_opportunities", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  location: text("location").notNull(),
  description: text("description").notNull(),
  requirements: text("requirements").notNull().default(""),
  skills: text("skills").array().notNull().default([]),
  field: text("field").notNull().default(""),
  deadline: text("deadline"),
  source: text("source").notNull(),
  originalUrl: text("original_url").notNull(),
  applicationMethod: text("application_method").notNull().default("online"),
  status: text("status").notNull().default("Unknown"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
  isTraining: boolean("is_training").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  sourceCount: integer("source_count").notNull().default(1),
});

export const savedOpportunities = pgTable("cf_saved_opportunities", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  opportunityId: integer("opportunity_id").notNull().references(() => opportunities.id),
}, (table) => [uniqueIndex("cf_saved_user_opportunity").on(table.userId, table.opportunityId)]);

export const cvs = pgTable("cf_cvs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  extractedText: text("extracted_text").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploadGrants = pgTable("cf_upload_grants", {
  objectPath: text("object_path").primaryKey(),
  userId: text("user_id").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  consumed: boolean("consumed").notNull().default(false),
});

export const coverTemplates = pgTable("cf_cover_templates", {
  userId: text("user_id").primaryKey(),
  text: text("text").notNull().default(""),
});

export const applications = pgTable("cf_applications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  opportunityId: integer("opportunity_id").notNull().references(() => opportunities.id),
  status: text("status").notNull().default("draft"),
  cvId: integer("cv_id"),
  coverLetter: text("cover_letter").notNull().default(""),
  answers: jsonb("answers").$type<Record<string, unknown>[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});