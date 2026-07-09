import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { getRoomByCode } from "../services/rooms.service";

// เส้น "เข้าห้องด้วย code" — เป็นเป้าของการไล่เดา code
// เลยแยกมาไว้ instance นี้ + ลิมิตเข้มกว่า global (10/นาที ต่อ IP)
// path เป็น /rooms/code/:code (static segment "code") แยก subtree ไม่ชนตำแหน่ง
// dynamic ของ /rooms/:roomId/... (router ห้ามชื่อ param ต่างกันในตำแหน่งเดียวกัน)
export const enterRoutes = new Elysia()
  .use(
    rateLimit({
      duration: 60_000,
      max: 10, // เข้มกว่า global (100) — กันไล่เดา code
      scoping: "global", // นับครั้งเดียวชัวร์ (scoped จะ propagate ทับ route ตัวเองซ้ำ)
      headers: true,
      // นับเฉพาะ GET /rooms/code/:code — เส้นอื่น skip หมด
      skip: (req) =>
        req.method !== "GET" ||
        !/^\/rooms\/code\/[^/]+$/.test(new URL(req.url).pathname),
      generator: (request, server) => {
        const xff = request.headers.get("x-forwarded-for");
        if (xff) return xff.split(",")[0].trim();
        return server?.requestIP(request)?.address ?? "unknown";
      },
      errorResponse: new Response(
        JSON.stringify({ error: "ลองเข้าห้องถี่เกินไป รอสักครู่แล้วลองใหม่" }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    }),
  )
  .get(
    "/rooms/code/:code",
    async ({ params: { code } }) => {
      return await getRoomByCode(code); // service โยน 404 เองถ้าไม่พบ
    },
    {
      detail: {
        summary: "เข้าห้องด้วย code (rate limit เข้ม 10/นาที)",
        description:
          "หาห้องจาก code → คืน room (มี id/roomId ให้ client ไปใช้ยิงต่อ) — จำกัด 10 ครั้ง/นาที ต่อ IP เพราะเป็นเป้าไล่เดา code",
        tags: ["Rooms"],
      },
    },
  );
