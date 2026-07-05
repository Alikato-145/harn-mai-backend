import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysia/openapi";
import { roomRoutes } from "./routes/rooms";
import { userRoutes } from "./routes/users";
import { itemRoutes } from "./routes/items";
import { groupRoutes } from "./routes/groups";

const app = new Elysia()
  .use(cors())
  .use(openapi())
  .use(roomRoutes)
  .use(userRoutes)
  .use(itemRoutes)
  .use(groupRoutes)
  .listen(3000);

console.log(`Server is running on port ${app.server?.port}`);
