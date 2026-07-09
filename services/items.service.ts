import { db } from "../db/index";
import { items, groupsInRoom, itemsMapWithGroup } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { NotFoundError, BadRequestError } from "./errors.service";
import { getRoomById } from "./rooms.service";
import { isUserInRoom } from "./users.service";

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

export async function claimItem(
  roomId: string,
  itemId: string,
  price: number,
  claimedBy: string,
  splitMode: string,
  groupIds?: string[],
) {
  const room = await getRoomById(roomId);
  if (!(await isItemInRoom(room.id, itemId)))
    throw new NotFoundError("ไม่พบไอเท็ม");
  if (!(await isUserInRoom(room.id, claimedBy)))
    throw new NotFoundError("ไม่พบผู้ใช้ในห้องนี้");

  let uniqueGroupIds: string[] = [];
  if (splitMode !== "group" && splitMode !== "all") {
    throw new BadRequestError("splitMode ต้องเป็น group หรือ all");
  }
  if (splitMode === "group") {
    if (!groupIds || groupIds.length === 0) {
      throw new BadRequestError("splitMode=group ต้องระบุ groupIds");
    }
    uniqueGroupIds = [...new Set(groupIds)];
    const roomGroups = await db
      .select()
      .from(groupsInRoom)
      .where(eq(groupsInRoom.roomId, room.id));
    const validGroupIds = new Set(roomGroups.map((g) => g.id));
    if (!uniqueGroupIds.every((id) => validGroupIds.has(id))) {
      throw new BadRequestError("มี groupId ที่ไม่อยู่ในห้องนี้");
    }
  }

  const [updatedItem] = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(items)
      .set({ price, claimedBy, splitMode })
      .where(eq(items.id, itemId))
      .returning();

    await tx
      .delete(itemsMapWithGroup)
      .where(eq(itemsMapWithGroup.itemId, itemId));

    if (splitMode === "group") {
      await tx
        .insert(itemsMapWithGroup)
        .values(uniqueGroupIds.map((gid) => ({ groupId: gid, itemId })))
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
    await tx.delete(items).where(eq(items.id, itemId));
    await tx
      .delete(itemsMapWithGroup)
      .where(eq(itemsMapWithGroup.itemId, itemId));
  });
}
