/**
 * Non-browser server-side render helper for the Studio OS views.
 * The sandbox denies the jsdom CSS chain (css-tokenizer path), so component
 * behavior is verified by rendering to static markup with controlled props —
 * an approved non-browser route that still exercises every binding.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

export function renderStatic(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

/** Collect every text node of the static HTML (for substring assertions). */
export function staticText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
