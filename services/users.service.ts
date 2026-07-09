import { db } from "../db/index";
import { users } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { NotFoundError, BadRequestError } from "./errors.service";
import { getRoomById } from "./rooms.service";

// เพิ่มคนในห้อง — phone optional (ไว้ gen QR ตอน settlement ถ้าเป็นเจ้าหนี้)
export async function addUserToRoom(roomId: string, name: string, phone?: string) {
  const room = await getRoomById(roomId); // 404 ถ้าห้องไม่มี (กัน roomId มั่ว เพราะ FK ไม่ enforce)
  const [user] = await db
    .insert(users)
    .values({ name, roomId: room.id, phone })
    .returning();
  return { userId: user.id, name: user.name, phone: user.phone };
}

// ลบคนออกจากห้อง
export async function removeUserFromRoom(roomId: string, userId: string) {
  await getRoomById(roomId); // 404 ถ้าห้องไม่มี
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new NotFoundError("ไม่พบผู้ใช้");
  await db.delete(users).where(eq(users.id, userId));
  return { message: "ลบผู้ใช้สำเร็จ" };
}

// แก้ชื่อ/เบอร์ของ user — ส่งมาเฉพาะ field ที่จะแก้ (partial update)
export async function updateUser(
  roomId: string,
  userId: string,
  data: { name?: string; phone?: string },
) {
  const room = await getRoomById(roomId);
  if (!(await isUserInRoom(room.id, userId)))
    throw new NotFoundError("ไม่พบผู้ใช้ในห้องนี้");

  // เก็บเฉพาะ field ที่ส่งมาจริง (กัน set เป็น undefined ทับของเดิม)
  const patch: { name?: string; phone?: string } = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.phone !== undefined) patch.phone = data.phone;
  if (Object.keys(patch).length === 0)
    throw new BadRequestError("ต้องระบุอย่างน้อย 1 field (name หรือ phone)");

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning();
  return { userId: updated.id, name: updated.name, phone: updated.phone };
}

// list คนทั้งห้อง
export async function getUsersInRoom(roomId: string) {
  const room = await getRoomById(roomId);
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
