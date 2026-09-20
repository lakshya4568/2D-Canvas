"use client";

/**
 * What the file layer has to say, and the one question it has to ask.
 *
 * Two surfaces, both deliberately small: a prompt before a command that would
 * discard unsaved work, and a notice for what just happened — saved, opened,
 * recovered, refused. A refusal lists what the file layer repaired or could not
 * resolve, because "opened with 3 repairs" hidden in a console is the same as
 * not saying it at all.
 */

import React from "react";
import { AlertTriangle, Check, FileWarning, Info, X } from "lucide-react";
import { useDocumentFile } from "./documentFile";

export function FileDialogs() {
  const file = useDocumentFile();
  const { notice, dismissNotice, pending, confirmPending } = file;

  // A plain acknowledgement has said its piece after a few seconds; a warning
  // or a refusal stays until it is dismissed.
  React.useEffect(() => {
    if (!notice || notice.kind === "error" || notice.kind === "warn") return;
    const timer = setTimeout(dismissNotice, 6000);
    return () => clearTimeout(timer);
  }, [notice, dismissNotice]);

  return (
    <>
      {pending && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="unsaved-title" className="w-[430px] max-w-full bg-(--ink-panel) border border-(--rule-strong) rounded-lg shadow-2xl p-5">
            <div className="flex items-start gap-3">
              <FileWarning className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 id="unsaved-title" className="text-[13px] font-semibold text-(--fg-primary)">
                  Save the changes to &ldquo;{file.name}&rdquo;?
                </h2>
                <p className="mt-1 text-[11.5px] text-(--fg-secondary) leading-relaxed">
                  {pending.label} will replace what is on the sheet. This drawing has changes that have not been written to a file.
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2 text-[11.5px]">
              <button
                onClick={() => confirmPending("cancel")}
                className="px-3 py-1.5 rounded border border-(--rule) text-(--fg-secondary) hover:bg-(--ink-raised)"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmPending("discard")}
                className="px-3 py-1.5 rounded border border-(--rule) text-(--fg-secondary) hover:bg-(--ink-raised)"
              >
                Discard changes
              </button>
              <button
                onClick={() => confirmPending("save")}
                className="px-3 py-1.5 rounded bg-(--accent) text-white font-medium hover:opacity-90"
              >
                Save, then continue
              </button>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <div className="fixed bottom-9 right-4 z-[90] w-[360px] max-w-[92vw]">
          <div
            className={`rounded-md border shadow-xl px-3 py-2.5 text-[11.5px] leading-relaxed bg-(--ink-panel) ${
              notice.kind === "error"
                ? "border-red-500/60"
                : notice.kind === "warn"
                  ? "border-amber-500/60"
                  : notice.kind === "ok"
                    ? "border-emerald-500/50"
                    : "border-(--rule-strong)"
            }`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            <div className="flex items-start gap-2">
              {notice.kind === "error" || notice.kind === "warn" ? (
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-px ${notice.kind === "error" ? "text-red-500" : "text-amber-500"}`} />
              ) : notice.kind === "ok" ? (
                <Check className="w-4 h-4 shrink-0 mt-px text-emerald-500" />
              ) : (
                <Info className="w-4 h-4 shrink-0 mt-px text-(--fg-muted)" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-(--fg-primary)">{notice.text}</p>
                {notice.problems && notice.problems.length > 0 && (
                  <ul className="mt-1.5 space-y-1 text-(--fg-secondary)">
                    {notice.problems.map((p, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="label !text-[9px] shrink-0 mt-px opacity-70">{p.level === "repair" ? "FIXED" : "CHECK"}</span>
                        <span className="min-w-0">{p.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button onClick={dismissNotice} title="Dismiss" className="shrink-0 text-(--fg-muted) hover:text-(--fg-primary)">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
