import { Liveblocks } from "@liveblocks/node";
import { realtimeRoom } from "@/lib/room-id";
import { requireRoomMember, roomApiError } from "@/lib/room-access";
import { readJson, record, RequestError } from "@/lib/request-body";

export async function POST(request: Request) {
  try {
    const { room } = record(await readJson(request, 2048));
    if (typeof room !== "string" || !room.startsWith("debug-")) {
      throw new RequestError("Invalid room ID.", 400);
    }
    const { id, user } = await requireRoomMember(room.slice("debug-".length));
    const secret = process.env.LIVEBLOCKS_SECRET_KEY;
    if (!secret) throw new RequestError("Liveblocks is not configured.", 503);
    const liveblocks = new Liveblocks({ secret });
    const session = liveblocks.prepareSession(user.id, { userInfo: { name: user.name || "Developer" } });
    session.allow(realtimeRoom(id), ["*:write"]);
    const result = await session.authorize();
    if (result.status !== 200) throw new Error("Liveblocks refused authorization");
    return new Response(result.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch (error) {
    return roomApiError(error, "Could not connect to Liveblocks.");
  }
}
