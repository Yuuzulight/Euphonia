import { useEffect, useState } from "react";
import type { GeneratedInsight as GeneratedInsightData, Recording } from "../types";
import { InsightCard } from "../annotations/lib/InsightCard";
import { Drill } from "../annotations/lib/Drill";

export function GeneratedInsight({ recording }: { recording: Recording }) {
  const [insight, setInsight] = useState<GeneratedInsightData | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating" | "error">("loading");
  const [canUpgrade, setCanUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeFailed, setUpgradeFailed] = useState(false);

  useEffect(() => {
    setStatus("loading");
    setUpgradeFailed(false);
    window.euphonia.insights
      .get(recording.id)
      .then((cached) => {
        setInsight(cached);
        setStatus("idle");
      })
      .catch((e) => {
        console.error(e);
        setInsight(null);
        setStatus("idle");
      });
  }, [recording.id]);

  // If this recording's cached insight is the free template version, check
  // whether a Gemini key has since been added — if so, offer to upgrade to
  // the richer, personalized version. Only relevant for template insights;
  // a Gemini-sourced insight is already the richer version.
  useEffect(() => {
    if (insight?.source !== "template") {
      setCanUpgrade(false);
      return;
    }
    let alive = true;
    window.euphonia.settings.getStatus().then(({ hasKey }) => {
      if (alive) setCanUpgrade(hasKey);
    });
    return () => {
      alive = false;
    };
  }, [insight]);

  // The default path (Gemini if a key works, template otherwise) never
  // throws — there's always an instant fallback, since getting an insight
  // shouldn't require any setup. A genuinely unexpected failure (e.g. disk
  // write error) still lands here and shows a retry-able error state.
  async function generate() {
    setStatus("generating");
    try {
      const result = await window.euphonia.insights.generate(recording);
      setInsight(result);
      setStatus("idle");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }

  async function upgrade() {
    setUpgrading(true);
    setUpgradeFailed(false);
    try {
      const result = await window.euphonia.insights.regenerateWithGemini(recording);
      setInsight(result);
    } catch (e) {
      console.error(e);
      setUpgradeFailed(true);
    } finally {
      setUpgrading(false);
    }
  }

  if (status === "loading") return null;

  if (insight) {
    return (
      <InsightCard title={insight.focus_area} badges={insight.strengths}>
        <p>{insight.summary}</p>
        <Drill title="Try this">{insight.tip}</Drill>
        {canUpgrade && (
          <p style={{ marginTop: 12, fontSize: 12.5 }}>
            <button onClick={upgrade} disabled={upgrading}>
              {upgrading ? "writing…" : "✨ upgrade to an AI-written insight"}
            </button>
            {upgradeFailed && <span> couldn't reach Gemini 🌧️ — try again later.</span>}
          </p>
        )}
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
