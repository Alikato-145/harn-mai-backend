type Client = (msg: string) => void;
const rooms = new Map<string, Set<Client>>();

export function subscribe(code: string, client: Client) {
  const set = rooms.get(code) ?? new Set<Client>();
  set.add(client);
  rooms.set(code, set);
  return () => {
    set.delete(client);
    if (set.size === 0) {
      rooms.delete(code);
    }
  };
}

export function notifyRoom(code: string) {
  for (const send of rooms.get(code) ?? []) {
    send(`data: {"type":"changed"}\n\n`);
  }
}
