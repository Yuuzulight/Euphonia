import { useEffect, useState } from "react";
import type { Recording, ReferenceVoice } from "./types";
import {
  PITCH_ZONES,
  LOUD_ZONES,
  SD_ZONES,
  HNR_ZONES,
  JITTER_ZONES,
  WEIGHT_ZONES,
  MELODY_ZONES,
  FEM,
  zoneOf,
  zoneColor,
  fmt,
  type Zone,
} from "./zones";
import { StatCard } from "./components/StatCard";
import { MetricModal } from "./components/MetricModal";
import { METRICS, type MetricKey } from "./metrics";
import { ResonanceCard } from "./components/ResonanceCard";
import { LineChart, type Point } from "./components/LineChart";
import { useThemeColors } from "./theme/ThemeProvider";
import { RecordingCard } from "./components/RecordingCard";
import { CheatSheet } from "./components/CheatSheet";
import { RegisterSection } from "./components/RegisterSection";
import { RecordButton } from "./components/RecordButton";
import { ThemeToggle } from "./components/ThemeToggle";
import { TitleBar } from "./components/TitleBar";
import { UpdateBanner } from "./components/UpdateBanner";
import { GeneratedInsight } from "./components/GeneratedInsight";
import { OnboardingModal } from "./components/OnboardingModal";
import { EngineStatusBadge } from "./components/EngineStatusBadge";
import { isBrowserMode } from "./browser/installBridge";
import { loadRecordingsWithAudio } from "./browser/browserBridge";
import {
  AnnotationsProvider,
  Note,
  Region,
} from "./annotations/AnnotationsProvider";
import {
  EuphoniaIcon,
  BowIcon,
  SparkleIcon,
  ContourIcon,
  InsightIcon,
  TrendsIcon,
  CardsIcon,
  BulbIcon,
} from "./components/icons";

