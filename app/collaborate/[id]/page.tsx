import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { authOptions } from "@/lib/auth";
import { findRoom, getApplicants, getParticipants, hasAdmissionRequest, isMember } from "@/lib/rooms";
import { roomId } from "@/lib/room-id";
import { AdmitForm, RefreshRoom } from "../RoomForms";
import RoomWorkspace from "./RoomWorkspace";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const id = roomId((await params).id);
  if (!id) notFound();
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) redirect(`/login?callbackUrl=/collaborate/${id}`);

  const result = await findRoom(id).then((room) => ({ room }), () => null);
  if (!result) return <RoomNotice title="Rooms unavailable" text="Check the database setup and try again." />;
  const { room } = result;
  if (!room || room.status !== "active") notFound();
  if (!isMember(room, userId)) {
    if (!await hasAdmissionRequest(id, userId)) notFound();
    return room.participantId
      ? <RoomNotice title="Room full" text="The owner admitted another account." />
      : <RoomNotice title="Waiting for the owner" text="The editor opens automatically after the owner admits you."><RefreshRoom /></RoomNotice>;
  }

  const owner = room.ownerId === userId;
  const memberIds = room.participantId ? [room.ownerId, room.participantId] : [room.ownerId];
  const participants = await getParticipants(memberIds);
  const applicants = owner && !room.participantId ? await getApplicants(id) : [];
  return (
    <div className="flex min-h-screen flex-col text-white">
      <Navbar />
      <RoomWorkspace id={id} userId={userId} ownerId={room.ownerId} participants={participants}
        inviteCode={owner && !room.participantId ? room.inviteCode : null}>
        {owner && !room.participantId && (
          <div className="space-y-2 border-t border-white/10 pt-4">
            <RefreshRoom />
            <h2 className="text-sm font-semibold">Join requests</h2>
            {!applicants.length && <p className="text-xs text-slate-400">Share the invitation to receive a join request.</p>}
            {applicants.map((applicant) => (
              <div key={applicant.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0 break-all">{applicant.name || "Developer"}<p className="text-xs text-slate-400">{applicant.email}</p></div>
                <AdmitForm id={id} applicant={applicant.id} />
              </div>
            ))}
          </div>
        )}
      </RoomWorkspace>
    </div>
  );
}

function RoomNotice({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return <><Navbar /><main className="mx-auto w-full max-w-xl p-6 text-white">
    <div className="glass-panel space-y-4 p-6"><h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-slate-300">{text}</p>
      <Link href="/collaborate" className="text-violet-300 underline">Back to rooms</Link>
      {children}
    </div>
  </main></>;
}
