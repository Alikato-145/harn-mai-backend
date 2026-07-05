import { Elysia, t } from "elysia";
import { db } from "../db/index";
import { rooms, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";

export const roomRoutes = new Elysia()
  .get(
    "/rooms",
    async () => {
      const room = await db.select().from(rooms);
      return room;
    },
    {
      detail: {
        summary: "ดูห้องทั้งหมด (debug)",
        description: "คืนรายการห้องทั้งหมดในระบบ — ใช้สำหรับ debug เท่านั้น",
        tags: ["Rooms"],
      },
    },
  )
  .post(
    "/rooms",
    async ({ body: { roomName, hostName } }) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[randomInt(0, chars.length)];
      }
      const roomId = randomUUID();
      const userId = randomUUID();

      await db.transaction(async (tx) => {
        await tx.insert(rooms).values({
          id: roomId,
          name: roomName,
          code,
          hostUserId: userId,
        });
        await tx.insert(users).values({
          id: userId,
          name: hostName,
          roomId: roomId,
        });
      });

      return { code, userId };
    },
    {
      body: t.Object({
        roomName: t.String(),
        hostName: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "สร้างห้องใหม่ + host",
        description:
          "สุ่ม code 6 ตัว แล้วสร้าง room + host user พร้อมกันใน transaction เดียว (ใช้ UUID ล่วงหน้าตัดปัญหา circular dependency) คืน { code, userId } ให้ host เก็บไว้",
        tags: ["Rooms"],
      },
    },
  )
  .get(
    "/rooms/:code",
    async ({ params: { code }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: "ไม่พบห้อง" };
      }
      return room;
    },
    {
      detail: {
        summary: "เข้าห้องด้วย code",
        description: "หาห้องจาก code — ถ้าไม่เจอคืน 404 (ไม่ต้องมี user ก็เข้าดูได้)",
        tags: ["Rooms"],
      },
    },
  );
