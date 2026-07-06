import { Elysia, t } from "elysia";
import { db } from "../db/index";
import {
  rooms,
  items,
  users,
  itemsMapWithGroup,
  groupsInRoom,
} from "../db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

export const itemRoutes = new Elysia()
  .post(
    "/rooms/:code/items",
    async ({ params: { code }, body: { name, note }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const itemsId = randomUUID();
      const [newItem] = await db
        .insert(items)
        .values({
          id: itemsId,
          roomId: room.id,
          name,
          note,
        })
        .returning();
      return newItem;
    },
    {
      body: t.Object({
        name: t.String(),
        note: t.Optional(t.String()),
      }),
      detail: {
        summary: "สร้าง item เปล่า",
        description:
          "สร้างรายการของในห้อง (แค่ชื่อ + note?) — price/claimedBy ยังเป็น null, splitMode = 'all' รอไปใส่ตอน claim",
        tags: ["Items"],
      },
    },
  )
  .post(
    "/rooms/:code/items/:itemId/claim",
    async ({
      params: { code, itemId },
      body: { price, claimedBy, splitMode, groupIds },
      set,
    }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const [item] = await db.select().from(items).where(eq(items.id, itemId));
      if (!item) {
        set.status = 404;
        return { error: "ไม่พบ item" };
      }
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, claimedBy), eq(users.roomId, room.id)));
      if (!user) {
        set.status = 404;
        return { error: "ไม่พบผู้ใช้ในห้องนี้" };
      }

      // validate groupIds เฉพาะ mode group
      let uniqueGroupIds: string[] = [];
      if (splitMode === "group") {
        if (!groupIds || groupIds.length === 0) {
          set.status = 400;
          return { error: "splitMode=group ต้องระบุ groupIds" };
        }
        uniqueGroupIds = [...new Set(groupIds)];
        const roomGroups = await db
          .select()
          .from(groupsInRoom)
          .where(eq(groupsInRoom.roomId, room.id));
        const validGroupIds = new Set(roomGroups.map((g) => g.id));
        if (!uniqueGroupIds.every((id) => validGroupIds.has(id))) {
          set.status = 400;
          return { error: "มี groupId ที่ไม่อยู่ในห้องนี้" };
        }
      }
      const [updatedItem] = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(items)
          .set({ price, claimedBy, splitMode })
          .where(eq(items.id, itemId))
          .returning();

        await tx
          .delete(itemsMapWithGroup)
          .where(eq(itemsMapWithGroup.itemId, itemId));

        if (splitMode === "group") {
          await tx
            .insert(itemsMapWithGroup)
            .values(uniqueGroupIds.map((gid) => ({ groupId: gid, itemId })))
            .onConflictDoNothing();
        }
        return [updated];
      });
      return updatedItem;
    },
    {
      body: t.Object({
        price: t.Number(),
        claimedBy: t.String(),
        splitMode: t.Union([t.Literal("all"), t.Literal("group")]),
        groupIds: t.Optional(t.Array(t.String({ minLength: 1 }))),
      }),
      detail: {
        summary: "claim item (ระบุคนจ่าย + ราคา)",
        description:
          "ใส่ price + claimedBy (คนจ่าย) + splitMode ให้ item — 'all' หารทั้งห้อง, 'group' หารเฉพาะกลุ่ม (การผูกกลุ่มยังไม่ implement)",
        tags: ["Items"],
      },
    },
  )
  .post(
    "/rooms/:code/items/:itemId/unclaim",
    async ({ params: { code, itemId }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const [item] = await db.select().from(items).where(eq(items.id, itemId));
      if (!item) {
        set.status = 404;
        return { error: "ไม่พบ item" };
      }
      const [updatedItem] = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(items)
          .set({ claimedBy: null, price: null, splitMode: "all" })
          .where(eq(items.id, itemId))
          .returning();
        await tx
          .delete(itemsMapWithGroup)
          .where(eq(itemsMapWithGroup.itemId, itemId));
        return [updated];
      });
      return updatedItem;
    },
    {
      detail: {
        summary: "ยกเลิก claim item",
        description:
          "รีเซ็ต item กลับเป็นเปล่า — price/claimedBy = null, splitMode = 'all'",
        tags: ["Items"],
      },
    },
  )
  .delete(
    "/rooms/:code/items/:itemId",
    async ({ set, params: { code, itemId } }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const [item] = await db.select().from(items).where(eq(items.id, itemId));
      if (!item) {
        set.status = 404;
        return { error: "ไม่พบ item" };
      }
      await db.transaction(async (tx) => {
        await tx.delete(items).where(eq(items.id, itemId));
        await tx
          .delete(itemsMapWithGroup)
          .where(eq(itemsMapWithGroup.itemId, itemId));
      });
      return { message: "ลบ item สำเร็จ" };
    },
  );
