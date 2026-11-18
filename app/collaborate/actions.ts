"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authOptions } from "@/lib/auth";
import { admitParticipant, createDebugRoom, requestAdmission } from "@/lib/rooms";
import { RequestError } from "@/lib/request-body";
import { invitationCode, roomId } from "@/lib/room-id";

type ActionState = { error?: string };

export async function createRoom(): Promise<ActionState> {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/collaborate");
  let id: string;
  try {
    id = await createDebugRoom(userId);
  } catch (error) {
    return { error: error instanceof RequestError ? error.message : "Could not create a room. Check the database setup or try again." };
  }
  redirect(`/collaborate/${id}`);
}

export async function requestRoom(_: ActionState, data: FormData): Promise<ActionState> {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/collaborate");
  const value = data.get("invite");
  const code = typeof value === "string" && value.length <= 500 ? invitationCode(value) : null;
  if (!code) return { error: "Enter a valid invitation link or room code." };
  let result: Awaited<ReturnType<typeof requestAdmission>>;
  try {
    result = await requestAdmission(code, userId);
  } catch {
    return { error: "Could not request access. Try again." };
  }
  if (result.error !== undefined) return { error: result.error };
  redirect(`/collaborate/${result.id}`);
}

export async function admitRoom(_: ActionState, data: FormData): Promise<ActionState> {
  const owner = (await getServerSession(authOptions))?.user?.id;
  const id = roomId(data.get("room"));
  const applicant = roomId(data.get("applicant"));
  if (!owner || !id || !applicant) return { error: "Invalid admission request." };
  try {
    if (!await admitParticipant(id, owner, applicant)) return { error: "The request is unavailable or the room is full." };
  } catch {
    return { error: "Could not admit this participant. Try again." };
  }
  revalidatePath(`/collaborate/${id}`);
  return {};
}
