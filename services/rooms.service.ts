import { db } from "../db/index";
import { rooms } from "../db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError } from "./errors.service";

// ใช้ซ้ำได้จากทุก service ที่อ้างห้องด้วย code
// ไม่เจอ → โยน 404 (คนเรียกไม่ต้องเช็ค null เอง)
export async function getRoomByCode(code: string) {
  const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
  if (!room) throw new NotFoundError("ไม่พบห้อง");
  return room;
}
