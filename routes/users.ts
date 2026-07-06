import { Elysia, t } from "elysia";
import { addUserToRoom, removeUserFromRoom } from "../services/users.service";

export const userRoutes = new Elysia()
  .post(
    "/rooms/:code/users",
    ({ params: { code }, body: { name } }) => addUserToRoom(code, name),
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 50 }),
      }),
      detail: {
        summary: "เพิ่มคนในห้อง",
        description:
          "สร้าง user ใหม่ในห้อง (กรอกชื่อเพื่อน) — ใครมี code ก็สร้างได้ กี่คนก็ได้ คืน { userId, name }",
        tags: ["Users"],
      },
    },
  )
  .delete(
    "/rooms/:code/users/:userId",
    ({ params: { code, userId } }) => removeUserFromRoom(code, userId),
    {
      detail: {
        summary: "ลบผู้ใช้",
        description: "ลบผู้ใช้จากห้อง",
        tags: ["Users"],
      },
    },
  );
