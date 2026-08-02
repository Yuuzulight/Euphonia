import { useRef, useState } from "react";
import { blobToBase64 } from "../vg-bridge";

export function RecordButton({ onRecorded }: { onRecorded: () => void }) {
  const [state, setState] = useState<"idle" | "recording" | "saving" | "error">("idle");
  const [label, setLabel] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  async function stop() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType }));
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
    setState("saving");
    try {
      const audioBase64 = await blobToBase64(blob);
      await window.euphonia.createRecording({
        audioBase64,
        mimeType: blob.type,
        label: label.trim() || "untitled take",
      });
      setLabel("");
      setState("idle");
      onRecorded();
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  return (
    <div className="record-panel">
      {state === "idle" && (
        <>
          <input
            type="text"
            placeholder="what are you trying this take? ✨"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button onClick={start}>🎙️ record</button>
        </>
      )}
      {state === "recording" && (
        <button className="is-recording" onClick={stop}>⏹️ stop &amp; analyze</button>
      )}
      {state === "saving" && <span className="saving">analyzing… 💗</span>}
      {state === "error" && (
        <>
          <span className="rec-error">couldn't save that take 🌧️ — try again</span>
          <button className="retry" onClick={() => setState("idle")}>try again</button>
        </>
      )}
    </div>
  );
}
