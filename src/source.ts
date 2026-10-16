// Where this visitor first came from: a ?s= (or utm_source) tag on the link, else the referring
// site, else "direct". Kept from the first visit so a later reload doesn't overwrite it.
const SOURCE_KEY = "rate-check.source.v1";

function detect(): string {
  const params = new URLSearchParams(window.location.search);
  const tagged = params.get("s") ?? params.get("utm_source");
  if (tagged) return tagged.toLowerCase().slice(0, 40);
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    if (host && host !== window.location.hostname) return host.slice(0, 40);
  } catch {
    // no referrer
  }
  return "direct";
}

export function visitSource(): string {
  try {
    const existing = localStorage.getItem(SOURCE_KEY);
    if (existing) return existing;
    const source = detect();
    localStorage.setItem(SOURCE_KEY, source);
    return source;
  } catch {
    return detect();
  }
}
