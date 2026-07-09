import { Elysia, t } from "elysia";
import {
  addUserToRoom,
  removeUserFromRoom,
  updateUser,
} from "../services/users.service";
import { notifyRoom } from "../services/events.service";
export const userRoutes = new Elysia()
  .post(
    "/rooms/:roomId/users",
    async ({ params: { roomId }, body: { name, phone } }) => {
      const result = await addUserToRoom(roomId, name, phone);
      notifyRoom(roomId);
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
          "สร้าง user ใหม่ในห้อง (กรอกชื่อเพื่อน + เบอร์ PromptPay ถ้ามี) — ใครมี roomId ก็สร้างได้ คืน { userId, name, phone }",
        tags: ["Users"],
      },
    },
  )
  .patch(
    "/rooms/:roomId/users/:userId",
    async ({ params: { roomId, userId }, body }) => {
      const result = await updateUser(roomId, userId, body);
      notifyRoom(roomId);
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
    "/rooms/:roomId/users/:userId",
    async ({ params: { roomId, userId } }) => {
      await removeUserFromRoom(roomId, userId);
      notifyRoom(roomId);
    },
    {
      detail: {
        summary: "ลบผู้ใช้",
        description: "ลบผู้ใช้จากห้อง",
        tags: ["Users"],
      },
    },
  );
