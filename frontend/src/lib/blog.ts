const IMG_RE = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/;
const HTML_IMG_RE = /<img[^>]+src=["']([^"']+)["']/i;

export function firstImage(body: string): string | null {
  const m = body.match(IMG_RE) || body.match(HTML_IMG_RE);
  return m ? m[1] : null;
}

export function excerpt(body: string, max = 220): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > max ? stripped.slice(0, max).trimEnd() + "…" : stripped;
}

export function readingTime(body: string): number {
  const words = body.replace(/```[\s\S]*?```/g, "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