export function App() {
  const colors = useThemeColors();
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [references, setReferences] = useState<ReferenceVoice[]>([]);
  // which metric's reference modal is open + the card rect it grew from
  const [modal, setModal] = useState<{ key: MetricKey; rect: DOMRect } | null>(
    null,
  );
  const [showOnboarding, setShowOnboarding] = useState(false);

  function refetchRecordings() {
    const load = isBrowserMode
      ? loadRecordingsWithAudio()
      : fetch(`${import.meta.env.BASE_URL}recordings.json?t=${Date.now()}`).then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        });
    load
      .then((data: Recording[]) => setRecordings([...data].sort((a, b) => a.id - b.id)))
      .catch((e) => setError(String(e)));
  }

  useEffect(refetchRecordings, []);

  // auto-hiding scrollbar: fades in while actively scrolling (see
  // html.is-scrolling in index.css), fades back out shortly after.
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;
    function onScroll() {
      document.documentElement.classList.add("is-scrolling");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        document.documentElement.classList.remove("is-scrolling");
      }, 900);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(hideTimer);
    };
  }, []);

  async function handleDeleteRecording(id: number) {
    await window.euphonia.deleteRecording(id);
    if (selectedId === id) setSelectedId(null);
    refetchRecordings();
  }

  // No proactive first-launch prompt: insights work instantly with no key
  // (see GeneratedInsight/insights.ts — Gemini is an opt-in upgrade, not a
  // requirement), so there's nothing that needs setting up before the app
  // is usable. The key setup screen stays reachable any time via the
  // Settings button below.

  // reference voices (real men/women) — degrade gracefully if missing.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}reference.json?t=${Date.now()}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ReferenceVoice[]) =>
        setReferences(Array.isArray(data) ? data : []),
      )
      .catch(() => setReferences([]));
  }, []);

  const openModal = (key: MetricKey, rect: DOMRect) => setModal({ key, rect });

  const R = recordings ?? [];
  const latest = R.length ? R[R.length - 1] : null;
  // the recording currently in focus (defaults to the latest)
  const active =
    (selectedId != null ? R.find((r) => r.id === selectedId) : null) ?? latest;
  const pz = active ? zoneOf(PITCH_ZONES, active.pitch.mean_hz) : null;
  const isLatest = active && latest && active.id === latest.id;

  const mk = (sel: (r: Recording) => number | null): Point[] =>
    R.map((r) => ({ label: r.id, y: sel(r) }));

  return (
    <>
      {!isBrowserMode && <TitleBar />}
      {!isBrowserMode && <UpdateBanner />}
      {isBrowserMode && <EngineStatusBadge />}
      <div className="wrap">
      <header className="hero">
        <div style={{ position: "relative" }}>
          <div className="hero-text">
            <h1>
              <EuphoniaIcon title="Euphonia" /> Euphonia
            </h1>
            <p>finding the sound that feels like you 💗✨</p>
          </div>
          <div style={{ position: "absolute", top: 0, right: 0, display: "flex", gap: 6 }}>
            <ThemeToggle />
            <button
              className="settings-btn"
              onClick={() => setShowOnboarding(true)}
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>
        {active && (
          <div className="latest-banner">
            💗 <b>#{active.id}</b> &middot; {active.label} &middot;{" "}
            <span style={{ color: "var(--ink-soft)" }}>{active.date}</span>
          </div>
        )}
      </header>

      <RecordButton onRecorded={refetchRecordings} />

      {error && (
        <div className="empty">
          couldn't load recordings 🌧️
          <br />
          {error}
        </div>
      )}

      {/* recording switcher */}
      {R.length > 1 && (
        <div className="picker">
          <span className="picker-label">viewing:</span>
          {[...R].reverse().map((r) => (
            <button
              key={r.id}
              className={active && r.id === active.id ? "active" : ""}
              onClick={() => setSelectedId(r.id)}
            >
              #{r.id} · {r.label}
              {latest && r.id === latest.id ? " 🌟" : ""}
            </button>
          ))}
        </div>
      )}

      {active && (
        <AnnotationsProvider recording={active}>
          <Region id="region.top" />

          {/* 🎀 This take */}
          <section>
            <h2 className="section-title">
              <BowIcon /> {isLatest ? "Latest take" : `Take #${active.id}`}
            </h2>
            <p className="take-hint">
              🔍 tap any card with a colored bar to see how you compare to real
              voices
            </p>
            <div className="stat-grid">
              <StatCard
                title="Pitch (avg)"
                value={active.pitch.mean_hz}
                unit="Hz"
                zones={PITCH_ZONES}
                lo={100}
                hi={260}
                metricKey="pitch"
                onExpand={openModal}
                sub={
                  <Note id="note.pitch">
                    {pz ? (
                      <>
                        you're in the <b>{pz.name}</b> zone — 165 Hz+ reads
                        feminine to most ears 💕
                      </>
                    ) : (
                      ""
                    )}
                  </Note>
                }
              />
              <StatCard
                title="Pitch range"
                value={active.pitch.range_hz}
                unit="Hz"
                sub={
                  <>
                    {fmt(active.pitch.min_hz)}–{fmt(active.pitch.max_hz)} Hz ·
                    wider = more melodic & expressive
                  </>
                }
              />
              <StatCard
                title="Loudness"
                value={active.intensity.mean_db}
                unit="dB"
                zones={LOUD_ZONES}
                lo={45}
                hi={78}
                metricKey="loudness"
                onExpand={openModal}
                sub={
                  <Note id="note.loudness">
                    louder = more present & confident 📣
                  </Note>
                }
              />
              <StatCard
                title="Pitch variability"
                value={active.pitch.sd_hz}
                unit="Hz"
                zones={SD_ZONES}
                lo={0}
                hi={60}
                metricKey="sd"
                onExpand={openModal}
                sub="how much your melody moves · ~20–40 Hz is lively, natural speech"
              />
              <StatCard
                title="Clarity (HNR)"
                value={active.voice_quality.hnr_db}
                unit="dB"
                zones={HNR_ZONES}
                lo={0}
                hi={30}
                metricKey="hnr"
                onExpand={openModal}
                sub="higher = clearer, lower = breathier · runs lower on full passages than a held vowel"
              />
              <StatCard
                title="Steadiness (jitter)"
                value={active.voice_quality.jitter_pct}
                unit="%"
                zones={JITTER_ZONES}
                lo={0}
                hi={3}
                metricKey="jitter"
                onExpand={openModal}
                sub={
                  <>
                    lower = steadier · shimmer{" "}
                    {fmt(active.voice_quality.shimmer_pct)}% (under ~3.8% is
                    steady)
                  </>
                }
              />
              <StatCard
                title="Weight"
                value={active.weight?.h1a3c_db ?? null}
                unit="dB"
                zones={WEIGHT_ZONES}
                lo={0}
                hi={20}
                metricKey="weight"
                onExpand={openModal}
                sub={
                  <Note id="note.weight">
                    source spectral tilt (corrected H1*–A3*) — the <i>thickness</i>{" "}
                    of the voice itself (separate from pitch & resonance) · lighter
                    leans feminine. <b>Heads up:</b> weight is hard to pin to a
                    gender across people (lots of overlap), so it's most useful as{" "}
                    <b>your own change over time</b>, not a vs-others verdict.
                  </Note>
                }
              />
            </div>
          </section>

          <Region id="region.afterLatest" />

          {/* ✨ Resonance */}
          <section>
            <h2 className="section-title">
              <SparkleIcon /> Resonance{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                · the "size" your voice sounds, separate from pitch
              </span>
            </h2>
            <ResonanceCard r={active} onExpand={openModal} />
          </section>

          <Region id="region.afterResonance" />

          {/* 🎚️ Register & phrasing */}
          <section>
            <h2 className="section-title">
              <ContourIcon /> Register &amp; phrasing{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                · where your voice holds vs. falls out of register
              </span>
            </h2>
            <RegisterSection />
          </section>

          <Region id="region.afterRegister" />

          {/* 🔍 Insights for this take */}
          <section>
            <h2 className="section-title">
              <InsightIcon /> Insights for this take{" "}
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                · custom analysis of what to work on next
              </span>
            </h2>
            <GeneratedInsight recording={active} />
          </section>

          <Region id="region.bottom" />
        </AnnotationsProvider>
      )}

      {/* 📈 Trends over time (across all recordings) */}
      <section>
        <h2 className="section-title">
          <TrendsIcon /> Trends over time
        </h2>
        <div className="chart-grid">
          {R.length < 2 && (
            <p className="cap" style={{ gridColumn: "1/-1", margin: "0 0 4px" }}>
              add another recording to watch your trends take shape ✨
            </p>
          )}
          <ChartCard
            h="Pitch (avg)"
            cap="pink band = feminine zone (165 Hz+)"
            color={colors.chart1}
            data={mk((r) => r.pitch.mean_hz)}
            band={[165, 260]}
            bandColor={zoneColor(FEM, colors)}
          />
          <ChartCard
            h="In-register melody"
            cap="true expressiveness, crashes removed (st)"
            color={colors.chart2}
            data={mk((r) => r.register?.in_register_semitones_sd ?? null)}
            bands={MELODY_ZONES}
          />
          <ChartCard
            h="Phrase endings landed"
            cap="% of phrases that stayed in register"
            color={colors.chart3}
            data={mk((r) => r.register?.phrases_landed_pct ?? null)}
            band={[80, 100]}
            bandColor={colors.chart3Band}
          />
          <ChartCard
            h="Resonance (F2)"
            cap="brightness / vocal-tract size cue"
            color={colors.chart4}
            data={mk((r) => r.formants.f2_hz)}
            band={[1850, 2400]}
            bandColor={colors.accent2}
          />
          <ChartCard
            h="Weight"
            cap="spectral tilt · lower = lighter / more feminine"
            color={colors.chart5}
            data={mk((r) => r.weight?.h1a3c_db ?? null)}
            bands={WEIGHT_ZONES}
          />
        </div>
      </section>

      {/* 📖 All recordings */}
      <section>
        <h2 className="section-title">
          <CardsIcon /> All recordings
        </h2>
        <div className="rec-grid">
          {R.length === 0 ? (
            <div className="empty">
              no recordings yet 💗
              <br />
              run the analyzer to add your first one!
            </div>
          ) : (
            [...R].reverse().map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{ cursor: "pointer" }}
                title="click to view this take above"
              >
                <RecordingCard r={r} onDelete={() => handleDeleteRecording(r.id)} />
              </div>
            ))
          )}
        </div>
      </section>

      {/* 💡 Cheat sheet */}
      <section>
        <h2 className="section-title">
          <BulbIcon /> What do these mean?
        </h2>
        <CheatSheet />
      </section>

      <footer>
        made with 🩷 &middot; numbers are a compass, not a judge &middot; your ears
        matter most
      </footer>

      {modal && (
        <MetricModal
          metric={METRICS[modal.key]}
          recordings={R}
          references={references}
          activeId={active?.id ?? null}
          origin={modal.rect}
          onClose={() => setModal(null)}
        />
      )}

      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onAllDeleted={() => {
          setSelectedId(null);
          refetchRecordings();
        }}
      />
      </div>
    </>
  );
}

interface ChartCardProps {
  h: string;
  cap: string;
  color: string;
  data: Point[];
  band?: [number, number];
  bandColor?: string;
  bands?: Zone[];
}

function ChartCard({ h, cap, color, data, band, bandColor, bands }: ChartCardProps) {
  const colors = useThemeColors();
  // bands come in as zone keys (see zones.ts) — resolve each to this theme's
  // actual color before handing them to LineChart, which just wants hex.
  const resolvedBands = bands?.map((z) => ({
    from: z.from,
    to: z.to,
    color: zoneColor(z.color, colors),
  }));
  return (
    <div className="chart-card">
      <h3>{h}</h3>
      <p className="cap">{cap}</p>
      <LineChart
        points={data}
        color={color}
        band={band}
        bandColor={bandColor}
        bands={resolvedBands}
      />
    </div>
  );
}
