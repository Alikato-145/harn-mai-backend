import { Elysia, t } from "elysia";
import { db } from "../db/index";
import { rooms, users, groupsInRoom, memberInGroup } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  createGroup,
  getGroupByCode,
  getUsersInGroup,
  updateGroupName,
  addMembersToGroup,
  deleteGroup,
  deleteMembersInGroup,
} from "../services/groups.service";
import { notifyRoom } from "../services/events.service";

export const groupRoutes = new Elysia()
  .post(
    "/rooms/:roomId/groups",
    async ({ params: { roomId }, body: { name, userIds }, set }) => {
      const result = await createGroup(roomId, name, userIds);
      notifyRoom(roomId);
      return result;
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
    "/rooms/:roomId/groups",
    async ({ params: { roomId }, set }) => {
      const groups = await getGroupByCode(roomId);
      return groups;
    },
    {
      detail: {
        summary: "ดูกลุ่มทั้งหมดในห้อง",
        description:
          "คืนรายการกลุ่มทั้งหมดของห้องนี้ (ยังไม่รวมสมาชิกในแต่ละกลุ่ม)",
        tags: ["Groups"],
      },
    },
  )
  .get(
    "/rooms/:roomId/groups/:groupId/members",
    async ({ params: { roomId, groupId }, set }) => {
      const members = await getUsersInGroup(groupId, roomId);
      return members;
    },
    {
      detail: {
        summary: "ดูสมาชิกในกลุ่ม",
        description: "คืนรายชื่อสมาชิก (userId + name) ของกลุ่มที่ระบุ",
        tags: ["Groups"],
      },
    },
  )
  .patch(
    "/rooms/:roomId/groups/:groupId",
    async ({ params: { roomId, groupId }, set, body: { name } }) => {
      const updatedGroup = await updateGroupName(roomId, groupId, name);
      notifyRoom(roomId);
      return updatedGroup;
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
    "/rooms/:roomId/groups/:groupId",
    async ({ params: { roomId, groupId }, set }) => {
      const group = await deleteGroup(roomId, groupId);
      notifyRoom(roomId);
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
    "/rooms/:roomId/groups/:groupId/members",
    async ({ params: { roomId, groupId }, set, body: { userIds } }) => {
      const result = await addMembersToGroup(roomId, groupId, userIds);
      notifyRoom(roomId);
      return result;
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
    "/rooms/:roomId/groups/:groupId/members/:userId",
    async ({ params: { roomId, groupId, userId }, set }) => {
      const result = await deleteMembersInGroup(roomId, groupId, userId);
      notifyRoom(roomId);
      return result;
    },
    {
      detail: {
        summary: "ลบสมาชิกออกจากกลุ่ม",
        description:
          "เอา user คนหนึ่งออกจากกลุ่มที่ระบุ (ไม่ได้ลบ user ออกจากห้อง)",
        tags: ["Groups"],
      },
    },
  );
