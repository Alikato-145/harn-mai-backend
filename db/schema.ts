// src/db/schema.ts
import { sqliteTable, text, real, uniqueIndex,integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

import { randomUUID } from "node:crypto";

// ── ตารางพื้นฐาน ──

export const rooms = sqliteTable("rooms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  code: text("code").unique().notNull(),
  name: text("name").notNull(),
  hostUserId: text("host_user_id").notNull(),
  status: text("status", { enum: ["open", "locked", "finished"] })
    .notNull()
    .default("open"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"), // เบอร์ PromptPay (payee) — nullable, set ตอน claim, ใช้ตอน settlement
  joinedAt: text("joined_at").default(sql`CURRENT_TIMESTAMP`),
});

export const items = sqliteTable("items", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  note: text("note"),
  claimedBy: text("claimed_by").references(() => users.id, {
    onDelete: "set null",
  }),

  price: real("price"),
  splitMode: text("split_mode", { enum: ["all", "group"] })
    .notNull()
    .default("all"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const groupsInRoom = sqliteTable("groups_in_room", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name"),
  isCreatedByItem: integer("is_created_by_item", { mode: "boolean" }).default(false),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const memberInGroup = sqliteTable(
  "member_in_group",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groupsInRoom.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // กันสมาชิกซ้ำในกลุ่มเดียวกัน + ทำให้ onConflictDoNothing ทำงาน
    memberUniq: uniqueIndex("member_group_user_uniq").on(
      table.groupId,
      table.userId,
    ),
  }),
);

export const itemsMapWithGroup = sqliteTable(
  "items_map_with_group",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groupsInRoom.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    // กันผูก item เข้ากลุ่มเดิมซ้ำ (ใช้ตอน claim splitMode="group")
    itemGroupUniq: uniqueIndex("item_group_uniq").on(
      table.groupId,
      table.itemId,
    ),
  }),
);
