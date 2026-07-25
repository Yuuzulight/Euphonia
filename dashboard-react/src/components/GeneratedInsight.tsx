import { useEffect, useState } from "react";
import type { GeneratedInsight as GeneratedInsightData, Recording } from "../types";
import { InsightCard } from "../annotations/lib/InsightCard";
import { Drill } from "../annotations/lib/Drill";

export function GeneratedInsight({
  recording,
  onNeedsApiKey,
}: {
  recording: Recording;
  onNeedsApiKey: () => void;
}) {
  const [insight, setInsight] = useState<GeneratedInsightData | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
    window.euphonia.insights.get(recording.id).then((cached) => {
      setInsight(cached);
      setStatus("idle");
    });
  }, [recording.id]);

  async function generate() {
    setStatus("generating");
    try {
      const result = await window.euphonia.insights.generate(recording);
      setInsight(result);
      setStatus("idle");
    } catch (e) {
      if (e instanceof Error && e.message.includes("NO_API_KEY")) {
        onNeedsApiKey();
        setStatus("idle");
      } else {
        console.error(e);
        setStatus("error");
      }
    }
  }

  if (status === "loading") return null;

  if (insight) {
    return (
      <InsightCard
        title={insight.focus_area}
        badges={insight.strengths}
      >
        <p>{insight.summary}</p>
        <Drill title="Try this">{insight.tip}</Drill>
      </InsightCard>
    );
  }

  return (
    <div className="insight-placeholder">
      ✍️ no insight for take #{recording.id} yet.
      <br />
      <button onClick={generate} disabled={status === "generating"}>
        {status === "generating" ? "writing…" : "✨ generate insight"}
      </button>
      {status === "error" && <p>couldn't generate that insight 🌧️ — try again</p>}
    </div>
  );
}
