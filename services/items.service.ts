import { db } from "../db/index";
import {
  items,
  users,
  groupsInRoom,
  itemsMapWithGroup,
  memberInGroup,
} from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NotFoundError, BadRequestError } from "./errors.service";
import { getRoomById } from "./rooms.service";
import { isUserInRoom } from "./users.service";
import { randomUUID } from "crypto";

// type ของ tx ที่ drizzle ส่งเข้า callback ของ db.transaction
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// เช็คว่า item อยู่ในห้องนี้จริงไหม — รับ roomId ที่ resolve มาแล้ว
export async function isItemInRoom(roomId: string, itemId: string) {
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.roomId, roomId), eq(items.id, itemId)));
  return !!item;
}

export async function addItemToRoom(roomId: string, name: string, note?: string) {
  const room = await getRoomById(roomId);
  const [newItem] = await db
    .insert(items)
    .values({
      roomId: room.id,
      name,
      note,
    })
    .returning();
  return newItem;
}

// เก็บกวาดกลุ่มลับ (isCreatedByItem=true) ที่ผูกกับ item นี้
// Turso ไม่ enforce FK → DELETE ไม่ cascade เลยต้องลบ member_in_group + groups_in_room เอง
// เรียกตอน re-claim / unclaim / delete item เพื่อกันกลุ่มลับค้างเป็นขยะ
async function deleteAnonGroupsForItem(tx: Tx, itemId: string) {
  const anonRows = await tx
    .select({ id: groupsInRoom.id })
    .from(itemsMapWithGroup)
    .innerJoin(groupsInRoom, eq(itemsMapWithGroup.groupId, groupsInRoom.id))
    .where(
      and(
        eq(itemsMapWithGroup.itemId, itemId),
        eq(groupsInRoom.isCreatedByItem, true),
      ),
    );
  const anonIds = anonRows.map((r) => r.id);
  if (anonIds.length === 0) return;
  await tx.delete(memberInGroup).where(inArray(memberInGroup.groupId, anonIds));
  await tx.delete(groupsInRoom).where(inArray(groupsInRoom.id, anonIds));
}

export async function claimItem(
  roomId: string,
  itemId: string,
  price: number,
  claimedBy: string,
  splitMode: string,
  groupIds?: string[],
  userIds?: string[],
) {
  const room = await getRoomById(roomId);
  if (!(await isItemInRoom(room.id, itemId)))
    throw new NotFoundError("ไม่พบไอเท็ม");
  if (!(await isUserInRoom(room.id, claimedBy)))
    throw new NotFoundError("ไม่พบผู้ใช้ในห้องนี้");

  if (splitMode !== "group" && splitMode !== "all") {
    throw new BadRequestError("splitMode ต้องเป็น group หรือ all");
  }

  // เตรียม/validate ข้อมูลโหมด group ให้เสร็จก่อนเข้า transaction
  let uniqueGroupIds: string[] = [];
  let uniqueUserIds: string[] = [];
  let selectPeople = false; // true = โหมด "เลือกคน" → สร้างกลุ่มลับให้

  if (splitMode === "group") {
    const hasGroups = !!groupIds && groupIds.length > 0;
    const hasUsers = !!userIds && userIds.length > 0;
    // ต้องมาอย่างใดอย่างหนึ่งเท่านั้น (ห้ามมาทั้งคู่ / ห้ามไม่มาเลย)
    if (hasGroups === hasUsers) {
      throw new BadRequestError(
        "splitMode=group ต้องระบุ groupIds หรือ userIds อย่างใดอย่างหนึ่ง",
      );
    }

    if (hasGroups) {
      // ผูกกับกลุ่มที่ตั้งชื่อไว้แล้ว (ของเดิม)
      uniqueGroupIds = [...new Set(groupIds)];
      const roomGroups = await db
        .select()
        .from(groupsInRoom)
        .where(eq(groupsInRoom.roomId, room.id));
      const validGroupIds = new Set(roomGroups.map((g) => g.id));
      if (!uniqueGroupIds.every((id) => validGroupIds.has(id))) {
        throw new BadRequestError("มี groupId ที่ไม่อยู่ในห้องนี้");
      }
    } else {
      // โหมดเลือกคน → validate userIds อยู่ในห้องจริง (กลุ่มลับสร้างใน transaction ทีหลัง)
      selectPeople = true;
      uniqueUserIds = [...new Set(userIds)];
      const roomUsers = await db
        .select()
        .from(users)
        .where(eq(users.roomId, room.id));
      const validUserIds = new Set(roomUsers.map((u) => u.id));
      if (!uniqueUserIds.every((id) => validUserIds.has(id))) {
        throw new BadRequestError("มี userId ที่ไม่อยู่ในห้องนี้");
      }
    }
  }

  const [updatedItem] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(items)
      .set({ price, claimedBy, splitMode })
      .where(eq(items.id, itemId))
      .returning();

    // reset-then-set: เก็บกวาดกลุ่มลับเก่า + ลบ mapping เก่าทั้งหมดก่อน
    await deleteAnonGroupsForItem(tx, itemId);
    await tx
      .delete(itemsMapWithGroup)
      .where(eq(itemsMapWithGroup.itemId, itemId));

    if (splitMode === "group") {
      let targetGroupIds = uniqueGroupIds;

      // โหมดเลือกคน: สร้างกลุ่มลับ (ไม่มีชื่อ, isCreatedByItem=true) ใน transaction เดียวกัน
      if (selectPeople) {
        const anonGroupId = randomUUID();
        await tx.insert(groupsInRoom).values({
          id: anonGroupId,
          roomId: room.id,
          name: "",
          isCreatedByItem: true,
        });
        await tx.insert(memberInGroup).values(
          uniqueUserIds.map((uid) => ({ groupId: anonGroupId, userId: uid })),
        );
        targetGroupIds = [anonGroupId];
      }

      await tx
        .insert(itemsMapWithGroup)
        .values(targetGroupIds.map((gid) => ({ groupId: gid, itemId })))
        .onConflictDoNothing();
    }
    return [updated];
  });
  return updatedItem;
}

export async function unclaimItem(roomId: string, itemId: string) {
  const room = await getRoomById(roomId);
  if (!(await isItemInRoom(room.id, itemId)))
    throw new NotFoundError("ไม่พบไอเทมในห้องนี้");
  const [updatedItem] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(items)
      .set({ claimedBy: null, price: null, splitMode: "all" })
      .where(eq(items.id, itemId))
      .returning();
    await deleteAnonGroupsForItem(tx, itemId);
    await tx
      .delete(itemsMapWithGroup)
      .where(eq(itemsMapWithGroup.itemId, itemId));
    return [updated];
  });
  return updatedItem;
}

export async function deleteItem(roomId: string, itemId: string) {
  const room = await getRoomById(roomId);
  if (!(await isItemInRoom(room.id, itemId)))
    throw new NotFoundError("ไม่พบไอเทมในห้องนี้");
  await db.transaction(async (tx) => {
    await deleteAnonGroupsForItem(tx, itemId);
    await tx.delete(items).where(eq(items.id, itemId));
    await tx
      .delete(itemsMapWithGroup)
      .where(eq(itemsMapWithGroup.itemId, itemId));
  });
}
