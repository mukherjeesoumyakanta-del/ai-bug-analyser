import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findRoom, isMember } from "@/lib/rooms";
import { roomId } from "@/lib/room-id";
import { RequestError } from "@/lib/request-body";

export async function requireRoomMember(value: unknown) {
  const user = (await getServerSession(authOptions))?.user;
  if (!user?.id) throw new RequestError("Sign in to join this room.", 401);
  const id = roomId(value);
  if (!id) throw new RequestError("Invalid room ID.", 400);
  const room = await findRoom(id);
  if (!room || !isMember(room, user.id)) throw new RequestError("You do not have access to this room.", 403);
  return { id, user };
}

export function roomApiError(error: unknown, fallback: string) {
  const message = error instanceof RequestError ? error.message : fallback;
  const status = error instanceof RequestError ? error.status : 503;
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
