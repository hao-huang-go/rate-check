import { useEffect, useRef, useState } from "react";
import { ApiError, fetchComments, postComment, toggleCommentLike, type CommentItem } from "./api";
import { translate, type Lang, type MessageKey } from "./i18n";

type Sort = "hot" | "new";

// With a mouse, hovering the tab opens the panel and leaving it closes it after a short pause (unless
// the visitor is typing). On touch, tapping the tab opens it and the close button or backdrop closes it.
const CLOSE_DELAY_MS = 400;

function timeAgo(iso: string, lang: Lang): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return lang === "zh" ? `${minutes} 分钟前` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return lang === "zh" ? `${hours} 小时前` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return lang === "zh" ? `${days} 天前` : `${days}d ago`;
}

// A comment wall in a panel on the right edge: hover (or tap) the tab to open it, post anonymously
// or with a nickname, and like comments.
export function CommentsDrawer({ lang }: { lang: Lang }) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [sort, setSort] = useState<Sort>("hot");
  const [text, setText] = useState("");
  const [nickname, setNickname] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "error" | "rate_limited" | "link">("idle");
  const closeTimer = useRef<number | null>(null);
  const typing = useRef(false);
  const pinned = useRef(false); // opened by a click or tap: stays open until closed explicitly

  useEffect(() => {
    fetchComments().then(setComments).catch(() => setComments([]));
  }, []);

  function show() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (!typing.current && !pinned.current) setOpen(false);
    }, CLOSE_DELAY_MS);
  }

  function pin() {
    pinned.current = true;
    show();
  }

  function close() {
    pinned.current = false;
    setOpen(false);
  }

  async function like(c: CommentItem) {
    try {
      const result = await toggleCommentLike(c.id);
      setComments((cur) => (cur ?? []).map((x) => (x.id === c.id ? { ...x, ...result } : x)));
    } catch {
      // a failed like changes nothing on screen
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setStatus("busy");
    try {
      const comment = await postComment(text.trim(), nickname.trim());
      setComments((cur) => [comment, ...(cur ?? [])]);
      setText("");
      setStatus("idle");
      setSort("new");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "";
      setStatus(code === "rate_limited" ? "rate_limited" : code === "invalid" ? "link" : "error");
    }
  }

  const sorted = [...(comments ?? [])].sort((a, b) =>
    sort === "hot" ? b.likes - a.likes || b.createdAt.localeCompare(a.createdAt) : b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <>
      <button
        type="button"
        className={open ? "comments-tab hidden-tab" : "comments-tab"}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}
        onClick={pin}
        aria-expanded={open}
      >
        <span aria-hidden="true">💬</span>
        <span className="comments-tab-label">{t("comments.tab")}</span>
        {comments && comments.length > 0 && <span className="comments-count">{comments.length}</span>}
      </button>

      {open && <div className="comments-scrim" onClick={close} />}

      <aside
        className={open ? "comments-panel open" : "comments-panel"}
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={(e) => e.pointerType === "mouse" && scheduleClose()}
        aria-hidden={!open}
        aria-label={t("comments.title")}
      >
        <div className="comments-head">
          <h3>{t("comments.title")}</h3>
          <button type="button" className="comments-close" onClick={close} aria-label={t("comments.close")}>
            ×
          </button>
        </div>
        <div className="comments-sort" role="group">
          {(["hot", "new"] as Sort[]).map((s) => (
            <button key={s} type="button" className={sort === s ? "on" : ""} onClick={() => setSort(s)}>
              {t(s === "hot" ? "comments.hot" : "comments.new")}
            </button>
          ))}
        </div>

        <ol className="comments-list">
          {comments === null && <li className="comments-empty">…</li>}
          {comments !== null && sorted.length === 0 && <li className="comments-empty">{t("comments.empty")}</li>}
          {sorted.map((c) => (
            <li key={c.id} className="comment">
              <div className="comment-meta">
                <b>{c.nickname ?? t("comments.anon")}</b>
                <span>{timeAgo(c.createdAt, lang)}</span>
              </div>
              <p className="comment-body">{c.body}</p>
              {c.authorReply && (
                <p className="comment-reply">
                  <b>{t("comments.author")}</b> {c.authorReply}
                </p>
              )}
              <button type="button" className={c.liked ? "comment-like on" : "comment-like"} onClick={() => void like(c)} aria-pressed={c.liked}>
                {c.liked ? "♥" : "♡"} {c.likes > 0 ? c.likes : t("comments.like")}
              </button>
            </li>
          ))}
        </ol>

        <form className="comments-form" onSubmit={submit}>
          <textarea
            rows={3}
            maxLength={300}
            placeholder={t("comments.placeholder")}
            value={text}
            onFocus={() => (typing.current = true)}
            onBlur={() => (typing.current = false)}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="comments-form-row">
            <input
              maxLength={20}
              placeholder={t("comments.nickname")}
              value={nickname}
              onFocus={() => (typing.current = true)}
              onBlur={() => (typing.current = false)}
              onChange={(e) => setNickname(e.target.value)}
            />
            <button className="primary" disabled={status === "busy" || !text.trim()}>
              {t("comments.post")}
            </button>
          </div>
          {status === "rate_limited" && <p className="error">{t("comments.rateLimited")}</p>}
          {status === "link" && <p className="error">{t("comments.noLinks")}</p>}
          {status === "error" && <p className="error">{t("share.error")}</p>}
        </form>
      </aside>
    </>
  );
}
