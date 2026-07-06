import { db } from "../db/index";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError } from "./errors.service";
import { getRoomByCode } from "./rooms.service";

// เพิ่มคนในห้อง — คืน { userId, name }
export async function addUserToRoom(code: string, name: string) {
  const room = await getRoomByCode(code);
  const [user] = await db
    .insert(users)
    .values({ name, roomId: room.id })
    .returning();
  return { userId: user.id, name };
}

// ลบคนออกจากห้อง
export async function removeUserFromRoom(code: string, userId: string) {
  await getRoomByCode(code); // 404 ถ้าห้องไม่มี
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new NotFoundError("ไม่พบผู้ใช้");
  await db.delete(users).where(eq(users.id, userId));
  return { message: "ลบผู้ใช้สำเร็จ" };
}

export async function findUserByCode(code: string) {
  const room = await getRoomByCode(code);
  const usersInRoom = await db
    .select()
    .from(users)
    .where(eq(users.roomId, room.id));
  return usersInRoom;
}
export async function IsUserInRoom(code: string, userId: string) {
  const room = await getRoomByCode(code);
  const user = await db
    .select()
    .from(users)
    .where(eq(users.id, userId) && eq(users.roomId, room.id));
  return !!user;
}
