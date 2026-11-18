"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { admitRoom, createRoom, requestRoom } from "./actions";

export function RoomForms({ invite }: { invite: string }) {
  const [createState, create, creating] = useActionState(createRoom, {});
  const [joinState, join, joining] = useActionState(requestRoom, {});
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form action={create} className="glass-panel flex flex-col items-start gap-4 p-6">
        <h2 className="text-lg font-semibold">Create a room</h2>
        <p className="text-sm text-slate-400">Invite one other developer to work on C++ together.</p>
        <button className="btn-gradient" disabled={creating}><span>{creating ? "Creating…" : "Create room"}</span></button>
        {createState.error && <p role="alert" className="text-sm text-red-300">{createState.error}</p>}
      </form>
      <form action={join} className="glass-panel flex flex-col items-start gap-4 p-6">
        <h2 className="text-lg font-semibold">Join a room</h2>
        <label className="text-sm text-slate-400" htmlFor="invite">Invitation link or room code</label>
        <input required maxLength={500} defaultValue={invite} id="invite" name="invite"
          className="w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2 text-sm" />
        <button className="btn-gradient" disabled={joining}><span>{joining ? "Requesting…" : "Request access"}</span></button>
        {joinState.error && <p role="alert" className="text-sm text-red-300">{joinState.error}</p>}
      </form>
    </div>
  );
}

export function RefreshRoom() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}

export function AdmitForm({ id, applicant }: { id: string; applicant: string }) {
  const [state, admit, pending] = useActionState(admitRoom, {});
  return (
    <form action={admit}>
      <input type="hidden" name="room" value={id} />
      <input type="hidden" name="applicant" value={applicant} />
      <button disabled={pending} className="rounded border border-violet-400/50 px-3 py-1 text-sm hover:bg-violet-500/20">
        {pending ? "Admitting…" : "Admit"}
      </button>
      {state.error && <p role="alert" className="mt-1 text-xs text-red-300">{state.error}</p>}
    </form>
  );
}
