# GroceryTrip — Backend

แอปหารบิล/ช้อปปิ้งเป็นกลุ่ม แบบเข้าห้องด้วย **code** ไม่มี login/สมัครสมาชิก
แก่นคือ: หลายคนเข้าห้องเดียวกัน เพิ่มรายการของ ระบุว่าใครจ่าย แล้ว "หารเงิน" ได้ทั้ง
**ทั้งห้อง** หรือ **เฉพาะกลุ่มย่อย** (เช่น ค่าเหล้าหารเฉพาะกลุ่มที่กินเหล้า)

## Stack
- **Runtime:** Bun (มี `bun.lock`) — dev/prod ใช้ Bun
- **Web framework:** Elysia
- **ORM:** Drizzle
- **DB:** Turso (libSQL / SQLite บน cloud) ต่อผ่าน `@libsql/client`
- **OS ที่ dev:** Windows (PowerShell)

## Commands
```bash
bun run --watch index.ts   # dev server (port 3000)
bun run db:push            # sync schema → Turso (destructive, มี prompt ยืนยัน)
bun run db:generate        # สร้างไฟล์ SQL migration (ยังไม่ใช้เป็นหลัก)
bun run db:studio          # เปิด GUI ดู/แก้ข้อมูล
```
- ต่อ DB ใช้ env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` (อยู่ใน `.env`, ไม่เข้า git)
- ตอน dev sync schema ใช้ `db:push` (เร็ว) — production ค่อยขยับไป generate+migrate

## โครงไฟล์
```
backend/
├─ index.ts            # ประกอบ Elysia app: .use(cors, openapi, ...routes).listen(3000)
├─ drizzle.config.ts   # config ให้ drizzle-kit (dialect "turso", schema ./db/schema.ts)
├─ db/
│  ├─ index.ts         # สร้าง libsql client + ห่อด้วย drizzle → export `db`
│  └─ schema.ts        # นิยามตารางทั้งหมด (single source of truth)
└─ routes/             # แต่ละไฟล์ = Elysia instance (plugin) แยกตาม resource
   ├─ rooms.ts         # roomRoutes
   ├─ users.ts         # userRoutes
   ├─ items.ts         # itemRoutes
   └─ groups.ts        # groupRoutes (กำลังทำ)
