import { randomUUID } from "node:crypto";
import { Liveblocks } from "@liveblocks/node";
import { realtimeRoom } from "./room-id";
import { RequestError } from "./request-body";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { debugRooms, roomRequests, users } from "@/db/schema";

export async function findRoom(id: string) {
  const [room] = await db.select().from(debugRooms).where(eq(debugRooms.id, id));
  return room;
}

export function isMember(room: Awaited<ReturnType<typeof findRoom>>, userId: string) {
  return room?.status === "active" && (room.ownerId === userId || room.participantId === userId);
}

export async function hasRoomAccount(userId: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(user);
}

async function requireRoomAccount(userId: string) {
  if (!await hasRoomAccount(userId)) {
    throw new RequestError("Your session has expired. Please sign in again.", 401);
  }
}

export async function createDebugRoom(ownerId: string) {
  await requireRoomAccount(ownerId);
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new RequestError("Set LIVEBLOCKS_SECRET_KEY to create a room.", 503);

  const id = randomUUID();
  const liveblocks = new Liveblocks({ secret });
  // Provision a private room before any invite can reveal its ID.
  try {
    await liveblocks.createRoom(realtimeRoom(id), { defaultAccesses: [] });
  } catch {
    throw new RequestError("Liveblocks could not create the room. Check its server configuration.", 503);
  }
  try {
    await db.insert(debugRooms).values({ id, inviteCode: randomUUID(), ownerId });
  } catch (error) {
    await liveblocks.deleteRoom(realtimeRoom(id)).catch(() => undefined);
    throw error;
  }
  return id;
}

export async function requestAdmission(inviteCode: string, userId: string) {
  await requireRoomAccount(userId);
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(debugRooms).where(eq(debugRooms.inviteCode, inviteCode)).for("update");
    if (!room || room.status !== "active") return { error: "This invitation is unavailable." };
    if (!isMember(room, userId)) {
      if (room.participantId) return { error: "This room already has two participants." };
      await tx.insert(roomRequests).values({ roomId: room.id, userId }).onConflictDoNothing();
    }
    return { id: room.id };
  });
}

export async function admitParticipant(id: string, ownerId: string, userId: string) {
  if (ownerId === userId) return false;
  const [room] = await db.update(debugRooms).set({ participantId: userId }).where(and(
    eq(debugRooms.id, id), eq(debugRooms.ownerId, ownerId), eq(debugRooms.status, "active"),
    isNull(debugRooms.participantId),
    sql`exists (select 1 from ${roomRequests} where ${roomRequests.roomId} = ${id} and ${roomRequests.userId} = ${userId})`,
  )).returning({ id: debugRooms.id });
  return Boolean(room);
}

export async function hasAdmissionRequest(id: string, userId: string) {
  const [request] = await db.select({ userId: roomRequests.userId }).from(roomRequests)
    .where(and(eq(roomRequests.roomId, id), eq(roomRequests.userId, userId)));
  return Boolean(request);
}

export async function getApplicants(id: string) {
  return db.select({ id: users.id, name: users.name, email: users.email }).from(roomRequests)
    .innerJoin(users, eq(users.id, roomRequests.userId)).where(eq(roomRequests.roomId, id))
    .orderBy(roomRequests.createdAt);
}

export async function getParticipants(ids: string[]) {
  return db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
}

export async function getMyRooms(id: string) {
  return db.select({ id: debugRooms.id, ownerId: debugRooms.ownerId, participantId: debugRooms.participantId,
    createdAt: debugRooms.createdAt }).from(debugRooms).where(and(eq(debugRooms.status, "active"),
    or(eq(debugRooms.ownerId, id), eq(debugRooms.participantId, id)))).orderBy(sql`${debugRooms.createdAt} desc`).limit(30);
}
