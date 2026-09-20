"use client";

/**
 * The drawing as a file: New, Open, Save, Save As — and never losing it.
 *
 * Three jobs, in order of how much they matter:
 *
 *  1. NOTHING IS LOST. Every change is written to the browser's own database a
 *     couple of seconds after it stops, as native file text. A reload, a crash
 *     or a closed laptop comes back to the drawing that was on screen, with its
 *     parameters, formulas, constraints and annotations intact, and says so.
 *  2. THE FILE IS THE MODEL. Save writes the whole parametric model, not a
 *     picture of it. DXF, SVG and PDF stay where they were, as exports.
 *  3. IT SAYS WHAT IT DID. Every save, open, refusal and repair produces a
 *     sentence the draftsman can read. A file that cannot be opened is refused
 *     whole, with the reason, over an untouched drawing.
 *
 * The recovery copy and the file are different things and are tracked
 * separately: autosave keeps the work, only a save updates the file, and the
 * unsaved-change count in the reducer is what both of them read.
 */

import React from "react";
import { useDrawing } from "@/lib/state/drawingContext";
import { useUpce } from "@/features/parametric/upceContext";
import { emptySketch, type AuthoringSketch } from "@/lib/upce/types";
import {
  CAD_FILE_EXTENSION,
  CAD_FILE_MIME,
  cadFileName,
  documentToSave,
  readCadFile,
  titleFromFileName,
  writeCadFile,
  type CadFileDocument,
  type FileProblem,
} from "@/lib/io/cadFile";
import {
  clearFileHandle,
  clearSession,
  getFileHandle,
  putFileHandle,
  readSession,
  saveSession,
  storageAvailable,
} from "@/lib/io/fileStore";
import {
  downloadText,
  ensureWritable,
  openWithFileInput,
  pickFileToOpen,
  pickFileToSave,
  readHandle,
  supportsFilePicker,
  writeHandle,
  type CadFileHandle,
} from "@/lib/io/fileAccess";

/** How long the drawing must sit still before the recovery copy is written. */
const AUTOSAVE_SETTLE_MS = 1500;

export interface FileNotice {
  kind: "ok" | "warn" | "error" | "info";
  text: string;
  /** What the file layer repaired or could not resolve, when there was any. */
  problems?: FileProblem[];
  at: number;
}

/** A command held back until the draftsman says what to do about unsaved work. */
export interface PendingAction {
  what: "new" | "open";
  label: string;
}

interface DocumentFileValue {
  /** The drawing's name, without the extension. */
  name: string;
  fileName: string;
  /** True while the startup restore is still deciding what to show. */
  restoring: boolean;
  /** True when the recovery copy holds work the file does not. */
  dirty: boolean;
  savedAt: number | null;
  /** When the recovery copy was last written. */
  autosavedAt: number | null;
  busy: boolean;
  notice: FileNotice | null;
  /** True when this browser can write back to the file that was opened. */
  linkedToFile: boolean;
  newDocument: () => void;
  openFile: () => void;
  save: () => Promise<boolean>;
  saveAs: () => Promise<boolean>;
  dismissNotice: () => void;
  /** The held-back command, and the answers to it. */
  pending: PendingAction | null;
  confirmPending: (choice: "save" | "discard" | "cancel") => void;
}

const Ctx = React.createContext<DocumentFileValue | null>(null);

