import { useState } from "react";
import { ApiError, sendFeedback, type FeedbackWant } from "./api";
import { translate, type Lang, type MessageKey } from "./i18n";

interface Props {
  lang: Lang;
  page: "form" | "result";
  startOpen: boolean;
}

const WANTS: FeedbackWant[] = ["net_worth", "rate_alerts", "fixed_expiry", "broker_compare", "investor", "other"];
const MAX_MESSAGE = 1000;

type Status = "idle" | "busy" | "done" | "error" | "rate_limited" | "empty";

export function FeedbackCard({ lang, page, startOpen }: Props) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [open, setOpen] = useState(startOpen);
  const [wants, setWants] = useState<FeedbackWant[]>([]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  if (!open) {
    return (
      <button className="ghost feedback-toggle" onClick={() => setOpen(true)}>
        {t("fb.open")}
      </button>
    );
  }

  if (status === "done") {
    return (
      <section className="card feedback" id="feedback">
        <h3>{t("fb.thanksTitle")}</h3>
        <p className="sub">{t("fb.thanks")}</p>
      </section>
    );
  }

  function toggle(w: FeedbackWant) {
    setWants((current) => (current.includes(w) ? current.filter((x) => x !== w) : [...current, w]));
  }

  async function submit() {
    if (!wants.length && !message.trim()) {
      setStatus("empty");
      return;
    }
    setStatus("busy");
    try {
      await sendFeedback({ wants, message: message.trim() || null, lang, page });
      setStatus("done");
    } catch (e) {
      setStatus(e instanceof ApiError && e.code === "rate_limited" ? "rate_limited" : "error");
    }
  }

  return (
    <section className="card feedback" id="feedback">
      <h3>{t("fb.title")}</h3>
      <fieldset className="field">
        <legend className="sr-only">{t("fb.title")}</legend>
        <div className="segmented">
          {WANTS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={wants.includes(w)}
              className={wants.includes(w) ? "on" : ""}
              onClick={() => toggle(w)}
            >
              {t(`fb.want.${w}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>{t("fb.message")}</span>
        <textarea
          id={`feedback-message-${page}`}
          rows={3}
          maxLength={MAX_MESSAGE}
          placeholder={t("fb.placeholder")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </label>
      {status === "empty" && <p className="error">{t("fb.empty")}</p>}
      {status === "error" && <p className="error">{t("share.error")}</p>}
      {status === "rate_limited" && <p className="error">{t("share.rateLimited")}</p>}
      <button className="primary" disabled={status === "busy"} onClick={submit}>
        {status === "busy" ? t("share.busy") : t("fb.submit")}
      </button>
      <p className="note">{t("fb.anon")}</p>
    </section>
  );
}
