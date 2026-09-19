/**
 * The project's bridge formula documentation, searchable.
 *
 * docs/bridge-formulas holds the team's own write-up of how RCC box culverts
 * (railway and highway), hume pipe culverts, PSC slab, composite girder and
 * open-web girder bridges are sized, levelled, drawn and checked — formula by
 * formula (RCR-GEO-001, RCR-LVL-002, …), with a master glossary, a
 * cross-reference of shared formulas and worked question/answer pairs.
 *
 * It is a working reference, not a code: it quotes IRS/RDSO/IRC practice. The
 * agent looks things up here (tool `bridge_reference`) instead of guessing a
 * formula, and says where a number came from; a limit it finds here is still
 * "requires review" until the clause is confirmed (lib/bridge/sources.ts).
 */

import { BRIDGE_DOCS } from "./corpus.generated";

export type KnowledgeKind = "formula" | "check" | "glossary" | "qa" | "section";

export interface KnowledgeEntry {
  /** Formula / check id (RCR-LVL-002), glossary symbol, or a section key. */
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  /** Source file in docs/bridge-formulas. */
  file: string;
  /** Bridge type or system the entry belongs to. */
  domain: string;
}

function parse(): KnowledgeEntry[] {
  const out: KnowledgeEntry[] = [];
  for (const doc of BRIDGE_DOCS) {
    const lines = doc.text.split("\n");
    const domain = doc.title;
    // Formula blocks: "--- FORMULA ID ---" up to the next block or section.
    for (let i = 0; i < lines.length; i++) {
      const m = /^--- FORMULA ([A-Z0-9-]+) ---$/.exec(lines[i].trim());
      if (!m) continue;
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (/^--- FORMULA /.test(l.trim()) || /^={5,}/.test(l) || (/^-{5,}$/.test(l.trim()) && j > i + 1 && /^[A-Z]/.test(lines[j - 1]))) break;
        body.push(l);
      }
      // Drop a trailing section title picked up just before its underline.
      while (body.length && (!body[body.length - 1].trim() || /^SECTION \d+:/.test(body[body.length - 1].trim()))) body.pop();
      const name = /^Name:\s*(.+)$/m.exec(body.join("\n"))?.[1]?.trim() ?? m[1];
      out.push({ id: m[1], kind: "formula", title: name, body: body.join("\n").trim(), file: doc.file, domain });
      i = j - 1;
    }
    // Validation checks: "RCR-VAL-001   condition   standard".
    for (const l of lines) {
      const m = /^([A-Z]+-VAL-\d{3})\s{2,}(.+?)\s{2,}(\S.*)$/.exec(l.trim());
      if (m) out.push({ id: m[1], kind: "check", title: m[2].trim(), body: `${m[1]}: ${m[2].trim()} — ${m[3].trim()}`, file: doc.file, domain });
    }
    // Sections and cross-reference tables, for general questions.
    for (let i = 0; i < lines.length; i++) {
      const m = /^(SECTION \d+|CROSS-REF TABLE \d+|KEY ENGINEERING CONSTANTS SUMMARY|FORMULA INVENTORY BY BRIDGE TYPE)(?::\s*(.+))?$/.exec(lines[i].trim());
      if (!m || !/^-{3,}/.test((lines[i + 1] ?? "").trim())) continue;
      const body: string[] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        if (/^(SECTION \d+|CROSS-REF TABLE \d+)/.test(lines[j].trim()) && /^-{3,}/.test((lines[j + 1] ?? "").trim())) break;
        if (/^={5,}/.test(lines[j])) break;
        body.push(lines[j]);
      }
      const title = `${domain} — ${(m[2] ?? m[1]).trim()}`;
      out.push({ id: `${doc.file.replace(/\.txt$/, "")}#${m[1].toLowerCase().replace(/\s+/g, "-")}`, kind: "section", title, body: body.join("\n").trim(), file: doc.file, domain });
    }
    if (/08-glossary/.test(doc.file)) {
      for (const l of lines) {
        const m = /^(\S+)\s{2,}(.+?)\s{2,}(\S+)\s{2,}(\S+)\s{2,}(.+)$/.exec(l.trim());
        if (!m || m[1] === "SYMBOL" || /^-+$/.test(m[1])) continue;
        out.push({ id: m[1], kind: "glossary", title: m[2].trim(), body: `${m[1]} — ${m[2].trim()} [${m[3]}] (${m[4] === "I" ? "input" : m[4] === "C" ? "computed" : m[4]}) used in ${m[5].trim()}`, file: doc.file, domain: "Glossary" });
      }
    }
    if (/10-lora/.test(doc.file)) {
      const blocks = doc.text.split(/\n-{3}\n/);
      let k = 0;
      for (const b of blocks) {
        const q = /Q:\s*([\s\S]*?)\nA:/.exec(b);
        if (!q) continue;
        const ids = /FORMULA_IDS:\s*(.+)/.exec(b)?.[1]?.trim() ?? "";
        out.push({ id: `QA-${++k}${ids ? ` (${ids})` : ""}`, kind: "qa", title: q[1].trim().replace(/\s+/g, " "), body: b.trim(), file: doc.file, domain: /DOMAIN:\s*(.+)/.exec(b)?.[1]?.trim() ?? "Q&A" });
      }
    }
  }
  return out;
}

