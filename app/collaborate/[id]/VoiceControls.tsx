"use client";

import { useEffect, useRef, useState } from "react";
import { ConnectionState, createLocalAudioTrack, Room, RoomEvent, Track } from "livekit-client";
import type { LocalAudioTrack } from "livekit-client";

type Call = {
  room: Room;
  abort: AbortController;
  track?: LocalAudioTrack;
};

function dispose(call: Call) {
  call.abort.abort();
  call.track?.stop();
  void call.room.disconnect().catch(() => undefined);
}

export default function VoiceControls({ roomId }: { roomId: string }) {
  const active = useRef<Call | null>(null);
  const audio = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Off");
  const [mic, setMic] = useState<"off" | "live" | "muted">("off");
  const [micBusy, setMicBusy] = useState(false);
  const [remote, setRemote] = useState<string[]>([]);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const audioContainer = audio.current;
    return () => {
      const call = active.current;
      active.current = null;
      if (call) dispose(call);
      audioContainer?.replaceChildren();
    };
  }, []);

  function leave() {
    const call = active.current;
    active.current = null;
    if (call) dispose(call);
    audio.current?.replaceChildren();
    setMic("off");
    setMicBusy(false);
    setRemote([]);
    setBlocked(false);
    setStatus("Off");
  }

  async function setMicrophone(call: Call) {
    if (active.current !== call) return;
    setMicBusy(true);
    setError("");
    try {
      if (call.track) {
        if (call.track.isMuted) {
          await call.track.unmute();
          if (active.current === call) setMic("live");
        } else {
          await call.track.mute();
          if (active.current === call) setMic("muted");
        }
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Microphone access requires HTTPS or localhost.");
        return;
      }
      const track = await createLocalAudioTrack();
      if (active.current !== call) {
        track.stop();
        return;
      }
      call.track = track;
      await call.room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
      if (active.current === call) setMic("live");
    } catch (failure) {
      if (active.current !== call) return;
      if (mic === "off") {
        call.track?.stop();
        call.track = undefined;
      }
      const name = failure instanceof Error ? failure.name : "";
      setError(name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "Microphone permission denied. You can still listen. Allow microphone access to speak."
        : "Microphone unavailable. Check your input device and try again.");
    } finally {
      if (active.current === call) setMicBusy(false);
    }
  }

  async function join() {
    if (active.current) return;
    setError("");
    setStatus("Connecting…");
    const room = new Room();
    const call = { room, abort: new AbortController() };
    active.current = call;

    const refreshParticipants = () => {
      if (active.current !== call) return;
      setRemote(Array.from(room.remoteParticipants.values(), (person) => person.name || "Developer"));
    };
    room
      .on(RoomEvent.ConnectionStateChanged, (state) => {
        if (active.current !== call) return;
        if (state === ConnectionState.Connected) setStatus("Connected");
        else if (state === ConnectionState.Connecting) setStatus("Connecting…");
        else if (state !== ConnectionState.Disconnected) setStatus("Reconnecting…");
      })
      .on(RoomEvent.Reconnected, refreshParticipants)
      .on(RoomEvent.ParticipantConnected, refreshParticipants)
      .on(RoomEvent.ParticipantDisconnected, refreshParticipants)
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (active.current === call && track.kind === Track.Kind.Audio) {
          const player = track.attach();
          player.autoplay = true;
          audio.current?.append(player);
        }
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach((element) => element.remove());
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (active.current === call) setBlocked(!room.canPlaybackAudio);
      })
      .on(RoomEvent.Disconnected, () => {
        if (active.current !== call) return;
        leave();
        setError("Voice disconnected. Join again to reconnect.");
      });

    try {
      const response = await fetch("/api/voice-token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
        signal: AbortSignal.any([call.abort.signal, AbortSignal.timeout(10_000)]),
      });
      const data = await response.json();
      if (!response.ok) {
        if (active.current === call) {
          leave();
          setError(data.error || "Could not join voice.");
        }
        return;
      }
      await room.connect(data.url, data.token);
      if (active.current !== call) {
        await room.disconnect();
        return;
      }
      refreshParticipants();
      void room.startAudio().catch(() => {
        if (active.current === call) setBlocked(true);
      });
      await setMicrophone(call);
    } catch {
      if (active.current !== call) return;
      leave();
      setError("Could not connect to voice. Check the LiveKit setup or try again.");
    }
  }

  return (
    <section className="space-y-3 border-t border-white/10 pt-4">
      <div className="flex justify-between gap-3"><h2 className="text-sm font-semibold">Voice</h2>
        <p role="status" className="text-xs text-slate-400">{status}</p></div>
      {!!remote.length && <p className="text-xs text-slate-300">In voice with {remote.join(", ")}</p>}
      {status === "Connected" && remote.length === 0 && <p className="text-xs text-slate-400">Waiting for the other participant to join voice.</p>}
      <div className="flex flex-wrap gap-2 text-sm">
        {status === "Off" ? <button type="button" onClick={join} className="rounded border border-violet-400/50 px-3 py-1 hover:bg-violet-500/20">Join voice</button> : <>
          <button type="button" disabled={status !== "Connected" || micBusy}
            onClick={() => { if (active.current) void setMicrophone(active.current); }}
            className="rounded border border-white/15 px-3 py-1 disabled:opacity-50">
            {mic === "off" ? "Enable microphone" : mic === "live" ? "Mute microphone" : "Unmute microphone"}
          </button>
          <button type="button" onClick={() => { leave(); setError(""); }}
            className="rounded border border-red-400/40 px-3 py-1 text-red-200">Leave voice</button>
        </>}
        {blocked && <button type="button" className="rounded border border-white/15 px-3 py-1"
          onClick={() => void active.current?.room.startAudio().then(() => setBlocked(false)).catch(() => setError("Could not start audio playback."))}>Play audio</button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
      <div ref={audio} hidden aria-hidden="true" />
    </section>
  );
}