```
**Pattern การแยก route:** ทุกไฟล์ export `new Elysia().post(...)...` แล้ว `index.ts` เอามา `.use()` ต่อกัน

## Data model (`db/schema.ts`)
ทุกตารางใช้ **PK เป็น UUID (text)** ผ่าน `.$defaultFn(() => randomUUID())` — **ไม่ใช่ auto-increment**
FK ทุกตัวเป็น `text` ตามไปด้วย

| ตาราง | สรุป | FK/ความสัมพันธ์ |
|---|---|---|
| `rooms` | ห้อง — `code` (unique, 6 ตัว), `name`, `hostUserId`, `status` enum `open\|locked\|finished` | `hostUserId` → user ที่เป็น host (เก็บเป็น text แต่ **ไม่มี** `.references()` โดยตั้งใจ) |
| `users` | คนในห้อง — `name` | `roomId` → rooms (cascade) |
| `items` | รายการของ — `name`, `note?`, `price?` (**nullable**), `claimedBy?`, `splitMode` enum `all\|group` (default `all`) | `roomId` → rooms, `claimedBy` → users (set null) |
| `groups_in_room` | กลุ่มย่อยในห้อง — `name` | `roomId` → rooms (cascade) |
| `member_in_group` | สมาชิกของกลุ่ม (M:N users↔groups) | `groupId`, `userId` (cascade) |
| `items_map_with_group` | ผูก item กับกลุ่มที่หาร (M:N items↔groups) | `groupId`, `itemId` (cascade) |

## API (สถานะปัจจุบัน)
```
GET  /rooms                              # list ทั้งหมด (debug)
POST /rooms                              # สร้างห้อง + host user   body: { roomName, hostName } → { code, userId }
GET  /rooms/:code                        # เข้าห้อง (หาห้องจาก code)
POST /rooms/:code/users                  # เพิ่มคนในห้อง            body: { name } → { userId, name }
POST /rooms/:code/items                  # สร้าง item เปล่า         body: { name, note? }
POST /rooms/:code/items/:itemId/claim    # ใส่ price+ผู้จ่าย+โหมด    body: { price, claimedBy, splitMode }
POST /rooms/:code/items/:itemId/unclaim  # รีเซ็ต item (price/claimedBy = null, splitMode = "all")
POST /rooms/:code/groups                 # (กำลังทำ) สร้างกลุ่ม + สมาชิก
```

## Key design decisions (สำคัญ — อย่าเปลี่ยนโดยไม่ถาม)
1. **ไม่มี login/password** — เข้าห้องด้วย `code`, ระบุตัวตนด้วย **UUID `userId`** (เก็บฝั่ง client)
2. **Identity = userId (UUID)** — เดิมเคยมี `token` แต่**ตัดออกแล้ว** เพราะ UUID เดายากอยู่แล้ว
3. **host คือ user ที่ `users.id === rooms.hostUserId`** — ไม่แยกตาราง host (host ก็เป็น user เต็มตัว ซื้อของ/หารเงินได้เหมือนกัน)
4. **host ต่างจากคนอื่นแค่เรื่องเดียว: สิทธิ์ "จบห้อง"** (`status → finished`) — endpoint อื่นใครมี code ก็ทำได้
5. **สร้าง room ใช้ UUID ล่วงหน้า** (`randomUUID()` ทั้ง room+user ก่อน insert) → ตัดปัญหา circular dependency (rooms.hostUserId ↔ users.roomId) ไม่ต้อง placeholder+update
6. **item เกิดมาเปล่า** (แค่ `name`) → `price` + `claimedBy` มาใส่ทีหลังตอน **claim**
7. **splitMode:** `"all"` = หารทั้งห้อง, `"group"` = หารเฉพาะสมาชิกของกลุ่มที่ผูกใน `items_map_with_group`. เลือก `"group"` ได้ต่อเมื่อมีกลุ่มที่มีสมาชิก
8. **validation ที่ Elysia คือ source of truth** — SQLite ไม่ได้บังคับ enum จริง → ต้อง validate ที่ layer นี้ (เช่น splitMode ใช้ `t.Union([t.Literal("all"), t.Literal("group")])`)

## Domain logic — การหารเงิน (ยังไม่ได้ implement เป็น endpoint)
แยก **"คนจ่าย" (claimedBy)** ออกจาก **"คนหาร"** (สมาชิกของกลุ่มที่ item ผูก หรือทั้งห้องถ้า `splitMode="all"`)

โมเดลคำนวณที่ตั้งใจไว้:
```
owes = { ทุก member: 0 }
สำหรับแต่ละ item (มี price & claimedBy):
    ถ้า splitMode="all"   → participants = ทุกคนในห้อง
    ถ้า splitMode="group" → participants = union (distinct) ของสมาชิกทุกกลุ่มที่ item ผูก
    share = price / participants.length
    participants แต่ละคน: owes[p] += share
balance[m] = paid[m] - owes[m]     # paid = ยอดที่คนนั้นจ่ายจริง (จาก claimedBy)
→ greedy settle: จับ creditor (balance>0) กับ debtor (balance<0) มาหักกัน ให้จำนวนโอนน้อยสุด
```
invariant ที่ควรเป็นจริงเสมอ: `sum(paid) === sum(owes)`

## ยังไม่ได้ทำ (TODO)
- `POST /rooms/:code/groups` — สร้างกลุ่ม + สมาชิก (bulk insert member_in_group, transaction)
- อัพเกรด **claim** ให้รับ `groupIds[]` เมื่อ `splitMode="group"` → ผูก `items_map_with_group` ใน transaction เดียว (ต้องลบ mapping เก่าก่อนถ้า re-claim)
- endpoint **finish room** (เช็ก `userId === room.hostUserId` เท่านั้น)
- endpoint **คำนวณหารเงิน** (ตาม domain logic ด้านบน)
- แก้/ลบสมาชิกกลุ่ม, ห้อง status guard (locked/finished ห้ามแก้)
- เตรียม deploy: `.listen(process.env.PORT ?? 3000)`, `/health`, ล็อค CORS origin ตอน prod (แผน: frontend → Vercel, backend → Railway/Fly)

## Gotchas
- **Turso/libSQL ไม่เปิด foreign key enforcement เป็น default** → ค่า FK ผี ๆ อาจ insert เข้าได้โดยไม่ error → ต้อง validate เอง (เช่น `claimedBy`/`userIds` ต้องเป็น user ในห้องนั้น)
- **`db:push` เป็น destructive** — จะ drop อะไรที่ไม่มีใน schema; ระวังตอนมีข้อมูลจริง
- **`updatedAt` ไม่ auto-update** — SQLite ไม่ขยับให้เองตอน UPDATE ต้อง set ค่าเองในโค้ด
- **openapi plugin** — import จาก `@elysia/openapi` (ที่ติดตั้งไว้); ระวังสับสนกับ scope `@elysiajs/*` ของ plugin อื่น
