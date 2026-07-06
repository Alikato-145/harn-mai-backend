// error กลางของ service layer
// มี method toResponse() → Elysia เรียกให้เองตอน error ถูกโยน (ดู handler.js:381)
// ผลคือ "ไม่ต้อง" มี onError, ไม่ต้อง instanceof, ไม่ต้องเขียน set.status ที่ route เลย
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  // Elysia จับ error ที่มี method นี้ แล้วเอา Response ที่คืนไปตอบให้เลย
  toResponse() {
    return Response.json({ error: this.message }, { status: this.status });
  }
}

// ชนิด error ที่ใช้บ่อย — นิยาม status "ครั้งเดียว" ตรงนี้
// เวลาโยนแค่ใส่ข้อความ (หรือไม่ใส่ก็ได้ ใช้ default) ไม่ต้องพิมพ์เลข status ซ้ำอีก
export class NotFoundError extends AppError {
  constructor(message = "ไม่พบข้อมูล") {
    super(404, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "คำขอไม่ถูกต้อง") {
    super(400, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "ไม่มีสิทธิ์เข้าถึง") {
    super(403, message);
  }
}
