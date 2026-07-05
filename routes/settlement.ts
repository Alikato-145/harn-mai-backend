import { Elysia } from "elysia";
import { db } from "../db/index";
import {
  rooms,
  users,
  items,
  groupsInRoom,
  memberInGroup,
  itemsMapWithGroup,
} from "../db/schema";
import { eq, inArray } from "drizzle-orm";

export const settlementRoutes = new Elysia().get(
  "/rooms/:code/settlement",
  async ({ params: { code }, set }) => {
    // ── 1. หาห้อง ──
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    if (!room) {
      set.status = 404;
      return { error: "ไม่พบห้อง" };
    }

    // ── 2. ดึงข้อมูลทั้งหมดของห้องนี้ ──
    const members = await db
      .select()
      .from(users)
      .where(eq(users.roomId, room.id));
    const allItems = await db
      .select()
      .from(items)
      .where(eq(items.roomId, room.id));
    const groups = await db
      .select()
      .from(groupsInRoom)
      .where(eq(groupsInRoom.roomId, room.id));

    // inArray = "WHERE col IN (...)" — ดึง member ของทุกกลุ่มในห้อง + mapping ของทุก item ในห้อง
    const groupIds = groups.map((g) => g.id);
    const itemIds = allItems.map((i) => i.id);
    const groupMemberRows = groupIds.length
      ? await db
          .select()
          .from(memberInGroup)
          .where(inArray(memberInGroup.groupId, groupIds))
      : [];
    const mappingRows = itemIds.length
      ? await db
          .select()
          .from(itemsMapWithGroup)
          .where(inArray(itemsMapWithGroup.itemId, itemIds))
      : [];

    // ── 3. สร้างตาราง lookup (Map ≈ std::unordered_map) ──
    // groupId -> [userId, ...]  (สมาชิกแต่ละกลุ่ม)
    const groupMembers = new Map<string, string[]>();
    for (const row of groupMemberRows) {
      const arr = groupMembers.get(row.groupId) ?? [];
      arr.push(row.userId);
      groupMembers.set(row.groupId, arr);
    }
    // itemId -> [groupId, ...]  (item นี้ผูกกับกลุ่มไหนบ้าง)
    const itemGroups = new Map<string, string[]>();
    for (const row of mappingRows) {
      const arr = itemGroups.get(row.itemId) ?? [];
      arr.push(row.groupId);
      itemGroups.set(row.itemId, arr);
    }

    // ── 4. เตรียม paid / owes ให้ทุกคนเริ่มที่ 0 ──
    const paid = new Map<string, number>();
    const owes = new Map<string, number>();
    for (const m of members) {
      paid.set(m.id, 0);
      owes.set(m.id, 0);
    }

    // ── 5. คิดเฉพาะ item ที่ claim แล้ว (มี price + claimedBy) ──
    const claimedItems = allItems.filter(
      (i) => i.price != null && i.claimedBy != null,
    );
    const pendingItems = allItems.filter((i) => i.price == null).length;

    for (const item of claimedItems) {
      const price = item.price!; // ! = บอก TS ว่า "ไม่ null แน่" (filter กรองแล้ว)
      const payer = item.claimedBy!;

      // 5a. คนจ่ายจ่ายจริงเท่าไหร่
      paid.set(payer, (paid.get(payer) ?? 0) + price);

      // 5b. หาว่าใครต้องหารบ้าง
      let participantIds: string[];
      if (item.splitMode === "all") {
        participantIds = members.map((m) => m.id); // ทุกคนในห้อง
      } else {
        // union สมาชิกของทุกกลุ่มที่ item ผูก (Set = distinct อัตโนมัติ)
        const set = new Set<string>();
        for (const gid of itemGroups.get(item.id) ?? []) {
          for (const uid of groupMembers.get(gid) ?? []) set.add(uid);
        }
        participantIds = [...set]; // spread Set -> array
      }
      if (participantIds.length === 0) continue; // ไม่มีคนหาร → ข้าม

      // 5c. หารเท่ากัน แล้วบวกเข้า owes ของแต่ละคน
      const share = price / participantIds.length;
      for (const uid of participantIds) {
        owes.set(uid, (owes.get(uid) ?? 0) + share);
      }
    }

    // ── 6. balance = paid - owes ──
    const balances = members.map((m) => {
      const p = paid.get(m.id) ?? 0;
      const o = owes.get(m.id) ?? 0;
      return { userId: m.id, name: m.name, paid: p, owes: o, balance: p - o };
    });

    // ── 7. greedy settle: จับ creditor(บวก) กับ debtor(ลบ) มาหักกัน ──
    // {...b} = copy object (กันแก้ balances เดิม), sort ต้องมี comparator เสมอ
    const creditors = balances
      .filter((b) => b.balance > 0.01)
      .map((b) => ({ ...b }))
      .sort((a, b) => b.balance - a.balance);
    const debtors = balances
      .filter((b) => b.balance < -0.01)
      .map((b) => ({ ...b }))
      .sort((a, b) => a.balance - b.balance);

    const transactions: {
      fromId: string;
      fromName: string;
      toId: string;
      toName: string;
      amount: number;
    }[] = [];

    let ci = 0;
    let di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const amount = Math.min(creditors[ci].balance, -debtors[di].balance);
      transactions.push({
        fromId: debtors[di].userId,
        fromName: debtors[di].name,
        toId: creditors[ci].userId,
        toName: creditors[ci].name,
        amount: Math.round(amount * 100) / 100, // ปัด 2 ตำแหน่ง
      });
      creditors[ci].balance -= amount;
      debtors[di].balance += amount;
      if (creditors[ci].balance < 0.01) ci++;
      if (debtors[di].balance > -0.01) di++;
    }

    // reduce = fold/accumulate — รวมราคาทั้งหมดที่ claim แล้ว
    const totalClaimed = claimedItems.reduce(
      (sum, i) => sum + (i.price ?? 0),
      0,
    );

    return { totalClaimed, pendingItems, balances, transactions };
  },
  {
    detail: {
      summary: "คำนวณการหารเงินของห้อง",
      description:
        "รวม items ที่ claim แล้ว → คิด paid/owes ต่อคน (splitMode all=ทั้งห้อง, group=เฉพาะสมาชิกกลุ่มที่ผูก) → greedy settle ว่าใครโอนให้ใครเท่าไหร่",
      tags: ["Settlement"],
    },
  },
);
