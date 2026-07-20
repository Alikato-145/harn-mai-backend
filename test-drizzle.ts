import { db } from "./db/index";
import { rooms } from "./db/schema";
import { eq } from "drizzle-orm";
const result = await db
  .insert(rooms)
  .values({ code: "", name: "", hostToken: "", hostUserId: 0, status: "open" })
  .returning();
console.log(result);
