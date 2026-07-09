# harnmai (หารไหม) — Backend

แอปหารบิล/ช้อปปิ้งเป็นกลุ่ม แบบเข้าห้องด้วย **code** ไม่มี login/สมัครสมาชิก
แก่นคือ: หลายคนเข้าห้องเดียวกัน เพิ่มรายการของ ระบุว่าใครจ่าย แล้ว "หารเงิน" ได้ทั้ง
**ทั้งห้อง** หรือ **เฉพาะกลุ่มย่อย** (เช่น ค่าเหล้าหารเฉพาะกลุ่มที่กินเหล้า)

## Stack
- **Runtime:** Bun (มี `bun.lock`) — dev/prod ใช้ Bun
- **Web framework:** Elysia (+ `@elysiajs/cors`, `@elysia/openapi`)
- **ORM:** Drizzle
- **DB:** Turso (libSQL / SQLite บน cloud) ต่อผ่าน `@libsql/client`
- **OS ที่ dev:** Windows (PowerShell)
- **แผน deploy:** frontend → Vercel, backend → Railway/Fly, DB → Turso (แยก deploy)

## Commands
```bash
bun run --watch index.ts   # dev server
bun run db:push            # sync schema → Turso (destructive, มี prompt ยืนยัน)
bun run db:generate        # สร้างไฟล์ SQL migration (ยังไม่ใช้เป็นหลัก)
bun run db:studio          # เปิด GUI ดู/แก้ข้อมูล
```
- env (`.env`, ไม่เข้า git): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CORS_ORIGIN` (prod เท่านั้น), `PORT` (platform ตั้งให้)
- ตอน dev sync schema ใช้ `db:push` (เร็ว) — production ค่อยขยับไป generate+migrate

## โครงไฟล์
```
backend/
├─ index.ts            # ประกอบ Elysia app: cors + openapi + /health + ...routes + listen(PORT)
├─ drizzle.config.ts   # config ให้ drizzle-kit (dialect "turso", schema ./db/schema.ts)
├─ db/
│  ├─ index.ts         # สร้าง libsql client + ห่อด้วย drizzle → export `db`
│  └─ schema.ts        # นิยามตารางทั้งหมด (single source of truth)
└─ routes/             # แต่ละไฟล์ = Elysia instance (plugin) แยกตาม resource
   ├─ rooms.ts         # roomRoutes (+ finish)
   ├─ users.ts         # userRoutes
   ├─ items.ts         # itemRoutes (create/claim/unclaim)
   ├─ groups.ts        # groupRoutes (CRUD + members)
   └─ settlement.ts    # settlementRoutes (คำนวณหารเงิน)
```
**Pattern การแยก route:** ทุกไฟล์ export `new Elysia().post(...)...` แล้ว `index.ts` เอามา `.use()` ต่อกัน
ทุก route ใส่ `detail: { summary, description, tags }` ไว้โชว์ใน OpenAPI/Swagger

## Data model (`db/schema.ts`)
ทุกตารางใช้ **PK เป็น UUID (text)** ผ่าน `.$defaultFn(() => randomUUID())` — **ไม่ใช่ auto-increment**
FK ทุกตัวเป็น `text` ตามไปด้วย

| ตาราง | สรุป | FK / index |
|---|---|---|
| `rooms` | ห้อง — `code` (unique, 6 ตัว), `name`, `hostUserId`, `status` enum `open\|locked\|finished` (default open, ปัจจุบันยังไม่ได้ใช้ค่า locked/finished) | `hostUserId` → user host (text, **ไม่มี** `.references()` โดยตั้งใจ) |
| `users` | คนในห้อง — `name` | `roomId` → rooms (cascade) |
| `items` | รายการของ — `name`, `note?`, `price?` (**nullable**), `claimedBy?`, `splitMode` enum `all\|group` (default `all`) | `roomId` → rooms, `claimedBy` → users (set null) |
| `groups_in_room` | กลุ่มย่อยในห้อง — `name` | `roomId` → rooms (cascade) |
| `member_in_group` | สมาชิกกลุ่ม (M:N users↔groups) | `groupId`, `userId` (cascade) + **unique(groupId, userId)** |
| `items_map_with_group` | ผูก item กับกลุ่มที่หาร (M:N items↔groups) | `groupId`, `itemId` (cascade) + **unique(groupId, itemId)** |

## API (ครบแล้ว)
> **สำคัญ:** ทุก endpoint ที่ทำงานกับห้อง ใช้ **`:roomId` (UUID)** เป็น path param — ยกเว้น "ประตู join" 2 เส้นที่ยัง lookup ด้วย `code`/`roomId` ตรง ๆ. เหตุผล: `code` 6 ตัวเดาง่าย เลยจำกัดให้รับ code แค่เส้น join เดียว (rate limit เข้ม) ที่เหลือใช้ UUID ที่เดาไม่ได้ ดู [Key design decisions #1]
> **router gotcha:** enter ใช้ path `/rooms/code/:code` (static segment) ไม่ใช่ `/rooms/:code` — เพราะ memoirist ห้าม dynamic segment ตำแหน่งเดียวกันชื่อ param ต่างกัน (`:code` จะชนกับ `:roomId`)
```
# Rooms
POST /rooms                              # สร้างห้อง + host   body: { roomName, hostName } → { code, userId, roomId }
GET  /rooms/code/:code                   # [join] หาห้องจาก code (rate limit เข้ม 10/นาที) → room row (มี id ให้ไปใช้ต่อ)
GET  /rooms/id/:roomId                   # [join] หาห้องจาก roomId (UUID) → room row
GET  /rooms/:roomId/full                 # โหลด hub → { room, members, groups(+members), items(+payerName,groupNames) }
POST /rooms/:roomId/finish               # host จบห้อง → ลบข้อมูลห้องทั้งหมด   body: { userId } (ต้อง === hostUserId)

