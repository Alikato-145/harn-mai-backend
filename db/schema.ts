// src/db/schema.ts
import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── ตารางพื้นฐาน ──

export const rooms = sqliteTable("rooms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").unique().notNull(),
  name: text("name").notNull(),
  hostToken: text("host_token").notNull(),
  hostUserId: integer("host_user_id").notNull(),
  status: text("status", { enum: ["open", "locked", "finished"] })
    .notNull()
    .default("open"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  joinedAt: text("joined_at").default(sql`CURRENT_TIMESTAMP`),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  note: text("note"),
  claimedBy: integer("claimed_by").references(() => users.id, {
    onDelete: "set null",
  }),
  price: real("price").notNull(),
  splitMode: text("split_mode", { enum: ["all", "group"] })
    .notNull()
    .default("all"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const groupsInRoom = sqliteTable("groups_in_room", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomId: integer("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const memberInGroup = sqliteTable("member_in_group", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsInRoom.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const itemsMapWithGroup = sqliteTable("items_map_with_group", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsInRoom.id, { onDelete: "cascade" }),
  itemId: integer("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});
