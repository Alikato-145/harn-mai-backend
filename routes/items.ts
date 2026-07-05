import { Elysia, t } from "elysia";
import { db } from "../db/index";
import { rooms, items } from "../db/schema";
import { eq } from "drizzle-orm";
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
      body: { price, claimedBy, splitMode},
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
      const [updatedItem] = await db
        .update(items)
        .set({ claimedBy, price, splitMode })
        .where(eq(items.id, itemId))
        .returning();
      return updatedItem;
    },
    {
      body: t.Object({
        price: t.Number(),
        claimedBy: t.String(),
        splitMode: t.Union([t.Literal("all"), t.Literal("group")]),
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
      const [updatedItem] = await db
        .update(items)
        .set({ claimedBy: null, price: null, splitMode: "all" })
        .where(eq(items.id, itemId))
        .returning();
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
  );
