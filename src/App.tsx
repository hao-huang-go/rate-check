import { useEffect, useMemo, useState } from "react";
import { loadBenchmark, type LoadedBenchmark } from "./benchmark";
import { breakdown, compare, type LoanProfile } from "./compare";
import { FeedbackCard } from "./FeedbackCard";
import { detectLang, saveLang, translate, type Lang, type MessageKey } from "./i18n";
import { LoanForm } from "./LoanForm";
import { Result } from "./Result";
import { loadSaved, sameProfile, saveSubmission, type SavedSubmission } from "./savedSubmission";

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [benchmark, setBenchmark] = useState<LoadedBenchmark | null>(null);
  const [profile, setProfile] = useState<LoanProfile | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [saved, setSaved] = useState<SavedSubmission | null>(loadSaved);
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  useEffect(() => {
    loadBenchmark().then(setBenchmark);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en-AU";
    document.title = translate(lang, "title");
  }, [lang]);

  const comparison = useMemo(
    () => (benchmark && profile ? compare(benchmark, profile) : null),
    [benchmark, profile],
  );
  const criteria = useMemo(
    () => (benchmark && profile ? breakdown(benchmark, profile) : null),
    [benchmark, profile],
  );

  function handleSubmit(next: LoanProfile) {
    setProfile(next);
    setShowResult(true);
    window.scrollTo({ top: 0 });
  }

  return (
    <main>
      <header>
        <div>
          <h1>{t("title")}</h1>
          <p className="subtitle">{t("subtitle")}</p>
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

      {!benchmark ? (
        <div className="card loading" />
      ) : showResult && profile && comparison && criteria ? (
        <Result
          lang={lang}
          profile={profile}
          comparison={comparison}
          breakdown={criteria}
          savedId={saved && sameProfile(saved.profile, profile) ? saved.id : null}
          onSubmitted={(id) => setSaved(saveSubmission(id, profile))}
          onRestart={() => setShowResult(false)}
        />
      ) : (
        <>
          {saved && (
            <button className="saved-banner" onClick={() => handleSubmit(saved.profile)}>
              {t("saved.banner")} →
            </button>
          )}
          {showResult && profile && !comparison && <p className="error card">{t("noMatch")}</p>}
          <LoanForm lang={lang} lenders={benchmark.lenders} initial={profile} onSubmit={handleSubmit} />
          <FeedbackCard lang={lang} page="form" startOpen={false} />
        </>
      )}

      {benchmark && (
        <footer>{t("footer", { date: new Date(benchmark.fetchedAt).toLocaleDateString("en-AU") })}</footer>
      )}
    </main>
  );
}
