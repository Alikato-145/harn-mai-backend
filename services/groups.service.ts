import { getRoomById } from "./rooms.service";
import { randomUUID } from "node:crypto";
import { db } from "../db/index";
import { rooms, users, groupsInRoom, memberInGroup } from "../db/schema";
import { eq, and } from "drizzle-orm";

export async function IsgroupInroom(groupId: string, roomId: string) {
  const room = await getRoomById(roomId);
  if (!room) throw new Error("ไม่พบห้อง");
  const group = await db
    .select()
    .from(groupsInRoom)
    .where(eq(groupsInRoom.id, groupId));
  return group.length > 0;
}
export async function getGroupInroom(groupId: string, roomId: string) {
  const room = await getRoomById(roomId);
  const [group] = await db
    .select()
    .from(groupsInRoom)
    .where(and(eq(groupsInRoom.id, groupId), eq(groupsInRoom.roomId, room.id)));
  if (!group) throw new Error(`ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง`);
  return group;
}

export async function createGroup(
  roomId: string,
  groupName: string,
  userIds: string[],
) {
  const room = await getRoomById(roomId);
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

export async function getGroupByCode(roomId: string) {
  const room = await getRoomById(roomId);
  const groups = await db
    .select()
    .from(groupsInRoom)
    .where(eq(groupsInRoom.roomId, room.id));
  return groups;
}
export async function getUsersInGroup(groupId: string, roomId: string) {
  const room = await getRoomById(roomId);
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
  roomId: string,
  groupId: string,
  name: string,
) {
  const room = await getRoomById(roomId);
  if (!(await IsgroupInroom(groupId, roomId)))
    throw new Error("ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง");
  await db
    .update(groupsInRoom)
    .set({ name })
    .where(eq(groupsInRoom.id, groupId));
  return { groupId, name };
}
export async function deleteGroup(roomId: string, groupId: string) {
  const room = await getRoomById(roomId);
  const group = await getGroupInroom(groupId, roomId);
  await db.delete(groupsInRoom).where(eq(groupsInRoom.id, groupId));
  return { groupId, name: group.name };
}

export async function addMembersToGroup(
  roomId: string,
  groupId: string,
  userIds: string[],
) {
  const room = await getRoomById(roomId);
  if (!(await IsgroupInroom(groupId, roomId)))
    throw new Error("ไม่พบกลุ่มที่เลือกไว้ กรุณาลองใหม่อีกครั้ง");
  const roomUsers = await db
    .select()
    .from(users)
    .where(eq(users.roomId, room.id));
  const validIds = new Set(roomUsers.map((u) => u.id));
  if (!userIds.every((id) => validIds.has(id))) {
    throw new Error("มี userId ที่ไม่อยู่ในห้องนี้");
  }
  const group = await getGroupInroom(groupId, roomId);
  const uniqueIds = [...new Set(userIds)];
  await db
    .insert(memberInGroup)
    .values(uniqueIds.map((uid) => ({ groupId, userId: uid })))
    .onConflictDoNothing();
  return { userIds: uniqueIds };
}
export async function deleteMembersInGroup(
  roomId: string,
  groupId: string,
  userId: string,
) {
  const room = await getRoomById(roomId);
  const group = await getGroupInroom(groupId, roomId);
  const [member] = await db
    .select()
    .from(memberInGroup)
    .where(
      and(eq(memberInGroup.groupId, groupId), eq(memberInGroup.userId, userId)),
    );
  if (!member) {
    throw new Error(`ไม่พบสมาชิกในกลุ่ม ${groupId} กรุณาลองใหม่อีกครั้ง`);
  }
  await db
    .delete(memberInGroup)
    .where(
      and(eq(memberInGroup.groupId, groupId), eq(memberInGroup.userId, userId)),
    );
  return { message: `ลบสมาชิก ${userId} จากกลุ่ม ${groupId} สำเร็จ` };
}
