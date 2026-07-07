import { Elysia, t } from "elysia";
import { db } from "../db/index";
import {
  rooms,
  users,
  items,
  groupsInRoom,
  memberInGroup,
  itemsMapWithGroup,
} from "../db/schema";
import { eq, inArray } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";
import { deleteRoomAndData } from "../services/rooms.service";

export const roomRoutes = new Elysia()
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
        roomName: t.String({maxLength:50}),
        hostName: t.String({ minLength: 1 ,maxLength:50}),
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
        description:
          "หาห้องจาก code — ถ้าไม่เจอคืน 404 (ไม่ต้องมี user ก็เข้าดูได้)",
        tags: ["Rooms"],
      },
    },
  )
  .get(
    "/rooms/:code/full",
    async ({ params: { code }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: "ไม่พบห้อง" };
      }

      // ดึงทุกอย่างของห้อง
      const members = await db
        .select()
        .from(users)
        .where(eq(users.roomId, room.id));
      const groupList = await db
        .select()
        .from(groupsInRoom)
        .where(eq(groupsInRoom.roomId, room.id));
      const itemList = await db
        .select()
        .from(items)
        .where(eq(items.roomId, room.id));

      const groupIds = groupList.map((g) => g.id);
      const itemIds = itemList.map((i) => i.id);

      // สมาชิกของแต่ละกลุ่ม (join users เอาชื่อมา)
      const memberRows = groupIds.length
        ? await db
            .select({
              groupId: memberInGroup.groupId,
              userId: users.id,
              name: users.name,
            })
            .from(memberInGroup)
            .innerJoin(users, eq(memberInGroup.userId, users.id))
            .where(inArray(memberInGroup.groupId, groupIds))
        : [];
      // item ผูกกลุ่มไหนบ้าง
      const mappingRows = itemIds.length
        ? await db
            .select()
            .from(itemsMapWithGroup)
            .where(inArray(itemsMapWithGroup.itemId, itemIds))
        : [];

      // สร้าง lookup
      const memberName = new Map(members.map((m) => [m.id, m.name]));
      const groupName = new Map(groupList.map((g) => [g.id, g.name]));
      const groupMembers = new Map<string, { userId: string; name: string }[]>();
      for (const r of memberRows) {
        const arr = groupMembers.get(r.groupId) ?? [];
        arr.push({ userId: r.userId, name: r.name });
        groupMembers.set(r.groupId, arr);
      }
      const itemGroupIds = new Map<string, string[]>();
      for (const r of mappingRows) {
        const arr = itemGroupIds.get(r.itemId) ?? [];
        arr.push(r.groupId);
        itemGroupIds.set(r.itemId, arr);
      }

      // ประกอบ output ให้ frontend render ได้เลย
      const groups = groupList.map((g) => ({
        ...g,
        members: groupMembers.get(g.id) ?? [],
      }));
      const itemsFull = itemList.map((i) => {
        const gids = itemGroupIds.get(i.id) ?? [];
        return {
          ...i,
          payerName: i.claimedBy ? (memberName.get(i.claimedBy) ?? null) : null,
          groupIds: gids,
          groupNames: gids.map((gid) => groupName.get(gid) ?? ""),
        };
      });

      return { room, members, groups, items: itemsFull };
    },
    {
      detail: {
        summary: "โหลดข้อมูลห้องแบบเต็ม (สำหรับหน้า hub)",
        description:
          "คืน room + members + groups(พร้อมสมาชิก) + items(พร้อม payerName/groupNames) ในครั้งเดียว ให้ frontend render หน้าห้องได้เลย",
        tags: ["Rooms"],
      },
    },
  )
  .post(
    "/rooms/:code/finish",
    async ({ params: { code }, body: { userId }, set }) => {
      const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
      if (!room) {
        set.status = 404;
        return { error: "ไม่พบห้อง" };
      }
      // เฉพาะ host เท่านั้นที่จบห้องได้
      if (userId !== room.hostUserId) {
        set.status = 403;
        return { error: "เฉพาะ host เท่านั้นที่จบห้องได้" };
      }

      await deleteRoomAndData(room.id);

      return { message: "จบห้องแล้ว ข้อมูลถูกลบทั้งหมด" };
    },
    {
      body: t.Object({
        userId: t.String({ minLength: 1 }),
      }),
      detail: {
        summary: "จบห้อง (เฉพาะ host)",
        description:
          "host จบห้อง → ลบข้อมูลของห้องทั้งหมด (items, groups, members, mappings, users, room) ใน transaction เดียว หลังจากนี้ทุก endpoint ของ code นี้จะคืน 404",
        tags: ["Rooms"],
      },
    },
  );
