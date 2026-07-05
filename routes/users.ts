import { Elysia, t } from "elysia";
import { db } from "../db/index";
import { rooms, users } from "../db/schema";
import { eq } from "drizzle-orm";

export const userRoutes = new Elysia().post(
  "/rooms/:code/users",
  async ({ params: { code }, body: { name }, set }) => {
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    if (!room) {
      set.status = 404;
      return { error: "ไม่พบห้อง" };
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
    detail: {
      summary: "เพิ่มคนในห้อง",
      description:
        "สร้าง user ใหม่ในห้อง (กรอกชื่อเพื่อน) — ใครมี code ก็สร้างได้ กี่คนก็ได้ คืน { userId, name }",
      tags: ["Users"],
    },
  },
);
