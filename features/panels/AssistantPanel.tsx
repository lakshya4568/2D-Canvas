"use client";

/**
 * The assistant, given its own room.
 *
 * It was a section near the bottom of the authoring column, which was the wrong
 * place for two reasons. It is not a step — you ask it whenever you are stuck,
 * not between step four and step five — and its answers are long, so wherever it
 * sat it pushed everything below it off the screen.
 *
 * What it says is advice and is presented as advice: a card per suggestion, the
 * engineering reason in the draftsman's own vocabulary, and the measurement
 * taken from THIS drawing rather than from the model.
 *
 * Accepting is a deliberate, per-card act, and it goes through no special path:
 * a name is created by the same call a draftsman's own "name this measurement"
 * makes, and a geometric relationship is accepted as the DETECTOR's candidate
 * for it — so the admissibility gate and the solver's refusal apply to the
 * model's ideas exactly as they do to anybody's.
 */

import React from "react";
import { Sparkles, ShieldCheck, CircleAlert, Cpu, Check, X, Tag, CornerDownLeft, MessageSquare } from "lucide-react";
import { useUpce } from "@/features/parametric/upceContext";
import type { ReviewedSuggestion } from "@/lib/ai/constraintAdvisor";
import { Group, Pill, Stat, Segmented } from "./ui/Disclosure";

/**
 * Accept or dismiss one suggestion.
 *
 * The plan is worked out before the button is drawn, so a suggestion that
 * cannot be applied says why in place of an Accept that would only fail. That
 * matters most for the geometric ones: "the drawing does not currently show
 * this" is a real answer to a real situation, and a disabled button with no
 * explanation would leave the author wondering which of them was confused.
 */
