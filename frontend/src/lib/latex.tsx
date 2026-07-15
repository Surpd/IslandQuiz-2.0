// Renders text that may contain LaTeX between \( ... \) or \[ ... \].
// Small wrapper around katex so we don't ship MathJax runtime.

import katex from "katex";
import { useMemo } from "react";

function renderSegment(text: string, display: boolean): string {
  try {
    return katex.renderToString(text, {
      throwOnError: false,
      displayMode: display,
      strict: "ignore",
    });
  } catch {
    return text;
  }
}

function toHtml(source: string): string {
  if (!source) return "";
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Alternate between text and formula segments.
  const regex = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;
  let last = 0;
  let out = "";
  let m: RegExpExecArray | null;
  while ((m = regex.exec(source))) {
    out += escapeHtml(source.slice(last, m.index)).replace(/\n/g, "<br/>");
    if (m[1] !== undefined) out += renderSegment(m[1], true);
    else if (m[2] !== undefined) out += renderSegment(m[2], false);
    last = m.index + m[0].length;
  }
  out += escapeHtml(source.slice(last)).replace(/\n/g, "<br/>");
  return out;
}

export function LaTeX({ children, className }: { children: string; className?: string }) {
  const html = useMemo(() => toHtml(children ?? ""), [children]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
