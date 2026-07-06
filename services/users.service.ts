import { db } from "../db/index";
import { users } from "../db/schema";
import { and, eq } from "drizzle-orm";
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

// list คนทั้งห้อง
export async function getUsersInRoom(code: string) {
  const room = await getRoomByCode(code);
  return db.select().from(users).where(eq(users.roomId, room.id));
}

// เช็คว่า user อยู่ในห้องนี้จริงไหม — รับ roomId ที่ resolve มาแล้ว (ไม่ query ห้องซ้ำ)
export async function isUserInRoom(roomId: string, userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.roomId, roomId)));
  return !!user;
}
