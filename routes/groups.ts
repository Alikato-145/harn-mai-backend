import { Elysia, t } from "elysia";
import { db } from "../db/index";
import { rooms, users, groupsInRoom, memberInGroup } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export const groupRoutes = new Elysia()
  .post(
    "/rooms/:code/groups",
    async ({ params: { code }, body: { name, userIds }, set }) => {
      const groupId = randomUUID();
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { message: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const roomUsers = await db
        .select()
        .from(users)
        .where(eq(users.roomId, room.id));
      const validIds = new Set(roomUsers.map((u) => u.id));
      if (!userIds.every((id) => validIds.has(id))) {
        set.status = 400;
        return { message: "มี userId ที่ไม่อยู่ในห้องนี้" };
      }
      const uniqueIds = [...new Set(userIds)];
      await db.transaction(async (tx) => {
        await tx
          .insert(groupsInRoom)
          .values({ id: groupId, roomId: room.id, name });
        await tx
          .insert(memberInGroup)
          .values(uniqueIds.map((uid) => ({ groupId, userId: uid })));
      });
      set.status = 201;
      return { groupId, name, userIds: uniqueIds };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        userIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
      }),
      detail: {
        summary: "สร้างกลุ่ม + สมาชิกเริ่มต้น",
        description:
          "สร้างกลุ่มย่อยในห้อง พร้อมใส่สมาชิก (userIds) ใน transaction เดียว — validate ว่าทุก userId อยู่ในห้องนี้",
        tags: ["Groups"],
      },
    },
  )
  .get(
    "/rooms/:code/groups",
    async ({ params: { code }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { message: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const groups = await db
        .select()
        .from(groupsInRoom)
        .where(eq(groupsInRoom.roomId, room.id));
      return groups;
    },
    {
      detail: {
        summary: "ดูกลุ่มทั้งหมดในห้อง",
        description: "คืนรายการกลุ่มทั้งหมดของห้องนี้ (ยังไม่รวมสมาชิกในแต่ละกลุ่ม)",
        tags: ["Groups"],
      },
    },
  )
  .patch(
    "/rooms/:code/groups/:groupId",
    async ({ params: { code, groupId }, set, body: { name } }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { message: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const [group] = await db
        .select()
        .from(groupsInRoom)
        .where(
          and(eq(groupsInRoom.id, groupId), eq(groupsInRoom.roomId, room.id)),
        );
      if (!group) {
        set.status = 404;
        return { message: `ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง` };
      }
      await db
        .update(groupsInRoom)
        .set({ name })
        .where(eq(groupsInRoom.id, groupId));
      return { groupId, name };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "แก้ชื่อกลุ่ม",
        description: "อัปเดตชื่อของกลุ่มที่ระบุ (groupId)",
        tags: ["Groups"],
      },
    },
  )
  .delete(
    "/rooms/:code/groups/:groupId",
    async ({ params: { code, groupId }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { message: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const [group] = await db
        .select()
        .from(groupsInRoom)
        .where(
          and(eq(groupsInRoom.id, groupId), eq(groupsInRoom.roomId, room.id)),
        );
      if (!group) {
        set.status = 404;
        return { message: `ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง` };
      }
      await db.delete(groupsInRoom).where(eq(groupsInRoom.id, groupId));
      return { message: `ลบกลุ่ม ${group.name} สำเร็จ` };
    },
    {
      detail: {
        summary: "ลบกลุ่ม",
        description:
          "ลบกลุ่มที่ระบุ — สมาชิก (member_in_group) และการผูก item (items_map_with_group) จะถูกลบตาม cascade อัตโนมัติ",
        tags: ["Groups"],
      },
    },
  )
  .post(
    "/rooms/:code/groups/:groupId/members",
    async ({ params: { code, groupId }, set, body: { userIds } }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { message: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const roomUsers = await db
        .select()
        .from(users)
        .where(eq(users.roomId, room.id));
      const validIds = new Set(roomUsers.map((u) => u.id));
      if (!userIds.every((id) => validIds.has(id))) {
        set.status = 400;
        return { message: "มี userId ที่ไม่อยู่ในห้องนี้" };
      }
      const [group] = await db
        .select()
        .from(groupsInRoom)
        .where(
          and(eq(groupsInRoom.id, groupId), eq(groupsInRoom.roomId, room.id)),
        );
      if (!group) {
        set.status = 404;
        return { message: `ไม่พบกลุ่ม + ${groupId} กรุณาลองใหม่อีกครั้ง` };
      }

      const uniqueIds = [...new Set(userIds)];
      await db
        .insert(memberInGroup)
        .values(uniqueIds.map((uid) => ({ groupId, userId: uid })))
        .onConflictDoNothing(); // ← ชนซ้ำก็ข้าม ไม่ error
      set.status = 201;
      return { userIds: uniqueIds };
    },
    {
      body: t.Object({
        userIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
      }),
      detail: {
        summary: "เพิ่มสมาชิกเข้ากลุ่ม",
        description:
          "เพิ่ม userIds เข้ากลุ่มที่มีอยู่ — กันซ้ำด้วย onConflictDoNothing (ต้องมี unique index บน group_id+user_id)",
        tags: ["Groups"],
      },
    },
  )
  .delete(
    "/rooms/:code/groups/:groupId/members/:userId",
    async ({ params: { code, groupId, userId }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { message: `ไม่พบห้อง + ${code} กรุณาลองใหม่อีกครั้ง` };
      }
      const [member] = await db
        .select()
        .from(memberInGroup)
        .where(
          and(
            eq(memberInGroup.groupId, groupId),
            eq(memberInGroup.userId, userId),
          ),
        );
      if (!member) {
        set.status = 404;
        return {
          message: `ไม่พบสมาชิกในกลุ่ม + ${groupId} กรุณาลองใหม่อีกครั้ง`,
        };
      }
      await db
        .delete(memberInGroup)
        .where(
          and(
            eq(memberInGroup.groupId, groupId),
            eq(memberInGroup.userId, userId),
          ),
        );
      set.status = 200;
      return { message: `ลบสมาชิก ${userId} จากกลุ่ม ${groupId} สำเร็จ` };
    },
    {
      detail: {
        summary: "ลบสมาชิกออกจากกลุ่ม",
        description: "เอา user คนหนึ่งออกจากกลุ่มที่ระบุ (ไม่ได้ลบ user ออกจากห้อง)",
        tags: ["Groups"],
      },
    },
  );
