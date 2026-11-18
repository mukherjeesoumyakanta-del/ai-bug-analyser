"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LiveblocksProvider, RoomProvider, useErrorListener, useOthers, useStatus } from "@liveblocks/react";
import { realtimeRoom } from "@/lib/room-id";

const SharedEditor = dynamic(() => import("./SharedEditor"), { ssr: false, loading: () => <p className="p-4">Loading Monaco…</p> });

type WorkspaceProps = {
  id: string;
  userId: string;
  ownerId: string;
  participants: { id: string; name: string | null }[];
  inviteCode: string | null;
  children: React.ReactNode;
};

export default function RoomWorkspace(props: WorkspaceProps) {
  return <LiveblocksProvider authEndpoint="/api/liveblocks-auth">
    <RoomProvider id={realtimeRoom(props.id)}><Workspace {...props} /></RoomProvider>
  </LiveblocksProvider>;
}

function Workspace({ id, userId, ownerId, participants, inviteCode, children }: WorkspaceProps) {
  const status = useStatus();
  const others = useOthers();
  const [copyMessage, setCopyMessage] = useState("");
  const [providerError, setProviderError] = useState(false);
  useErrorListener(() => setProviderError(true));

  async function copyInvite() {
    const url = new URL("/collaborate", window.location.origin);
    url.searchParams.set("invite", inviteCode ?? "");
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopyMessage("Invitation copied");
    } catch {
      setCopyMessage("Copy failed. Use the room code below.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Debug room {id.slice(0, 8)}</h1>
          <p role="status" className="text-sm text-slate-400">Live editing · {status}</p></div>
        <div className="flex flex-wrap items-center gap-3">
          {inviteCode && <button type="button" className="btn-gradient" onClick={copyInvite}><span>Copy Invite Link</span></button>}
          <Link className="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10" href="/collaborate">Exit Room</Link>
        </div>
      </header>
      {providerError && status !== "connected" && <p role="alert" className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">Live editing could not connect. Check the server setup or reload to retry.</p>}
      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="glass-panel flex min-h-[420px] flex-col overflow-hidden">
          <h2 className="border-b border-white/10 p-3 text-sm font-medium">Shared editor · main.cpp</h2>
          <div className="min-h-[360px] flex-1"><SharedEditor /></div>
        </section>
        <aside className="glass-panel space-y-4 p-4">
          <h2 className="font-semibold">Participants · {participants.length}/2</h2>
          <ul className="space-y-3">
            {participants.map((person) => {
              const online = status === "connected" && (person.id === userId || others.some((other) => other.id === person.id));
              return <li key={person.id} className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-950 text-violet-200">
                  {(person.name || "Developer").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0"><p className="truncate text-sm">{person.name || "Developer"}{person.id === userId ? " (you)" : ""}</p>
                  <p className="text-xs text-slate-400">{person.id === ownerId ? "Owner" : "Participant"} · {online ? "Online" : "Offline"}</p></div>
              </li>;
            })}
          </ul>
          {inviteCode && <div className="text-xs text-slate-400"><p role="status">{copyMessage}</p><p className="mt-1 break-all">Room code {inviteCode}</p></div>}
          {children}
        </aside>
      </div>
    </main>
  );
}
