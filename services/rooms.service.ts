import { db } from "../db/index";
import {
  rooms,
  users,
  items,
  groupsInRoom,
  memberInGroup,
  itemsMapWithGroup,
} from "../db/schema";
import { eq, lt, inArray, sql } from "drizzle-orm";
import { NotFoundError } from "./errors.service";

// ใช้ซ้ำได้จากทุก service ที่อ้างห้องด้วย code
// ไม่เจอ → โยน 404 (คนเรียกไม่ต้องเช็ค null เอง)
export async function getRoomByCode(code: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
  if (!room) throw new NotFoundError("ไม่พบห้อง");
  return room;
}

// ลบห้อง + ข้อมูลลูกทั้งหมด เรียงลูก→แม่ ใน transaction เดียว
// (Turso ไม่ cascade ให้ ต้องลบเอง) — ใช้ทั้งตอน finish และ cleanup อัตโนมัติ
export async function deleteRoomAndData(roomId: string) {
  const roomItems = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.roomId, roomId));
  const roomGroups = await db
    .select({ id: groupsInRoom.id })
    .from(groupsInRoom)
    .where(eq(groupsInRoom.roomId, roomId));
  const itemIds = roomItems.map((i) => i.id);
  const groupIds = roomGroups.map((g) => g.id);

  await db.transaction(async (tx) => {
    if (itemIds.length)
      await tx
        .delete(itemsMapWithGroup)
        .where(inArray(itemsMapWithGroup.itemId, itemIds));
    if (groupIds.length)
      await tx
        .delete(memberInGroup)
        .where(inArray(memberInGroup.groupId, groupIds));
    await tx.delete(items).where(eq(items.roomId, roomId));
    await tx.delete(groupsInRoom).where(eq(groupsInRoom.roomId, roomId));
    await tx.delete(users).where(eq(users.roomId, roomId));
    await tx.delete(rooms).where(eq(rooms.id, roomId));
  });
}

// ลบห้องที่สร้างมาเกิน N วัน (default 7) — คืนจำนวนห้องที่ลบ
export async function deleteExpiredRooms(days = 7) {
  const expired = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(lt(rooms.createdAt, sql`datetime('now', ${`-${days} days`})`));
  for (const r of expired) await deleteRoomAndData(r.id);
  return expired.length;
}
