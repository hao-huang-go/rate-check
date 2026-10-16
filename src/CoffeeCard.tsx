import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
}

const COFFEE_URL = "https://buymeacoffee.com/tyah0510";

export function CoffeeCard({ lang }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  return (
    <section className="card coffee">
      <p className="coffee-text">
        <b>{t("coffee.title")}</b> {t("coffee.body")}
      </p>
      <div className="coffee-actions">
        <a className="secondary" href={COFFEE_URL} target="_blank" rel="noopener noreferrer">
          ☕ {t("coffee.button")}
        </a>
        <button
          type="button"
          className="link-muted"
          onClick={() => document.getElementById("feedback")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          {t("coffee.feedback")}
        </button>
      </div>
    </section>
  );
}
