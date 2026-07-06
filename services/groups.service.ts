import { getRoomByCode } from "./rooms.service";
import { randomUUID } from "node:crypto";
import { db } from "../db/index";
import { rooms, users, groupsInRoom, memberInGroup } from "../db/schema";
import { eq, and } from "drizzle-orm";

export async function IsgroupInroom(groupId: string, roomCode: string) {
  const room = await getRoomByCode(roomCode);
  if (!room) return false;
  const group = await db
    .select()
    .from(groupsInRoom)
    .where(eq(groupsInRoom.id, groupId));
  return group.length > 0;
}
export async function getGroupInroom(groupId: string, roomCode: string) {
  const room = await getRoomByCode(roomCode);
  const [group] = await db
    .select()
    .from(groupsInRoom)
    .where(and(eq(groupsInRoom.id, groupId), eq(groupsInRoom.roomId, room.id)));
  if (!group) throw new Error(`ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง`);
  return group;
}

export async function createGroup(
  code: string,
  groupName: string,
  userIds: string[],
) {
  const room = await getRoomByCode(code);
  const groupId = randomUUID();
  const roomUsers = await db
    .select()
    .from(users)
    .where(eq(users.roomId, room.id));
  const validIds = new Set(roomUsers.map((u) => u.id));
  if (!userIds.every((id) => validIds.has(id))) {
    throw new Error("มี userId ที่ไม่อยู่ในห้องนี้");
  }
  const uniqueIds = [...new Set(userIds)];
  await db.transaction(async (tx) => {
    await tx
      .insert(groupsInRoom)
      .values({ id: groupId, roomId: room.id, name: groupName });
    await tx
      .insert(memberInGroup)
      .values(uniqueIds.map((uid) => ({ groupId, userId: uid })));
  });
  return { groupId, name: groupName, userIds: uniqueIds };
}

export async function getGroupByCode(code: string) {
  const room = await getRoomByCode(code);
  const groups = await db
    .select()
    .from(groupsInRoom)
    .where(eq(groupsInRoom.roomId, room.id));
  return groups;
}
export async function getUsersInGroup(groupId: string, code: string) {
  const room = await getRoomByCode(code);
  const [group] = await db
    .select()
    .from(groupsInRoom)
    .where(and(eq(groupsInRoom.id, groupId), eq(groupsInRoom.roomId, room.id)));
  if (!group) throw new Error("ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง");
  const membersInGroup = await db
    .select({
      userId: users.id,
      name: users.name,
      joinedAt: users.joinedAt,
    })
    .from(memberInGroup)
    .innerJoin(users, eq(memberInGroup.userId, users.id))
    .where(eq(memberInGroup.groupId, groupId));
  return { groupId, name: group.name, members: membersInGroup };
}
export async function updateGroupName(
  roomCode: string,
  groupId: string,
  name: string,
) {
  const room = await getRoomByCode(roomCode);
  if (!(await IsgroupInroom(roomCode, groupId)))
    throw new Error("ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง");
  await db
    .update(groupsInRoom)
    .set({ name })
    .where(eq(groupsInRoom.id, groupId));
  return { groupId, name };
}
