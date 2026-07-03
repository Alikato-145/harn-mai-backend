import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { db } from "./db/index";
import { rooms, users } from "./db/schema";
import { openapi } from "@elysia/openapi";
import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
const app = new Elysia()
  .use(cors())
  .use(openapi())
  .get("/rooms", async () => {
    const room = await db.select().from(rooms);
    return room;
  })
  .post(
    "/rooms",
    async ({ body: { roomName, hostName } }) => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars[randomInt(0, chars.length)];
      }

      // สร้าง UUID เองล่วงหน้าทั้งคู่ → รู้ค่าก่อน insert → ตัดปัญหา circular dependency
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
    },
  )
  .get("/rooms/:code", async ({ params: { code }, set }) => {
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    if (!room) {
      set.status = 404;
      return { error: "ไม่พบห้อง" };
    }
    console.log(room);
    return room;
  })
  .post(
    "/rooms/:code/users",
    async ({ params: { code }, body: { name }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: "ไม่พบห้อง" };
      }
      if (name.length == 0) {
        set.status = 400;
        return { error: "ชื่อผู้ใช้ต้องมีความยาวอย่างน้อย 1 ตัวอักษร" };
      }
      const [user] = await db
        .insert(users)
        .values({
          name,
          roomId: room.id,
        })
        .returning();
      return { userId: user.id, name: name };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
      }),
    },
  )

  .listen(3000);

console.log(`Server is running on port ${app.server?.port}`);
