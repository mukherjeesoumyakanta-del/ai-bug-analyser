"use client";

import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom, RoomAudioRenderer, StartAudio, TrackToggle, VideoTrack,
  useConnectionState, useLocalParticipant, useTracks, useIsMuted, type TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { ConnectionState, Track } from "livekit-client";

export default function CallPanel({ roomId }: { roomId: string }) {
  const [connection, setConnection] = useState<{ url: string; token: string }>();
  const [joining, setJoining] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function join() {
    if (pending.current || connection) return;
    const controller = new AbortController();
    pending.current = controller;
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/voice-token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not join the call.");
      if (!controller.signal.aborted) setConnection(data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not join the call.");
    } finally {
      pending.current = null;
      setJoining(false);
    }
  }

  return (
    <section className="space-y-3 border-t border-white/10 pt-4" aria-label="Video call">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Video & audio</h2>
        <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}
          className="rounded border border-white/15 px-2 py-1 text-xs lg:hidden">
          {collapsed ? "Show videos" : "Hide videos"}
        </button>
      </div>
      {!connection ? (
        <div className="space-y-2">
          <p className="text-xs text-slate-400">Join with your camera and microphone off.</p>
          <button type="button" onClick={join} disabled={joining}
            className="rounded border border-violet-400/50 px-3 py-2 text-sm disabled:opacity-50">
            {joining ? "Joining…" : "Join call"}
          </button>
        </div>
      ) : (
        <LiveKitRoom token={connection.token} serverUrl={connection.url} connect audio={false} video={false}
          onDisconnected={() => { setConnection(undefined); setError("Call ended. You can join again."); }}
          onError={() => setError("Call connection failed. Leave and rejoin, or check the LiveKit setup.")}
          onMediaDeviceFailure={() => setError("Media device access failed. Check your browser permissions.")}
          options={{ videoCaptureDefaults: { resolution: { width: 640, height: 360, frameRate: 24 } } }}>
          <CallControls collapsed={collapsed} onLeave={() => { setConnection(undefined); setError(""); }} />
          <RoomAudioRenderer />
          <StartAudio label="Play audio" className="rounded border border-white/15 px-3 py-2 text-sm" />
        </LiveKitRoom>
      )}
      {error && <p role="alert" className="break-words text-xs text-red-200">{error}</p>}
    </section>
  );
}

function CallControls({ collapsed, onLeave }: { collapsed: boolean; onLeave: () => void }) {
  const connection = useConnectionState();
  const { isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const [deviceError, setDeviceError] = useState("");
  const connected = connection === ConnectionState.Connected;

  function denied(device: string, error: Error) {
    setDeviceError(error.name === "NotAllowedError" || error.name === "PermissionDeniedError"
      ? `${device} permission denied. Allow access in your browser to enable it.`
      : `${device} unavailable. Check the device and try again.`);
  }

  return (
    <div className="space-y-3">
      <p role="status" className="text-xs capitalize text-slate-400">Call {connection}</p>
      <div hidden={collapsed} className={collapsed ? "lg:!block lg:space-y-2" : "space-y-2"}>
        {tracks.slice(0, 2).map((track) => <CameraTile key={track.participant.identity} track={track} />)}
        {tracks.length < 2 && <p className="text-xs text-slate-400">Waiting for the other participant.</p>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <TrackToggle source={Track.Source.Camera} showIcon={false} disabled={!connected}
          onChange={() => setDeviceError("")} onDeviceError={(error) => denied("Camera", error)}
          className="rounded border border-white/15 px-2 py-2 disabled:opacity-50">
          {isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        </TrackToggle>
        <TrackToggle source={Track.Source.Microphone} showIcon={false} disabled={!connected}
          onChange={() => setDeviceError("")} onDeviceError={(error) => denied("Microphone", error)}
          className="rounded border border-white/15 px-2 py-2 disabled:opacity-50">
          {isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"}
        </TrackToggle>
        <button type="button" onClick={onLeave} className="rounded border border-red-400/40 px-2 py-2 text-red-200">Leave call</button>
      </div>
      {deviceError && <p role="alert" className="text-xs text-red-200">{deviceError}</p>}
    </div>
  );
}

function CameraTile({ track }: { track: TrackReferenceOrPlaceholder }) {
  const muted = useIsMuted(track);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-slate-950">
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-slate-300">
        <span className="grid size-10 place-items-center rounded-full bg-violet-950 text-lg">{(track.participant.name || "D")[0].toUpperCase()}</span>
        <span>Camera off</span>
      </div>
      {track.publication?.track && !muted && <VideoTrack trackRef={{ ...track, publication: track.publication }}
        className="relative size-full object-cover" />}
      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-xs">
        {track.participant.name || "Developer"}{track.participant.isLocal ? " (you)" : ""}
      </div>
    </div>
  );
}
