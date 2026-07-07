import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { roomRoutes } from "./routes/rooms";
import { userRoutes } from "./routes/users";
import { itemRoutes } from "./routes/items";
import { groupRoutes } from "./routes/groups";
import { settlementRoutes } from "./routes/settlement";
import openapi from "@elysia/openapi";

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
  .listen({
    port: process.env.PORT ? parseInt(process.env.PORT) : 8080,
    hostname: "0.0.0.0", // 🌟 บังคับให้รับทุก IP, ห้ามลืมเด็ดขาดสำหรับ Railway
  });

console.log(`Server is running on port ${app.server?.port}`);
