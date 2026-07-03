import { createClient } from "@libsql/client";
import "dotenv/config";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

async function main() {
  try {
    // ทดสอบว่าเชื่อมต่อได้ไหม
    const result = await db.execute("SELECT 1 AS ok");
    console.log("✅ เชื่อมต่อสำเร็จ:", result.rows);

    // ลองสร้างตาราง test แล้ว insert/select ดูจริง
    await db.execute(`
      CREATE TABLE IF NOT EXISTS connection_test (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ สร้างตารางทดสอบสำเร็จ");

    await db.execute({
      sql: "INSERT INTO connection_test (message) VALUES (?)",
      args: ["Hello from GroceryTrip test!"],
    });
    console.log("✅ insert ข้อมูลสำเร็จ");

    const rows = await db.execute("SELECT * FROM connection_test");
    console.log("✅ ข้อมูลในตาราง:", rows.rows);
  } catch (err) {
    console.error("❌ เชื่อมต่อไม่สำเร็จ:", err);
  }
}

main();
