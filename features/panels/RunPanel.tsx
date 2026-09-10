"use client";

/**
 * The PROJECT ENGINEER dock — UPCE-MASTER-1.0 §64, §16 of the repair brief.
 *
 * "There must be no mystery about which values a user can actually change."
 *
 * So this panel renders the PUBLISHED MANIFEST and nothing else. If the author
 * did not publish a value, it does not appear — not greyed out, not in an
 * advanced section, not at all. That is the fix for the original complaint that
 * the parameter list mixed `Width` with `R1.width` and `R2.width` and gave no
 * way to tell which of them a user was supposed to touch.
 *
 * §64 also fixes what this persona must never encounter: "They do NOT see
 * constraints, the DCEL, a Jacobian, a formula DAG, or PlaneGCS." A derived row
 * therefore shows its RESULT and the named inputs behind it, never the
 * expression.
 */

import React from "react";
import { SlidersHorizontal, Lock, TriangleAlert, ShieldCheck } from "lucide-react";
import { useUpce } from "../parametric/upceContext";
import { PanelBody, Empty } from "./DraftPanel";
import type { ManifestEntry } from "@/lib/upce/template";

/**
 * Representative IRC practice minima (§26). These ship as advisory metadata
 * marked unverified until a human confirms the clause against the current
 * official edition — the UI says so rather than implying the number is
 * authoritative. They never block: the canvas still updates.
 */
function advisoryFor(entry: ManifestEntry): string | undefined {
  const n = entry.name.toLowerCase();
  if (entry.unit !== "mm") return undefined;
  if (/wall|side/.test(n) && entry.value < 250) {
    return "Below the 250 mm practice minimum · IRC:SP:13 (unverified profile)";
  }
  if (/slab|end|deck/.test(n) && entry.value < 200) {
    return "Below the 200 mm practice minimum · IRC:SP:13 (unverified profile)";
  }
  return undefined;
}

function Field({ entry }: { entry: ManifestEntry }) {
  const { setParameterValue } = useUpce();
  const [draft, setDraft] = React.useState(String(entry.value));
  const [focused, setFocused] = React.useState(false);
  const advisory = advisoryFor(entry);

  React.useEffect(() => {
    if (!focused) setDraft(String(entry.value));
  }, [entry.value, focused]);

  const outOfRange =
    (entry.min !== undefined && entry.value < entry.min) ||
    (entry.max !== undefined && entry.value > entry.max);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`p-${entry.name}`} className="text-[11.5px] text-(--fg-secondary) truncate">
          {entry.name}
        </label>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            id={`p-${entry.name}`}
            value={draft}
            inputMode="decimal"
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              const v = Number(draft);
              if (Number.isFinite(v) && v !== entry.value) setParameterValue(entry.name, v);
              else setDraft(String(entry.value));
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setDraft(String(entry.value));
                e.currentTarget.blur();
              }
            }}
            className={[
              "num w-[78px] h-[26px] px-2 text-right text-[12px] rounded-[5px]",
              "bg-(--ink-raised) text-(--fg-primary) border outline-none transition-colors duration-100",
              advisory || outOfRange ? "border-(--warn)" : "border-(--rule) focus:border-(--pen)",
            ].join(" ")}
          />
          <span className="text-[10px] text-(--fg-muted) w-[24px]">{entry.unit}</span>
        </div>
      </div>

      {(entry.min !== undefined || advisory) && (
        <p
          className={`text-[10px] leading-snug flex items-start gap-1 ${
            advisory ? "text-(--warn)" : "text-(--fg-muted)"
          }`}
        >
          {advisory && <TriangleAlert className="w-[10px] h-[10px] mt-[1px] shrink-0" strokeWidth={2.2} />}
          {advisory ??
            (entry.min !== undefined && entry.max !== undefined
              ? `${entry.min} – ${entry.max} ${entry.unit}`
              : "")}
        </p>
      )}

      {entry.affects.length > 0 && (
        <p className="text-[10px] text-(--fg-muted)">Moves {entry.affects.join(", ")}.</p>
      )}
    </div>
  );
}

export function RunPanel() {
  const { manifest, invariants, notice } = useUpce();

  if (!manifest) {
    return (
      <PanelBody>
        <Empty
          icon={SlidersHorizontal}
          title="No template published yet"
          body="A project engineer sees only the values a template author chose to expose. Switch to Author, work through the steps, and publish — then those values appear here and nothing else does."
        />
      </PanelBody>
    );
  }

  const groups = new Map<string, ManifestEntry[]>();
  for (const d of manifest.driving) {
    const arr = groups.get(d.group) ?? [];
    arr.push(d);
    groups.set(d.group, arr);
  }

  const broken = invariants.filter((i) => !i.ok);

  return (
    <PanelBody>
      <div>
        <p className="text-[12px] font-medium text-(--fg-primary)">{manifest.name}</p>
        <p className="text-[10.5px] text-(--fg-muted)">
          version {manifest.version} · {manifest.driving.length} value
          {manifest.driving.length === 1 ? "" : "s"} you can change
        </p>
      </div>

      {notice?.kind === "error" && (
        <div className="rounded-[6px] border border-(--crit) bg-(--crit-soft) px-2.5 py-2">
          <p className="text-[11px] leading-[1.5] text-(--crit)">{notice.text}</p>
        </div>
      )}

      {[...groups.entries()].map(([group, entries]) => (
        <section key={group} className="flex flex-col gap-2.5">
          <h3 className="label">{group}</h3>
          {entries.map((e) => (
            <Field key={e.name} entry={e} />
          ))}
        </section>
      ))}

      {manifest.derived.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="label">Worked out for you</h3>
          <div className="rounded-[6px] border border-(--rule) overflow-hidden">
            {manifest.derived.map((d, i) => (
              <div
                key={d.name}
                className={`flex items-center justify-between gap-2 px-2.5 h-[30px] ${
                  i > 0 ? "border-t border-(--rule)" : ""
                }`}
              >
                <span className="text-[11.5px] text-(--fg-secondary) inline-flex items-center gap-1.5 min-w-0">
                  <Lock className="w-[10px] h-[10px] text-(--fg-muted) shrink-0" strokeWidth={2.2} />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="num text-[12px] text-(--fg-primary) shrink-0">
                  {d.value.toFixed(1)}
                  <span className="text-(--fg-muted) ml-1 text-[10px]">{d.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="label">What this drawing keeps true</h3>
        <div
          className={`rounded-[6px] border px-2.5 py-2 flex items-start gap-2 ${
            broken.length === 0 ? "border-(--ok) bg-(--ok-soft)" : "border-(--crit) bg-(--crit-soft)"
          }`}
        >
          {broken.length === 0 ? (
            <ShieldCheck className="w-[13px] h-[13px] mt-[1px] shrink-0 text-(--ok)" strokeWidth={2.1} />
          ) : (
            <TriangleAlert className="w-[13px] h-[13px] mt-[1px] shrink-0 text-(--crit)" strokeWidth={2.1} />
          )}
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-medium ${broken.length === 0 ? "text-(--ok)" : "text-(--crit)"}`}>
              {broken.length === 0
                ? `All ${invariants.length} relationship${invariants.length === 1 ? "" : "s"} hold at these values.`
                : `${broken.length} relationship${broken.length === 1 ? "" : "s"} no longer hold.`}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {(broken.length > 0
                ? broken.map((b) => b.label)
                : manifest.invariants
              )
                .slice(0, 6)
                .map((label, i) => (
                  <li key={i} className="text-[10.5px] leading-snug text-(--fg-secondary)">
                    · {label}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </section>
    </PanelBody>
  );
}
