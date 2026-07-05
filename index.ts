import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { roomRoutes } from "./routes/rooms";
import { userRoutes } from "./routes/users";
import { itemRoutes } from "./routes/items";
import { groupRoutes } from "./routes/groups";
import { settlementRoutes } from "./routes/settlement";

// dev: ไม่ตั้ง CORS_ORIGIN → เปิดทุก origin (true)
// prod: ตั้ง CORS_ORIGIN=https://your-frontend.vercel.app (คั่นด้วย , ได้หลายอัน)
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : [];
const app = new Elysia()
  .use(
    cors({
      origin: (request) => {
        // ถ้ารันบน Local (ไม่มีการตั้งค่า ENV) ให้ผ่านได้เลย
        if (allowedOrigins.length === 0) return true;

        const origin = request.headers.get("origin");
        // ถ้า Origin ที่ยิงมา ตรงกับที่เราตั้งไว้ใน Railway Variables ให้ผ่าน
        if (origin && allowedOrigins.includes(origin)) {
          return true;
        }

        return false;
      },
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // ระบุให้ชัดเจน
      allowedHeaders: ["Content-Type", "Authorization"], // อนุญาต Header ที่มักส่งจาก Frontend
      credentials: true,
      preflight: true,
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
  .use(userRoutes)
  .use(itemRoutes)
  .use(groupRoutes)
  .use(settlementRoutes)
  // prod: platform กำหนด PORT ให้เอง / dev: fallback 3000
  .listen(process.env.PORT ?? 3000);

console.log(`Server is running on port ${app.server?.port}`);
