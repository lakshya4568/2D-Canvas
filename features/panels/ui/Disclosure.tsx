"use client";

/**
 * Panel primitives: a collapsible group, a status pill, a compact stat row.
 *
 * The authoring panel grew one section at a time — Step 4, then 4b, then 4c,
 * then 4d — until it was a column of twelve headings all shouting at once, with
 * the one thing a draftsman checks constantly (how much freedom is left)
 * scrolled off the top. Numbering sections `4b` is what that looks like from the
 * inside: it means the structure stopped describing the work some time ago.
 *
 * So the panel is grouped instead, and the groups close. Two rules make that
 * work rather than just hiding things:
 *
 *   THE STATUS NEVER CLOSES. Whatever else is collapsed, the drawing's state is
 *   on screen. A collapsed panel must never be able to hide that something is
 *   wrong, so a group that needs attention shows a dot in its header even when
 *   shut.
 *
 *   OPEN STATE PERSISTS. A draftsman arranges the panel for the job in front of
 *   them; re-collapsing it on every render would make the arrangement worthless.
 *   It is per-group and per-browser, and a failure to read it back is silent —
 *   a preference is not worth an error.
 */

import React from "react";
import { ChevronRight } from "lucide-react";

const STORE_PREFIX = "upce.panel.open.";

function readOpen(id: string, fallback: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + id);
    return raw === null ? fallback : raw === "1";
  } catch {
    // Private windows and blocked site data both throw here. A remembered
    // preference is a convenience; losing it must not break the panel.
    return fallback;
  }
}

export type GroupTone = "neutral" | "attention" | "good" | "bad";

const DOT: Record<GroupTone, string> = {
  neutral: "",
  attention: "bg-(--warn)",
  good: "bg-(--ok)",
  bad: "bg-(--crit)",
};

/**
 * One collapsible group.
 *
 * `tone` is the whole reason this is not a plain `<details>`: a group that is
 * shut still has to be able to say "there is something in here", or collapsing
 * becomes a way to miss a conflict.
 */
export function Group({
  id,
  title,
  count,
  tone = "neutral",
  defaultOpen = false,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number | string;
  tone?: GroupTone;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Read on mount rather than during render: `localStorage` is not available on
  // the server, and a first paint that disagrees with the client is a hydration
  // mismatch.
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => {
    setOpen(readOpen(id, defaultOpen));
  }, [id, defaultOpen]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORE_PREFIX + id, next ? "1" : "0");
    } catch {
      /* preference only */
    }
  };

  return (
    <section className="border-b border-(--rule) last:border-b-0">
      <div className="flex items-stretch">
        <button
          onClick={toggle}
          aria-expanded={open}
          className="flex-1 min-w-0 flex items-center gap-1.5 px-3 h-[34px] text-left cursor-pointer hover:bg-(--ink-raised)/60 transition-colors"
        >
          <ChevronRight
            className={`w-[12px] h-[12px] shrink-0 text-(--fg-muted) transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
            strokeWidth={2.2}
          />
          <span className="text-[11.5px] font-medium text-(--fg-primary) truncate">{title}</span>
          {tone !== "neutral" && (
            <span className={`w-[5px] h-[5px] rounded-full shrink-0 ${DOT[tone]}`} aria-hidden="true" />
          )}
          <span className="flex-1" />
          {count !== undefined && count !== "" && (
            <span className="num text-[10px] text-(--fg-muted) shrink-0 tabular-nums">{count}</span>
          )}
        </button>
        {action && <div className="flex items-center pr-2 shrink-0">{action}</div>}
      </div>

      {open && <div className="px-3 pb-3 pt-0.5 flex flex-col gap-2.5">{children}</div>}
    </section>
  );
}

/** A short labelled state, for the header strip. */
export function Pill({
  tone = "neutral",
  children,
  title,
}: {
  tone?: GroupTone;
  children: React.ReactNode;
  title?: string;
}) {
  const cls =
    tone === "good"
      ? "bg-(--ok-soft) text-(--ok)"
      : tone === "bad"
        ? "bg-(--crit-soft) text-(--crit)"
        : tone === "attention"
          ? "bg-(--warn-soft) text-(--warn)"
          : "bg-(--ink-raised) text-(--fg-secondary)";
  return (
    <span
      title={title}
      className={`px-1.5 h-[18px] inline-flex items-center rounded-[4px] text-[10px] font-medium whitespace-nowrap ${cls}`}
    >
      {children}
    </span>
  );
}

/** A label and a figure, aligned down a column. */
export function Stat({ label, value, tone }: { label: string; value: string; tone?: GroupTone }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10.5px] py-0.5">
      <span className="text-(--fg-muted) truncate">{label}</span>
      <span
        className={`num tabular-nums shrink-0 ${
          tone === "good"
            ? "text-(--ok)"
            : tone === "bad"
              ? "text-(--crit)"
              : tone === "attention"
                ? "text-(--warn)"
                : "text-(--fg-secondary)"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * A row of mutually exclusive choices.
 *
 * Three ways of relating two things used to be three stacked boxes, each with
 * its own heading and its own pair of dropdowns, all open at once. They are
 * alternatives, not a sequence, and a control that says so takes a third of the
 * room and asks one question instead of three.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
}) {
  return (
    <div className="flex p-0.5 rounded-[6px] bg-(--ink-sunken) border border-(--rule) gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          className={`flex-1 min-w-0 h-[22px] px-1.5 rounded-[4px] text-[10.5px] font-medium truncate transition-colors cursor-pointer ${
            value === o.value
              ? "bg-(--ink-panel) text-(--pen) shadow-xs"
              : "text-(--fg-muted) hover:text-(--fg-primary)"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
