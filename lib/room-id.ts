const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function roomId(value: unknown) {
  return typeof value === "string" && uuid.test(value) ? value.toLowerCase() : null;
}

export function invitationCode(value: string) {
  const code = roomId(value.trim());
  if (code) return code;
  try {
    const url = new URL(value.trim());
    return /^https?:$/.test(url.protocol) && url.pathname.replace(/\/$/, "") === "/collaborate"
      ? roomId(url.searchParams.get("invite")) : null;
  } catch {
    return null;
  }
}

export function realtimeRoom(id: string) {
  return `debug-${id}`;
}