# Users
POST   /rooms/:roomId/users              # เพิ่มคนในห้อง       body: { name, phone? } → { userId, name, phone }
PATCH  /rooms/:roomId/users/:userId      # แก้ชื่อ/เบอร์       body: { name?, phone? }
DELETE /rooms/:roomId/users/:userId      # ลบคนออกจากห้อง

# Items
POST /rooms/:roomId/items                  # สร้าง item เปล่า    body: { name, note? }
POST /rooms/:roomId/items/:itemId/claim    # claim              body: { price, claimedBy, splitMode, groupIds? }
POST /rooms/:roomId/items/:itemId/unclaim  # reset item กลับเป็นเปล่า + ลบ mapping
DELETE /rooms/:roomId/items/:itemId        # ลบ item

# Groups
POST   /rooms/:roomId/groups                       # สร้างกลุ่ม + สมาชิก  body: { name, userIds[] }
GET    /rooms/:roomId/groups                        # list กลุ่มในห้อง
GET    /rooms/:roomId/groups/:groupId/members       # สมาชิกในกลุ่ม (join users → มีชื่อ)
PATCH  /rooms/:roomId/groups/:groupId               # แก้ชื่อกลุ่ม  body: { name }
DELETE /rooms/:roomId/groups/:groupId               # ลบกลุ่ม
POST   /rooms/:roomId/groups/:groupId/members       # เพิ่มสมาชิก  body: { userIds[] }
DELETE /rooms/:roomId/groups/:groupId/members/:userId  # ลบสมาชิก

# Settlement
GET  /rooms/:roomId/settlement           # คำนวณหารเงิน → { totalClaimed, pendingItems, balances, transactions }
POST /rooms/:roomId/settlement/qrcode    # gen PromptPay payload  body: { phoneNumber, amount }

# Realtime
GET  /rooms/:roomId/events               # SSE stream — push { type:"changed" } ตอนห้องมีการแก้ไข (frontend refetch)

