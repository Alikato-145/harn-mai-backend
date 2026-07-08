import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { rateLimit } from "elysia-rate-limit";
import { roomRoutes } from "./routes/rooms";
import { enterRoutes } from "./routes/enter";
import { userRoutes } from "./routes/users";
import { itemRoutes } from "./routes/items";
import { groupRoutes } from "./routes/groups";
import { settlementRoutes } from "./routes/settlement";
import { deleteExpiredRooms } from "./services/rooms.service";
import openapi from "@elysia/openapi";
import { eventRoutes } from "./routes/events";

// dev: ไม่ตั้ง CORS_ORIGIN → เปิดทุก origin (true)
// prod: ตั้ง CORS_ORIGIN=https://your-frontend.vercel.app (คั่นด้วย , ได้หลายอัน)
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : true;

const app = new Elysia()
  .use(
    cors({
      origin: corsOrigin,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"], // ระบุให้ชัดเจน
      allowedHeaders: ["Content-Type", "Authorization"], // อนุญาต Header ที่มักส่งจาก Frontend
      credentials: true,
    }),
  )
  .use(
    rateLimit({
      duration: 60_000, // หน้าต่าง 1 นาที
      max: 100, // 100 requests/นาที ต่อ IP
      scoping: "global", // ครอบ route plugin ที่ .use() เข้ามาด้วย
      headers: true, // ส่ง RateLimit-* header กลับไป
      skip: (req) =>
        req.method === "OPTIONS" ||
        new URL(req.url).pathname.endsWith("/events"), // ไม่นับ CORS preflight
      generator: (request, server) => {
        // หลัง proxy (Railway/Fly) IP จริงอยู่ใน x-forwarded-for; รันเครื่อง local ค่อย fallback
        const xff = request.headers.get("x-forwarded-for");
        if (xff) return xff.split(",")[0].trim();
        return server?.requestIP(request)?.address ?? "unknown";
      },
      errorResponse: new Response(
        JSON.stringify({ error: "คำขอถี่เกินไป ลองใหม่อีกครั้งในอีกสักครู่" }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    }),
  )
  .get("/health", () => ({ status: "ok" }), {
    detail: {
      summary: "health check",
      description:
        "ไว้ให้ platform (Railway/Fly) ping เช็กว่า service ยังทำงาน",
      tags: ["System"],
    },
  })
  .use(roomRoutes)
  .use(enterRoutes)
  .use(userRoutes)
  .use(itemRoutes)
  .use(groupRoutes)
  .use(eventRoutes)
  .use(settlementRoutes)
  .listen({
    port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
    hostname: "0.0.0.0", // 🌟 บังคับให้รับทุก IP, ห้ามลืมเด็ดขาดสำหรับ Railway
  });

console.log(`Server is running on port ${app.server?.port}`);

// ── cleanup ห้องหมดอายุ (สร้างเกิน 7 วัน) — รันตอน start + ทุก 24 ชม. ──
const ROOM_TTL_DAYS = 7;
const CLEANUP_EVERY_MS = 24 * 60 * 60 * 1000;

async function runCleanup() {
  try {
    const n = await deleteExpiredRooms(ROOM_TTL_DAYS);
    if (n > 0) console.log(`[cleanup] ลบห้องหมดอายุ ${n} ห้อง`);
  } catch (e) {
    console.error("[cleanup] ล้มเหลว:", e);
  }
}

runCleanup(); // เก็บกวาดทันทีตอนบูต
setInterval(runCleanup, CLEANUP_EVERY_MS);
