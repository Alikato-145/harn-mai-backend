import { db } from "../db/index";
import { items, groupsInRoom, itemsMapWithGroup } from "../db/schema";
import { eq } from "drizzle-orm";
import { AppError, NotFoundError } from "./errors.service";
import { getRoomByCode } from "./rooms.service";
import { IsUserInRoom } from "./users.service";

export async function IsIteminRoom(roomId: string, itemId: string) {
  const item = await db
    .select()
    .from(items)
    .where(eq(items.roomId, roomId) && eq(items.id, itemId));
  return item.length > 0;
}
export async function addItemToRoom(code: string, name: string, note?: string) {
  const room = await getRoomByCode(code);
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
  code: string,
  itemId: string,
  price: number,
  claimedBy: string,
  splitMode: string,
  groupIds?: string[],
) {
  const room = await getRoomByCode(code);
  if (!(await IsIteminRoom(room.id, itemId)))
    throw new NotFoundError("ไม่พบไอเท็ม");
  if (!(await IsUserInRoom(code, claimedBy)))
    throw new NotFoundError("ไม่พบผู้ใช้ในห้องนี้");
  let uniqueGroupIds: string[] = [];
  if (splitMode !== "group" && splitMode !== "all") {
    throw new NotFoundError("splitMode ต้องเป็น group หรือ All");
  }
  if (splitMode === "group") {
    if (!groupIds || groupIds.length === 0) {
      throw new NotFoundError("splitMode=group ต้องระบุ groupIds");
    }
    uniqueGroupIds = [...new Set(groupIds)];
    const roomGroups = await db
      .select()
      .from(groupsInRoom)
      .where(eq(groupsInRoom.roomId, room.id));
    const validGroupIds = new Set(roomGroups.map((g) => g.id));
    if (!uniqueGroupIds.every((id) => validGroupIds.has(id))) {
      throw new NotFoundError("มี groupId ที่ไม่อยู่ในห้องนี้");
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
