import Link from "next/link";
import { getServerSession } from "next-auth";
import Navbar from "@/components/Navbar";
import { authOptions } from "@/lib/auth";
import { roomId } from "@/lib/room-id";
import { getMyRooms } from "@/lib/rooms";
import { RoomForms } from "./RoomForms";

export default async function CollaboratePage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const invite = roomId((await searchParams).invite) ?? "";
  const userId = (await getServerSession(authOptions))?.user?.id;
  const callbackUrl = invite ? `/collaborate?invite=${invite}` : "/collaborate";
  const rooms = userId ? await getMyRooms(userId).catch(() => null) : [];

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-5 py-12 text-white">
        <h1 className="text-3xl font-bold">Debug Together</h1>
        {!userId ? (
          <p className="text-slate-300">
            <Link className="text-violet-300 underline" href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in</Link>
            {" to create a room or accept an invitation."}
          </p>
        ) : (
          <>
            <RoomForms invite={invite} />
            <section className="glass-panel p-6">
              <h2 className="mb-4 text-lg font-semibold">Your rooms</h2>
              {rooms === null && <p className="text-sm text-red-300">Rooms are unavailable. Check the database connection and migrations.</p>}
              {rooms?.length === 0 && <p className="text-sm text-slate-400">No rooms yet.</p>}
              <ul className="grid gap-2">
                {rooms?.map((room) => (
                  <li key={room.id} className="flex items-center justify-between gap-3 rounded border border-white/10 px-3 py-2">
                    <Link href={`/collaborate/${room.id}`} className="text-sm text-violet-300 hover:underline">
                      C++ room {room.id.slice(0, 8)}
                    </Link>
                    <span className="text-xs text-slate-400">{room.ownerId === userId ? "Owner" : "Participant"} · {room.participantId ? "2" : "1"}/2 accounts</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}