# System
GET  /health                             # health check
```

## Key design decisions (สำคัญ — อย่าเปลี่ยนโดยไม่ถาม)
1. **ไม่มี login/password** — **join** ห้องด้วย `code` (6 ตัว) → ได้ `roomId` (UUID) กลับมา, จากนั้น**ทุก operation ยิงด้วย `:roomId`** ไม่ใช่ code. ระบุตัวตนด้วย **UUID `userId`** (client เก็บใน localStorage). เหตุผล: `code` เดาง่าย เลยจำกัดให้รับ code แค่เส้น join (rate limit เข้ม) ที่เหลือใช้ UUID เดาไม่ได้ = ลด attack surface การไล่เดา. **หมายเหตุ:** นี่เป็น capability-based (ใครถือ roomId ก็เข้าถึงได้) ไม่ใช่ auth รายคน — คนในห้องแก้ข้อมูลกันได้หมดตามดีไซน์
2. **Identity = userId (UUID)** — เดิมเคยมี `token` แต่**ตัดออกแล้ว** เพราะ UUID เดายากอยู่แล้ว
3. **host คือ user ที่ `users.id === rooms.hostUserId`** — ไม่แยกตาราง host (host ก็เป็น user เต็มตัว ซื้อของ/หารเงินได้)
4. **host ต่างจากคนอื่นแค่เรื่องเดียว: จบห้อง** — `POST /finish` เช็ก `userId === hostUserId` แล้ว **hard-delete ข้อมูลทั้งห้อง** (ไม่ได้ set status="finished") → เจตนา: ประหยัด storage + privacy + ephemeral UX. หลัง finish ทุก endpoint ของ roomId นั้นคืน 404 อัตโนมัติ (= status guard ในตัว)
5. **สร้าง room ใช้ UUID ล่วงหน้า** (`randomUUID()` ทั้ง room+user ก่อน insert) → ตัดปัญหา circular dependency (rooms.hostUserId ↔ users.roomId) ไม่ต้อง placeholder+update
6. **item เกิดมาเปล่า** (แค่ `name`) → `price` + `claimedBy` มาใส่ทีหลังตอน **claim**
7. **claim = "reset-then-set"** — ทุกครั้งที่ claim จะ **ลบ `items_map_with_group` เก่าเสมอ** แล้วค่อย insert ใหม่ (เฉพาะ mode group) → กัน mapping ค้างตอน re-claim. unclaim ก็ลบ mapping ด้วย
8. **splitMode:** `"all"` = หารทั้งห้อง, `"group"` = หารเฉพาะ union สมาชิกกลุ่มที่ผูก (distinct)
9. **validation ที่ Elysia คือ source of truth** — SQLite ไม่บังคับ enum จริง → validate ที่ layer นี้ (เช่น `t.Union([t.Literal("all"), t.Literal("group")])`) + FK ไม่ enforce → ต้อง validate ว่า claimedBy/userIds/groupIds อยู่ในห้องนั้นเอง

## Domain logic — การหารเงิน (implement แล้วที่ `GET /rooms/:roomId/settlement`)
แยก **"คนจ่าย" (claimedBy)** ออกจาก **"คนหาร"** (สมาชิกกลุ่มที่ item ผูก หรือทั้งห้องถ้า `splitMode="all"`)
```
paid = { member: 0 }, owes = { member: 0 }
สำหรับแต่ละ claimed item (มี price & claimedBy):
    paid[claimedBy] += price
    participants = (all → ทุกคนในห้อง) | (group → union distinct สมาชิกกลุ่มที่ผูก)
    ถ้า participants ว่าง → skip
    share = price / participants.length
    participants แต่ละคน: owes[p] += share
balance[m] = paid[m] - owes[m]
→ greedy settle (two-pointer creditor/debtor) → transactions ที่จำนวนโอนน้อยสุด
```
- ปัดเป็น 2 ตำแหน่ง + ใช้ threshold `0.01` (float ไม่เป๊ะ) — ถ้าซีเรียสค่อยเปลี่ยนไปคิดเป็นสตางค์ (int)
- item ที่ `price == null` (ยังไม่ claim) นับเป็น `pendingItems`

## ยังไม่ได้ทำ / เก็บทีหลัง
- เพิ่ม script `"start"` ใน package.json (เช่น `"start": "bun run index.ts"`) ก่อน deploy
- `db:push` unique index (`member_in_group`, `items_map_with_group`) ขึ้น Turso — ถ้ายังมีข้อมูลซ้ำเดิม ต้องล้างก่อน
- **GET /rooms/:code แบบเต็ม** — ตอนนี้คืนแค่ room เปล่า, frontend คงอยากได้ members + items + groups ในครั้งเดียว
- **SSE realtime** (optional) — อัพเดตสดตอนมีคน claim; ตัดสินใจแล้วว่าใช้ SSE ไม่ใช่ WebSocket (push ทางเดียวพอ) เริ่มด้วย refetch ไปก่อน
- claim race (conditional update) — claim ออกแบบให้ทับได้อยู่แล้ว อาจไม่จำเป็น

## Gotchas
- **Turso/libSQL ไม่เปิด foreign key enforcement เป็น default** → (1) ค่า FK ผีอาจ insert ได้ ต้อง validate เอง (2) **DELETE ไม่ cascade** → `finish` เลยต้องลบเองทุกตารางเรียงลูก→แม่ใน transaction
- **`db:push` เป็น destructive** — จะ drop อะไรที่ไม่มีใน schema; ระวังตอนมีข้อมูลจริง
- **`updatedAt` ไม่ auto-update** — SQLite ไม่ขยับให้เองตอน UPDATE ต้อง set ค่าเองในโค้ด
- **`onConflictDoNothing()` ต้องมี unique index ถึงทำงาน** — ใช้คู่กับ unique(groupId,userId) / unique(groupId,itemId)
- **openapi plugin** — import จาก `@elysia/openapi` (ที่ติดตั้งไว้); ระวังสับสนกับ scope `@elysiajs/*` ของ plugin อื่น
- **DELETE/UPDATE/SELECT ที่ไม่เจอแถว = ไม่ error** (no-op / array ว่าง); มีแค่ INSERT ชน unique ที่ throw
```