let cache: KnowledgeEntry[] | null = null;
export function knowledgeEntries(): KnowledgeEntry[] {
  return (cache ??= parse());
}

export function findKnowledge(id: string): KnowledgeEntry | undefined {
  const k = id.trim().toUpperCase();
  return knowledgeEntries().find((e) => e.id.toUpperCase() === k);
}

const STOP = new Set(["the", "a", "an", "of", "for", "and", "or", "to", "in", "on", "is", "what", "how", "which", "with", "by", "at", "be", "it", "as", "from", "does", "do", "i"]);
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9_.-]+/).filter((t) => t.length > 1 && !STOP.has(t));

/**
 * Entries that answer a query: an exact id first (RCR-LVL-002), then by the
 * weight of the query's words in titles (heavily) and bodies, rarer words
 * counting more.
 */
export function searchKnowledge(query: string, limit = 5, kinds?: KnowledgeKind[]): KnowledgeEntry[] {
  const all = knowledgeEntries().filter((e) => !kinds || kinds.includes(e.kind));
  const exact = all.filter((e) => e.id.toUpperCase() === query.trim().toUpperCase() || e.id.toUpperCase().startsWith(query.trim().toUpperCase() + " "));
  if (exact.length) return exact.slice(0, limit);
  const qs = tokens(query);
  if (!qs.length) return [];
  const df = new Map<string, number>();
  for (const t of qs) df.set(t, all.filter((e) => e.title.toLowerCase().includes(t) || e.body.toLowerCase().includes(t)).length);
  const phrase = query.trim().toLowerCase();
  const scored = all
    .map((e) => {
      const title = e.title.toLowerCase();
      const body = e.body.toLowerCase();
      let s = 0;
      for (const t of qs) {
        const w = Math.log(1 + all.length / (1 + (df.get(t) ?? 0)));
        if (title.includes(t)) s += 3 * w;
        const n = body.split(t).length - 1;
        s += Math.min(n, 4) * w;
        if (e.id.toLowerCase() === t) s += 10;
      }
      if (phrase.length > 6 && (title.includes(phrase) || body.includes(phrase))) s *= 1.6;
      if (e.kind === "formula" || e.kind === "check") s *= 1.15;
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, limit).map((x) => x.e);
}

/** An entry as the agent reads it, trimmed. */
export function formatEntry(e: KnowledgeEntry, max = 1400): string {
  const body = e.body.length > max ? e.body.slice(0, max) + " …" : e.body;
  return `[${e.id}] ${e.title} (${e.domain}; docs/bridge-formulas/${e.file})\n${body}`;
}

export function knowledgeFiles(): { file: string; title: string }[] {
  return BRIDGE_DOCS.map((d) => ({ file: d.file, title: d.title }));
}
