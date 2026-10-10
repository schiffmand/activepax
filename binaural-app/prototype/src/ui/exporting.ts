/**
 * Getting data out, honestly. Round 3: every Export button did nothing inside the published (sandboxed)
 * viewer, and Share said "Copied" when the copy had failed. Now:
 * - Export always opens a sheet that shows the file itself (selectable, monospace) with Copy all, and says
 *   what happened: a file was handed to the browser, or files can't be saved here, so copy it instead.
 * - Copy says "Copied" only when the clipboard write resolved (or execCommand reported success). On failure
 *   the text is selected in place and the sheet says so.
 */
import { ui } from './state';

export interface ExportFile {
  /** File name, e.g. tuck-notes.csv. */
  name: string;
  type: string;
  body: string;
  /** What it is, for the sheet's first line: "Your notes", "Your blind comparison", "All your Tuck data". */
  what: string;
}

let current: ExportFile | null = null;
export const exportFile = () => current;

/**
 * Inside a frame (the published viewer, an embed) a download can be dropped without any error or event, so
 * Tuck can't tell whether it worked. There it doesn't try silently: it shows the file to copy and offers a
 * save attempt with honest wording. Outside a frame, the download is handed to the browser.
 */
export function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Hand the file to the browser. Returns false if it threw (no download API, blocked object URLs). */
export function tryDownload(f: ExportFile): boolean {
  try {
    const blob = new Blob([f.body], { type: f.type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return true;
  } catch {
    return false;
  }
}

/** Open the export sheet for this file. Outside a frame the download starts at once; the sheet confirms it. */
export function openExport(f: ExportFile) {
  current = f;
  const tried = !inFrame() && tryDownload(f);
  ui.set({ sheet: 'export', exportTried: tried ? 'sent' : inFrame() ? 'framed' : 'failed' });
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * Copy text. True only when it really went to the clipboard: the async API resolved, or the legacy
 * execCommand('copy') on a selected textarea reported success. `select` is the on-screen field to select
 * (so a failed copy leaves the text selected for the person to copy themselves).
 */
export async function copyText(text: string, select?: HTMLTextAreaElement | HTMLInputElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await withTimeout(navigator.clipboard.writeText(text), 1500);
      return true;
    }
  } catch {
    /* blocked (sandbox without clipboard-write, no focus, no permission): try the legacy path */
  }
  let temp: HTMLTextAreaElement | null = null;
  try {
    let el = select ?? null;
    if (!el) {
      temp = document.createElement('textarea');
      temp.value = text;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      el = temp;
    }
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    return ok;
  } catch {
    return false;
  } finally {
    temp?.remove();
    if (select) {
      select.focus();
      select.select();
    }
  }
}
