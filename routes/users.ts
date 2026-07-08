import { Elysia, t } from "elysia";
import {
  addUserToRoom,
  removeUserFromRoom,
  updateUser,
} from "../services/users.service";
import { notifyRoom } from "../services/events.service";
export const userRoutes = new Elysia()
  .post(
    "/rooms/:code/users",
    async ({ params: { code }, body: { name, phone } }) => {
      const result = await addUserToRoom(code, name, phone);
      notifyRoom(code);
      return result;
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 50 }),
        phone: t.Optional(t.String({ pattern: "^0[0-9]{9}$" })), // เบอร์ไทย 10 หลัก, ไม่ใส่ก็ได้
      }),
      detail: {
        summary: "เพิ่มคนในห้อง",
        description:
          "สร้าง user ใหม่ในห้อง (กรอกชื่อเพื่อน + เบอร์ PromptPay ถ้ามี) — ใครมี code ก็สร้างได้ คืน { userId, name, phone }",
        tags: ["Users"],
      },
    },
  )
  .patch(
    "/rooms/:code/users/:userId",
    async ({ params: { code, userId }, body }) => {
      const result = await updateUser(code, userId, body);
      notifyRoom(code);
      return result;
    },
    {
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
        phone: t.Optional(t.String({ pattern: "^0[0-9]{9}$" })),
      }),
      detail: {
        summary: "แก้ชื่อ/เบอร์ผู้ใช้",
        description:
          "อัปเดตชื่อและ/หรือเบอร์ PromptPay ของผู้ใช้ — ส่งมาเฉพาะ field ที่ต้องการแก้",
        tags: ["Users"],
      },
    },
  )
  .delete(
    "/rooms/:code/users/:userId",
    async ({ params: { code, userId } }) => {
      await removeUserFromRoom(code, userId);
      notifyRoom(code);
    },
    {
      detail: {
        summary: "ลบผู้ใช้",
        description: "ลบผู้ใช้จากห้อง",
        tags: ["Users"],
      },
    },
  );
