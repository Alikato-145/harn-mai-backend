type Client = (msg: string) => void;
const rooms = new Map<string, Set<Client>>();

export function subscribe(roomId: string, client: Client) {
  const set = rooms.get(roomId) ?? new Set<Client>();
  set.add(client);
  rooms.set(roomId, set);
  return () => {
    set.delete(client);
    if (set.size === 0) {
      rooms.delete(roomId);
    }
  };
}

export function notifyRoom(roomId: string) {
  for (const send of rooms.get(roomId) ?? []) {
    send(`data: {"type":"changed"}\n\n`);
  }
}
