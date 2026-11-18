import { AccessToken, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { realtimeRoom } from "@/lib/room-id";
import { requireRoomMember, roomApiError } from "@/lib/room-access";
import { readJson, record, RequestError } from "@/lib/request-body";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { roomId } = record(await readJson(request, 2048));
    const { id, user } = await requireRoomMember(roomId);
    const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = process.env;
    if (!url || !key || !secret) throw new RequestError("Voice service is not configured.", 503);
    const endpoint = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if (endpoint.protocol !== "wss:" && !(local && endpoint.protocol === "ws:")) {
      throw new RequestError("The voice service URL must use secure WebSockets.", 503);
    }

    const token = new AccessToken(key, secret, {
      identity: user.id, name: user.name || "Developer", ttl: "5m",
    });
    token.addGrant({
      room: realtimeRoom(id),
      roomJoin: true,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    token.roomConfig = new RoomConfiguration({ maxParticipants: 2 });
    return Response.json({ url: endpoint.origin, token: await token.toJwt() }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return roomApiError(error, "Could not start the voice connection.");
  }
}