export function DocumentFileProvider({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useDrawing();
  const upce = useUpce();

  const [handle, setHandle] = React.useState<CadFileHandle | null>(null);
  const [restoring, setRestoring] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<FileNotice | null>(null);
  const [autosavedAt, setAutosavedAt] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState<PendingAction | null>(null);

  const dirty = state.file.revision !== state.file.savedRevision;

  // Read without subscribing: the save path wants whatever is on screen at the
  // moment it runs, and re-creating every callback on every keystroke would
  // re-arm the autosave timer for ever.
  const live = React.useRef({ state, sketch: upce.sketch, started: upce.started });
  live.current = { state, sketch: upce.sketch, started: upce.started };

  /**
   * The authoring session as the file layer last left it.
   *
   * A load installs a sketch, which changes its identity exactly the way an
   * accepted rule does. Recording the one it installed is what tells the two
   * apart, and stops a drawing announcing itself as edited the moment it is
   * opened.
   */
  const lastSketch = React.useRef(upce.sketch);
  const adoptSketch = React.useCallback(
    (sketch: AuthoringSketch) => {
      lastSketch.current = sketch;
      upce.restoreSketch(sketch);
    },
    [upce]
  );

  const say = React.useCallback((kind: FileNotice["kind"], text: string, problems?: FileProblem[]) => {
    setNotice({ kind, text, problems, at: Date.now() });
  }, []);

  const currentDocument = React.useCallback((): CadFileDocument => {
    const l = live.current;
    return documentToSave(l.state, l.started ? l.sketch : null);
  }, []);

  const currentText = React.useCallback(
    (title?: string) => writeCadFile(currentDocument(), { title: title ?? live.current.state.file.name }),
    [currentDocument]
  );

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  /** Loads a drawing, or refuses it whole. Returns what it had to repair. */
  const loadText = React.useCallback(
    (text: string, name: string, opts: { unsaved?: boolean; savedAt?: number | null; source: string }): FileProblem[] | null => {
      const read = readCadFile(text);
      if (!read.ok) {
        say("error", `${opts.source} could not be opened: ${read.reason}`, read.problems);
        return null;
      }
      dispatch({
        type: "DOC_LOAD",
        document: read.file.document,
        name: titleFromFileName(name),
        // An explicit null means "this was never written to a file", so it has
        // to win over the time written in the file's envelope.
        savedAt: opts.savedAt !== undefined ? opts.savedAt : Number.isFinite(Date.parse(read.file.savedAt)) ? Date.parse(read.file.savedAt) : null,
        unsaved: opts.unsaved,
      });
      // The rules and named values come back as they were saved; the settle
      // pass that follows the load re-lowers the geometry against them.
      adoptSketch(read.file.document.sketch ?? emptySketch());
      return read.problems;
    },
    [dispatch, say, adoptSketch]
  );

  // -------------------------------------------------------------------------
  // Startup: the recovery copy
  // -------------------------------------------------------------------------

  /**
   * Runs once per page load, and finishes whatever React does to the component
   * around it. There is no cancellation here on purpose: development's double
   * mount would tear down the first attempt half way, and a restore that never
   * finishes leaves `restoring` true for ever — which is the whole editor stuck
   * waiting for a drawing that has already arrived.
   */
  const started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      if (!storageAvailable()) {
        setRestoring(false);
        say("warn", "This browser keeps no local database, so drawings are not kept between visits. Save to a file before you close the tab.");
        return;
      }
      try {
        const [session, stored] = await Promise.all([readSession(), getFileHandle<CadFileHandle>()]);
        if (stored) setHandle(stored);
        if (session) {
          const problems = loadText(session.text, session.fileName ?? session.title, {
            unsaved: !session.savedToFile,
            // Only a real save sets a saved-at time. The recovery copy's own
            // timestamp says when the work was kept, which is a different
            // promise and must not be shown as "saved".
            savedAt: session.savedToFile ? session.at : null,
            source: "The drawing from your last session",
          });
          if (problems) {
            const when = new Date(session.at).toLocaleString();
            say(
              session.savedToFile ? "info" : "warn",
              session.savedToFile
                ? `Reopened "${session.title}" as you left it (${when}).`
                : `Recovered "${session.title}" with changes that were never saved to a file (${when}). Save it now if you want to keep them.`,
              problems.length ? problems : undefined
            );
          }
        }
      } catch (err) {
        say("error", `The drawing from your last session could not be read back: ${message(err)}`);
      } finally {
        setRestoring(false);
      }
    })();
  }, [loadText, say]);

  // -------------------------------------------------------------------------
  // Autosave
  // -------------------------------------------------------------------------

  const revision = state.file.revision;
  const savedRevision = state.file.savedRevision;
  const title = state.file.name;
  const fileNameNow = handle?.name ?? null;

  React.useEffect(() => {
    if (restoring || !storageAvailable()) return;
    const timer = setTimeout(() => {
      const text = currentText();
      saveSession({
        text,
        title,
        fileName: fileNameNow,
        savedToFile: revision === savedRevision,
        at: Date.now(),
      })
        .then(() => setAutosavedAt(Date.now()))
        .catch((err) => say("warn", `This drawing could not be kept for the next visit: ${message(err)}`));
    }, AUTOSAVE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [restoring, revision, savedRevision, title, fileNameNow, currentText, say]);

  /**
   * The authoring session lives in its own context, so a rule accepted or a
   * value named there changes what a save would write without going anywhere
   * near the drawing reducer. Watching the sketch's identity closes that gap.
   */
  React.useEffect(() => {
    if (restoring) {
      lastSketch.current = upce.sketch;
      return;
    }
    if (upce.sketch === lastSketch.current) return;
    lastSketch.current = upce.sketch;
    dispatch({ type: "DOC_TOUCH" });
  }, [upce.sketch, restoring, dispatch]);

  // -------------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------------

  const saveTo = React.useCallback(
    async (target: CadFileHandle, name: string): Promise<boolean> => {
      const text = currentText(titleFromFileName(name));
      await writeHandle(target, text);
      dispatch({ type: "DOC_SAVED", name: titleFromFileName(name), at: Date.now() });
      await saveSession({ text, title: titleFromFileName(name), fileName: name, savedToFile: true, at: Date.now() }).catch(() => undefined);
      setAutosavedAt(Date.now());
      return true;
    },
    [currentText, dispatch]
  );

  const saveAs = React.useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const suggested = cadFileName(live.current.state.file.name);
      if (supportsFilePicker()) {
        const picked = await pickFileToSave(suggested, CAD_FILE_EXTENSION, CAD_FILE_MIME);
        if (!picked) return false;
        const ok = await saveTo(picked, picked.name);
        if (ok) {
          setHandle(picked);
          await putFileHandle(picked).catch(() => undefined);
          say("ok", `Saved as "${picked.name}".`);
        }
        return ok;
      }
      // No picker in this browser: the drawing is handed over as a download,
      // and the application says so rather than pretending it owns the file.
      const text = currentText();
      downloadText(suggested, text, CAD_FILE_MIME);
      dispatch({ type: "DOC_SAVED", at: Date.now() });
      await saveSession({ text, title: live.current.state.file.name, fileName: suggested, savedToFile: true, at: Date.now() }).catch(() => undefined);
      say("ok", `"${suggested}" was downloaded. This browser cannot write back to a file, so each save downloads a new copy.`);
      return true;
    } catch (err) {
      say("error", `This drawing could not be saved: ${message(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [currentText, dispatch, saveTo, say]);

  const save = React.useCallback(async (): Promise<boolean> => {
    if (!handle) return saveAs();
    setBusy(true);
    try {
      if (!(await ensureWritable(handle))) {
        say("warn", `This browser will not write to "${handle.name}" without permission. Use Save As to choose the file again.`);
        return false;
      }
      const ok = await saveTo(handle, handle.name);
      if (ok) say("ok", `Saved to "${handle.name}".`);
      return ok;
    } catch (err) {
      say("error", `This drawing could not be saved: ${message(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [handle, saveAs, saveTo, say]);

  // -------------------------------------------------------------------------
  // New and Open
  // -------------------------------------------------------------------------

  const doNew = React.useCallback(async () => {
    dispatch({ type: "DOC_NEW" });
    adoptSketch(emptySketch());
    setHandle(null);
    await Promise.all([clearFileHandle().catch(() => undefined), clearSession().catch(() => undefined)]);
    say("info", "New drawing.");
  }, [dispatch, say, adoptSketch]);

  const doOpen = React.useCallback(async () => {
    setBusy(true);
    try {
      if (supportsFilePicker()) {
        const picked = await pickFileToOpen(CAD_FILE_EXTENSION, CAD_FILE_MIME);
        if (!picked) return;
        const text = await readHandle(picked.handle);
        const problems = loadText(text, picked.handle.name, { savedAt: Date.now(), source: `"${picked.handle.name}"` });
        if (problems) {
          setHandle(picked.handle);
          await putFileHandle(picked.handle).catch(() => undefined);
          say("ok", `Opened "${picked.handle.name}".`, problems.length ? problems : undefined);
        }
        return;
      }
      const chosen = await openWithFileInput(CAD_FILE_EXTENSION);
      if (!chosen) return;
      const problems = loadText(chosen.text, chosen.name, { savedAt: Date.now(), source: `"${chosen.name}"` });
      if (problems) {
        setHandle(null);
        await clearFileHandle().catch(() => undefined);
        say("ok", `Opened "${chosen.name}". This browser cannot write back to it, so saving downloads a copy.`, problems.length ? problems : undefined);
      }
    } catch (err) {
      say("error", `That file could not be opened: ${message(err)}`);
    } finally {
      setBusy(false);
    }
  }, [loadText, say]);

  /** New and Open discard what is on screen, so unsaved work is asked about first. */
  const guard = React.useCallback(
    (what: PendingAction["what"], label: string, run: () => void) => {
      if (dirty) {
        setPending({ what, label });
        return;
      }
      run();
    },
    [dirty]
  );

  const newDocument = React.useCallback(() => guard("new", "Start a new drawing", () => void doNew()), [guard, doNew]);
  const openFile = React.useCallback(() => guard("open", "Open another drawing", () => void doOpen()), [guard, doOpen]);

  const confirmPending = React.useCallback(
    (choice: "save" | "discard" | "cancel") => {
      const action = pending;
      setPending(null);
      if (!action || choice === "cancel") return;
      const run = () => (action.what === "new" ? doNew() : doOpen());
      if (choice === "discard") {
        void run();
        return;
      }
      void save().then((ok) => {
        if (ok) void run();
      });
    },
    [pending, doNew, doOpen, save]
  );

  // -------------------------------------------------------------------------
  // Leaving the page, and the keyboard
  // -------------------------------------------------------------------------

  React.useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      // The work itself is in the recovery copy; what is at stake is the file,
      // which is exactly what the browser's own wording asks about.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const saveRef = React.useRef(save);
  saveRef.current = save;
  const saveAsRef = React.useRef(saveAs);
  saveAsRef.current = saveAs;
  const newRef = React.useRef(newDocument);
  newRef.current = newDocument;
  const openRef = React.useRef(openFile);
  openRef.current = openFile;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        if (e.shiftKey) void saveAsRef.current();
        else void saveRef.current();
      } else if (key === "o") {
        e.preventDefault();
        openRef.current();
      } else if (key === "n" && !e.shiftKey) {
        e.preventDefault();
        newRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value: DocumentFileValue = {
    name: state.file.name,
    fileName: handle?.name ?? cadFileName(state.file.name),
    restoring,
    dirty,
    savedAt: state.file.savedAt,
    autosavedAt,
    busy,
    notice,
    linkedToFile: Boolean(handle),
    newDocument,
    openFile,
    save,
    saveAs,
    dismissNotice: () => setNotice(null),
    pending,
    confirmPending,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocumentFile(): DocumentFileValue {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useDocumentFile must be used inside DocumentFileProvider");
  return v;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
