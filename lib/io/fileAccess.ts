/**
 * Reading and writing the drawing on the draftsman's own disk.
 *
 * Where the browser offers the File System Access API, a drawing behaves the
 * way a drawing should: "Save" writes back to the file it was opened from,
 * without asking, and without leaving a trail of "drawing (3).mycad" in the
 * downloads folder. The write goes through a writable stream, which the browser
 * commits on close — an interrupted save leaves the previous file intact rather
 * than a truncated one.
 *
 * Where it is not offered (Firefox, Safari), the same operations fall back to
 * what every browser can do: a download for saving and a file input for
 * opening. The application says which one it is doing so nobody is left
 * wondering where their file went.
 */

/** The part of the File System Access API this application uses. */
export interface CadFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
  queryPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  isSameEntry?(other: CadFileHandle): Promise<boolean>;
}

interface PickerWindow {
  showOpenFilePicker?: (o: unknown) => Promise<CadFileHandle[]>;
  showSaveFilePicker?: (o: unknown) => Promise<CadFileHandle>;
}

const picker = (): PickerWindow | null => (typeof window === "undefined" ? null : (window as unknown as PickerWindow));

export function supportsFilePicker(): boolean {
  const w = picker();
  return Boolean(w?.showOpenFilePicker && w?.showSaveFilePicker);
}

function fileTypes(extension: string, mime: string) {
  return [{ description: "CAD drawing", accept: { [mime]: [`.${extension}`] } }];
}

/** True when the user closed the picker rather than choosing something. */
function isCancel(err: unknown): boolean {
  return err instanceof DOMException && (err.name === "AbortError" || err.name === "NotAllowedError");
}

export async function pickFileToOpen(extension: string, mime: string): Promise<{ handle: CadFileHandle } | null> {
  const w = picker();
  if (!w?.showOpenFilePicker) return null;
  try {
    const [handle] = await w.showOpenFilePicker({ types: fileTypes(extension, mime), excludeAcceptAllOption: false, multiple: false });
    return handle ? { handle } : null;
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
}

export async function pickFileToSave(suggestedName: string, extension: string, mime: string): Promise<CadFileHandle | null> {
  const w = picker();
  if (!w?.showSaveFilePicker) return null;
  try {
    return await w.showSaveFilePicker({ suggestedName, types: fileTypes(extension, mime) });
  } catch (err) {
    if (isCancel(err)) return null;
    throw err;
  }
}

/**
 * Asks for write permission on a handle that came back from storage.
 *
 * A handle kept across a reload has no permission attached to it; the browser
 * grants that only in response to a click, which is why this is called from the
 * save path and not on startup.
 */
export async function ensureWritable(handle: CadFileHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const state = await handle.queryPermission({ mode: "readwrite" });
  if (state === "granted") return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function readHandle(handle: CadFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

export async function writeHandle(handle: CadFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
  } finally {
    // Closing is what commits the write; without it the browser discards the
    // stream and the file on disk is left as it was.
    await writable.close();
  }
}

/** Saving without the picker: hand the browser a file to download. */
export function downloadText(name: string, text: string, mime: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opening without the picker: a hidden file input, resolved when it changes. */
export function openWithFileInput(extension: string): Promise<{ name: string; text: string } | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${extension},application/json`;
    input.style.display = "none";
    let settled = false;
    const finish = (value: { name: string; text: string } | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      finish({ name: file.name, text: await file.text() });
    };
    // A cancelled picker fires nothing in most browsers; the window regaining
    // focus is the only signal, and it arrives before `change` does, so it is
    // given a moment to win.
    window.addEventListener(
      "focus",
      () => setTimeout(() => finish(null), 500),
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}
