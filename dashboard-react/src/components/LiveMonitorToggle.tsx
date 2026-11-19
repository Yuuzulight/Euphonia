import { useEffect, useRef, useState } from "react";

// Live playback: your own mic straight back out of the speakers, so you hear
// yourself as you speak. It has its own capture stream and audio graph, so it is
// switched on and off on its own: it can be running while a take records, or
// with nothing recording at all, and stopping one never touches the other.

export function LiveMonitorToggle() {
  const [state, setState] = useState<"off" | "on" | "blocked">("off");
  const graphRef = useRef<{ ctx: AudioContext; stream: MediaStream } | null>(null);

  function stop() {
    const graph = graphRef.current;
    graphRef.current = null;
    graph?.stream.getTracks().forEach((t) => t.stop());
    graph?.ctx.close().catch(() => {});
    setState("off");
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // No cleanup: the point is hearing your own voice, not a processed one.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new AudioContext();
      ctx.createMediaStreamSource(stream).connect(ctx.destination);
      graphRef.current = { ctx, stream };
      setState("on");
    } catch (e) {
      console.error(e);
      setState("blocked");
    }
  }

  // Releasing the mic on the way out matters: the OS keeps showing that it is
  // being recorded otherwise.
  useEffect(() => stop, []);

  const on = state === "on";
  const label = on ? "live on" : state === "blocked" ? "mic blocked" : "live playback";

  return (
    <button
      className={`monitor-btn${on ? " on" : ""}${state === "blocked" ? " is-error" : ""}`}
      aria-pressed={on}
      title={
        on
          ? "Live playback is on: you are hearing yourself through the speakers. Click to stop"
          : state === "blocked"
            ? "Live playback could not open the microphone. Check the app's microphone permission, then try again"
            : "Live playback: hear yourself through the speakers as you speak. Headphones keep it from feeding back"
      }
      onClick={() => (on ? stop() : start())}
    >
      🎧 <span>{label}</span>
    </button>
  );
}