function SuggestionActions({ suggestion }: { suggestion: ReviewedSuggestion }) {
  const { planFor, acceptSuggestion, rejectSuggestion } = useUpce();
  const plan = planFor(suggestion);

  if (plan.kind === "unavailable") {
    return (
      <div className="pt-1 flex flex-col gap-1">
        <p className="text-[10px] leading-[1.45] text-(--fg-muted)">{plan.blocked}</p>
        <button
          onClick={() => rejectSuggestion(suggestion.id)}
          className="self-start text-[10px] text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div className="pt-1 flex flex-col gap-1">
      {plan.agreement && (
        <p className="text-[10px] text-(--ok)">Checked: {plan.agreement}.</p>
      )}
      <div className="flex items-center gap-1">
      <button
        onClick={() => acceptSuggestion(suggestion)}
        title={plan.summary}
        className="flex-1 h-[24px] rounded-[4px] text-[10.5px] font-medium inline-flex items-center justify-center gap-1 text-(--ok) hover:bg-(--ok-soft) cursor-pointer transition-colors"
      >
        <Check className="w-[11px] h-[11px]" strokeWidth={2.4} />
        {plan.kind === "rename" ? "Use this name" : plan.kind === "formula" ? "Use this formula" : "Accept"}
      </button>
      <button
        onClick={() => rejectSuggestion(suggestion.id)}
        className="flex-1 h-[24px] rounded-[4px] text-[10.5px] font-medium inline-flex items-center justify-center gap-1 text-(--fg-muted) hover:bg-(--crit-soft) hover:text-(--crit) cursor-pointer transition-colors"
      >
        <X className="w-[11px] h-[11px]" strokeWidth={2.4} />
        Not intended
      </button>
      </div>
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const tone = value >= 0.85 ? "good" : value >= 0.6 ? "neutral" : "attention";
  return <Pill tone={tone}>{(value * 100).toFixed(0)}%</Pill>;
}

/**
 * A conversation about the drawing.
 *
 * Deliberately not where the suggestions are. A suggestion carries an Accept
 * button and becomes part of the model; an answer is a sentence and becomes
 * nothing. Putting them in one scrolling list would invite reading the second as
 * if it were the first.
 *
 * The values an answer mentions are shown underneath it with the figures the
 * KERNEL holds, so a sentence that drifts from the drawing is contradicted on
 * the same screen, immediately, without anyone having to go and check.
 */
function AskPane() {
  const {
    conversation, lastCitedValues, askingBusy, askError, askQuestion, clearConversation, started,
  } = useUpce();
  const [draft, setDraft] = React.useState("");
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation.length, askingBusy]);

  const send = () => {
    if (!draft.trim() || askingBusy) return;
    askQuestion(draft);
    setDraft("");
  };

  const EXAMPLES = [
    "What formulas are in this drawing?",
    "Why can't I move that shape?",
    "What is still free?",
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 flex flex-col gap-2.5">
        {conversation.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10.5px] leading-[1.55] text-(--fg-muted)">
              Ask about the model — the values, the rules holding things, what freedom is left. It
              answers from the drawing and changes nothing.
            </p>
            <div className="flex flex-col gap-1">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  onClick={() => askQuestion(q)}
                  disabled={!started}
                  className="text-left px-2 py-1.5 rounded-[5px] border border-(--rule) text-[10.5px] text-(--fg-secondary) hover:border-(--pen) hover:text-(--fg-primary) disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {conversation.map((turn, i) =>
          turn.role === "question" ? (
            <div key={i} className="self-end max-w-[92%] rounded-[8px] rounded-br-[2px] bg-(--pen-soft) px-2.5 py-1.5">
              <p className="text-[11px] leading-[1.5] text-(--fg-primary)">{turn.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[96%] flex flex-col gap-1">
              <p className="text-[11px] leading-[1.6] text-(--fg-secondary) whitespace-pre-wrap">
                {turn.text}
              </p>
              {i === conversation.length - 1 && lastCitedValues.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  {lastCitedValues.map((v) => (
                    <span
                      key={v.name}
                      title={`${v.role} · the figure the drawing holds`}
                      className="text-[9.5px] px-1.5 py-0.5 rounded-[3px] bg-(--ink-raised) text-(--fg-secondary) font-mono"
                    >
                      {v.name} = {v.value} {v.unit}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {askingBusy && <p className="text-[10.5px] text-(--fg-muted)">Reading the model…</p>}

        {askError && (
          <div className="rounded-[6px] border border-(--warn) bg-(--warn-soft) px-2.5 py-1.5">
            <p className="text-[10.5px] leading-[1.5] text-(--fg-primary)">{askError}</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-(--rule) px-3 py-2 flex flex-col gap-1.5">
        <div className="flex items-end gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={started ? "Ask about this drawing…" : "Analyse the drawing first"}
            disabled={!started}
            className="flex-1 min-w-0 resize-none px-2 py-1.5 text-[11px] leading-[1.45] rounded-[5px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary) disabled:opacity-40"
          />
          <button
            onClick={send}
            disabled={!draft.trim() || askingBusy || !started}
            title="Send (Enter)"
            className="w-[28px] h-[28px] shrink-0 rounded-[5px] bg-(--pen) text-(--ink-app) grid place-items-center disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:opacity-90"
          >
            <CornerDownLeft className="w-[13px] h-[13px]" strokeWidth={2.2} />
          </button>
        </div>
        {conversation.length > 0 && (
          <button
            onClick={clearConversation}
            className="self-start text-[10px] text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The structured pass: read the drawing, get things to accept.
 */
function ReviewPane({ hint, setHint }: { hint: string; setHint: (v: string) => void }) {
  const {
    advisor, advisorStatus, advisorBusy, askAdvisor, dismissAdvisor, started, acceptAllNames,
  } = useUpce();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
      <div className="px-3 py-2.5 border-b border-(--rule) flex flex-col gap-2">
        <p className="text-[10.5px] leading-[1.55] text-(--fg-muted)">
          Reads the sizes, counts and nesting of what you have drawn and says which relationships an
          engineer would expect it to hold — names, formulas between named values, and geometry to fix.
        </p>

        {/* Labelled, not just placeholdered. An unlabelled box above a button
            reads as a chat prompt, and people type questions into it. Questions
            belong in Ask; this takes a description of the structure. */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-(--fg-muted)">
            What are you drawing? (optional)
          </span>
          <input
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="RCC box culvert, single cell"
            className="h-[26px] px-2 text-[11px] rounded-[5px] bg-(--ink-raised) border border-(--rule) outline-none focus:border-(--pen) text-(--fg-primary)"
          />
        </label>
        <button
          onClick={() => askAdvisor(hint || undefined)}
          disabled={advisorBusy || !started}
          title={!started ? "Analyse the drawing first" : undefined}
          className="h-[28px] rounded-[5px] bg-(--pen) text-(--ink-app) text-[11.5px] font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:opacity-90 transition-opacity"
        >
          <Sparkles className="w-[12px] h-[12px]" strokeWidth={2.1} />
          {advisorBusy ? "Reading the drawing…" : "Read this drawing"}
        </button>
      </div>

      {/* What it is allowed to do. Worth saying once, plainly, where it is used. */}
      <Group id="assistant.guardrails" title="What it can and cannot do" count="" defaultOpen={false}>
        <div className="flex items-start gap-1.5">
          <ShieldCheck className="w-[12px] h-[12px] mt-[2px] shrink-0 text-(--ok)" strokeWidth={2} />
          <p className="text-[10.5px] leading-[1.55] text-(--fg-muted)">
            It never sees coordinates — only sizes, edge counts and what sits inside what. It cannot
            produce a number that reaches the drawing: every value on a card below was measured here,
            from your geometry. A formula it proposes is checked against your drawing before you are
            offered it. Nothing changes until you accept it.
          </p>
        </div>
        {advisorStatus?.model && (
          <div className="pt-0.5">
            <Stat label="Model" value={advisorStatus.model} />
          </div>
        )}
      </Group>

      {/* The answer. */}
      {advisor?.source === "unavailable" && advisor.unavailableReason && (
        <div className="m-3 rounded-[6px] border border-(--warn) bg-(--warn-soft) px-2.5 py-2 flex items-start gap-1.5">
          <CircleAlert className="w-[12px] h-[12px] mt-[2px] shrink-0 text-(--warn)" strokeWidth={2} />
          <p className="text-[10.5px] leading-[1.5] text-(--fg-primary)">{advisor.unavailableReason}</p>
        </div>
      )}

      {advisor?.source === "llm" && (
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-2 border-b border-(--rule) flex items-center gap-2">
            <span className="text-[11px] text-(--fg-secondary) truncate">
              {advisor.structureType ? `Reads as ${advisor.structureType}` : "Read"}
            </span>
            <span className="flex-1" />
            <span className="num text-[10px] text-(--fg-muted)">
              {(advisor.elapsedMs / 1000).toFixed(1)}s
            </span>
            <button
              onClick={dismissAdvisor}
              className="text-[10px] text-(--fg-muted) hover:text-(--fg-primary) cursor-pointer"
            >
              Clear
            </button>
          </div>

          {/* Renames are what people want in bulk: a drawing arrives with a dozen
              generated names and nobody wants to press Accept a dozen times. */}
          {advisor.suggestions.filter((x) => x.kind === "rename_parameter").length > 1 && (
            <div className="px-3 py-2 border-b border-(--rule)">
              <button
                onClick={acceptAllNames}
                className="w-full h-[26px] rounded-[5px] bg-(--pen-soft) text-(--pen) text-[11px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer hover:brightness-110 transition-all"
              >
                <Tag className="w-[11px] h-[11px]" strokeWidth={2.1} />
                Use all {advisor.suggestions.filter((x) => x.kind === "rename_parameter").length} names
              </button>
            </div>
          )}

          {advisor.suggestions.length === 0 ? (
            <p className="px-3 py-3 text-[10.5px] text-(--fg-muted)">
              Nothing to add — everything it could see is already in the model.
            </p>
          ) : (
            <ul className="flex flex-col">
              {advisor.suggestions.map((s) => (
                <li
                  key={s.id}
                  className="px-3 py-2.5 border-b border-(--rule) last:border-b-0 flex flex-col gap-1"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-[11.5px] text-(--fg-primary) leading-snug flex-1 min-w-0">
                      {s.suggestedName ?? s.kind.replace(/_/g, " ")}
                    </span>
                    <Confidence value={s.confidence} />
                  </div>

                  <p className="text-[10.5px] leading-[1.5] text-(--fg-muted)">
                    {s.engineeringRationale}
                  </p>

                  {s.kind === "derive_formula" && s.expression && (
                    <div className="rounded-[4px] bg-(--ink-sunken) border border-(--rule) px-2 py-1">
                      <span className="text-[10.5px] font-mono text-(--fg-primary)">
                        {s.parameter} = {s.expression}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {s.affectedLabels.map((l) => (
                      <span
                        key={l}
                        className="text-[9.5px] px-1.5 py-0.5 rounded-[3px] bg-(--ink-raised) text-(--fg-secondary) font-mono"
                      >
                        {l}
                      </span>
                    ))}
                    {s.measuredValueMm !== undefined && (
                      <span className="text-[9.5px] px-1.5 py-0.5 rounded-[3px] bg-(--pen-soft) text-(--pen) font-mono">
                        {s.measuredValueMm.toFixed(1)} mm measured here
                      </span>
                    )}
                  </div>

                  <SuggestionActions suggestion={s} />
                </li>
              ))}
            </ul>
          )}

          {advisor.rejected.length > 0 && (
            <Group
              id="assistant.rejected"
              title="Dropped before you saw them"
              count={advisor.rejected.length}
              tone="attention"
            >
              <p className="text-[10.5px] leading-[1.5] text-(--fg-muted)">
                These referred to geometry that was never sent, so they were discarded rather than
                matched to something nearby.
              </p>
              {advisor.rejected.map((r) => (
                <Stat key={r.id} label={r.id} value={r.reason} />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

import { DrafterPanel } from "./DrafterPanel";

export function AssistantPanel() {
  const { advisorStatus } = useUpce();
  const [hint, setHint] = React.useState("");
  const [mode, setMode] = React.useState<"agent" | "review" | "ask">("agent");
  const configured = advisorStatus?.configured ?? false;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2.5 border-b border-(--rule) flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Cpu className="w-[13px] h-[13px] text-(--pen)" strokeWidth={2} />
          <span className="text-[11.5px] font-medium text-(--fg-primary)">CAD Agent</span>
          <span className="flex-1" />
          {mode !== "agent" && (configured ? <Pill tone="good">ready</Pill> : <Pill tone="attention">off</Pill>)}
        </div>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "agent", label: "Draw", title: "The drafting agent draws, constrains, parametrizes and verifies" },
            { value: "ask", label: "Ask", title: "A question about this drawing" },
            { value: "review", label: "Review", title: "A structured pass with things to accept" },
          ]}
        />
      </div>

      <div className={mode === "agent" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
        <DrafterPanel />
      </div>

      {!configured && mode !== "agent" ? (
        <div className="m-3 rounded-[6px] border border-dashed border-(--rule) px-2.5 py-2">
          <p className="text-[10.5px] leading-[1.5] text-(--fg-muted)">
            {advisorStatus?.detail ?? "Checking…"}
          </p>
        </div>
      ) : (
        <>
          <div className={mode === "ask" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
            <AskPane />
          </div>
          <div className={mode === "review" ? "flex flex-1 min-h-0 flex-col" : "hidden"}>
            <ReviewPane hint={hint} setHint={setHint} />
          </div>
        </>
      )}
    </div>
  );
}
