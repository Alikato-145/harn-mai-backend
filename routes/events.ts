import { Elysia } from "elysia";
import { subscribe } from "../services/events.service";

export const eventRoutes = new Elysia().get(
  "/rooms/:code/events",
  async ({ params: { code }, request, set }) => {
    set.headers["content-type"] = "text/event-stream";
    set.headers["cache-control"] = "no-cache";
    set.headers["connection"] = "keep-alive";
    return new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (m: string) => {
          controller.enqueue(enc.encode(m));
        };
        send(": connected\n\n");
        const unsub = subscribe(code, send);
        const hb = setInterval(() => send(": ping\n\n"), 25000);

        request.signal.addEventListener("abort", () => {
          unsub();
          clearInterval(hb);
        });
      },
    });
  },
);
