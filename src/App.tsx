import { useEffect, useState } from "react";
import { ApiError, fetchHouseholdStats, fetchParticipantCount, submitHousehold, type HouseholdStats } from "./api";
import { loadBenchmark, type LoadedBenchmark } from "./benchmark";
import { FeedbackCard } from "./FeedbackCard";
import { householdTotals, type Household } from "./household";
import { HouseholdResults } from "./HouseholdResults";
import { detectLang, saveLang, translate, type Lang, type MessageKey } from "./i18n";
import { loadDraft, loadSavedHousehold, saveDraft, saveHousehold, type SavedHousehold } from "./savedHousehold";
import { visitSource } from "./source";
import { Wizard } from "./Wizard";
import { emptyDraft, type Draft } from "./wizardSteps";

interface ResultsState {
  household: Household;
  stats: HouseholdStats | null;
}

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [benchmark, setBenchmark] = useState<LoadedBenchmark | null>(null);
  const [draft, setDraft] = useState<Draft>(() => loadDraft() ?? emptyDraft());
  const [results, setResults] = useState<ResultsState | null>(null);
  const [saved, setSaved] = useState<SavedHousehold | null>(loadSavedHousehold);
  // A returning visitor goes straight to their results with fresh rankings, not the questionnaire.
  const [restoring, setRestoring] = useState(() => loadSavedHousehold() !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<number | null>(null);
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  useEffect(() => {
    visitSource();
    loadBenchmark().then(setBenchmark);
    fetchParticipantCount().then(setParticipants);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en-AU";
    document.title = translate(lang, "title");
  }, [lang]);

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    const s = loadSavedHousehold();
    if (!s) return;
    fetchHouseholdStats(s.id)
      .then((result) => setResults({ household: s.household, stats: result.stats }))
      .catch(() => setResults({ household: s.household, stats: null }))
      .finally(() => setRestoring(false));
  }, []);

  async function share(household: Household) {
    // One submission per device: show the one already made instead of sending another.
    if (saved) {
      await openSaved(saved);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await submitHousehold(household);
      setSaved(saveHousehold(result.id, household));
      setResults({ household, stats: result.stats });
      window.scrollTo({ top: 0 });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "server";
      setError(t(code === "rate_limited" ? "share.rateLimited" : code === "already_submitted" ? "share.alreadySubmitted" : "share.error"));
    } finally {
      setBusy(false);
    }
  }

  function finish(household: Household, shareIt: boolean) {
    if (shareIt) {
      void share(household);
    } else {
      setResults({ household, stats: null });
      window.scrollTo({ top: 0 });
    }
  }

  async function openSaved(s: SavedHousehold) {
    setBusy(true);
    try {
      const result = await fetchHouseholdStats(s.id);
      setResults({ household: s.household, stats: result.stats });
    } catch {
      // The submission is gone or the network failed; still show the loan analysis.
      setResults({ household: s.household, stats: null });
    } finally {
      setBusy(false);
      window.scrollTo({ top: 0 });
    }
  }

  function restart() {
    setResults(null);
    setDraft(emptyDraft());
    setError(null);
    window.scrollTo({ top: 0 });
  }

  const savedTotals = saved ? householdTotals(saved.household) : null;

  return (
    <main>
      <header>
        <div>
          <h1>{t("title")}</h1>
          <p className="subtitle">{t("subtitle")}</p>
          {!!participants && <p className="participants">{t("participants", { n: participants })}</p>}
        </div>
        <button
          className="lang"
          onClick={() => {
            const next = lang === "zh" ? "en" : "zh";
            setLang(next);
            saveLang(next);
          }}
        >
          {t("langToggle")}
        </button>
      </header>

      {!benchmark || restoring ? (
        <div className="card loading" />
      ) : results ? (
        <HouseholdResults
          lang={lang}
          benchmark={benchmark}
          household={results.household}
          stats={results.stats}
          onShare={() => void share(results.household)}
          sharing={busy}
          onRestart={restart}
        />
      ) : (
        <>
          <Wizard
            lang={lang}
            lenders={benchmark.lenders}
            draft={draft}
            onChange={setDraft}
            onFinish={finish}
            busy={busy}
            error={error}
          />
          {saved && savedTotals && (
            <section className="saved">
              <p className="wz-label">{t("saved.title")}</p>
              <button className="saved-row" disabled={busy} onClick={() => void openSaved(saved)}>
                <span>
                  <b>{t("saved.income", { amount: `$${Math.round(savedTotals.income / 1000)}k` })}</b>
                  <small>
                    {t("saved.summary", { members: saved.household.members.length, properties: saved.household.properties.length })}
                  </small>
                </span>
                <span className="saved-go">{t("saved.open")} →</span>
              </button>
            </section>
          )}
          <FeedbackCard lang={lang} page="form" startOpen={false} />
        </>
      )}

      {benchmark && <footer>{t("footer", { date: new Date(benchmark.fetchedAt).toLocaleDateString("en-AU") })}</footer>}
    </main>
  );
}
