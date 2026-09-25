import type { AppState } from '../types';
import { parseState, SCHEMA_VERSION } from '../store/storage';
import { isNative } from './native';

/** The envelope written to a backup file. */
export type BackupPayload = {
  app: 'tasks';
  schemaVersion: number;
  exportedAt: string;
  lists: AppState['lists'];
  tasks: AppState['tasks'];
};

export function buildBackup(state: AppState): BackupPayload {
  return {
    app: 'tasks',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    lists: state.lists,
    tasks: state.tasks,
  };
}

export function backupFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `tasks-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

/**
 * Read a backup file's contents into app state.
 *
 * Accepts the envelope above and also a bare `{ lists, tasks }` — which is what a
 * raw `todo:v1:state` dump copied out of DevTools looks like, so that rescue route
 * imports straight back in. Validation is `parseState`, the same one guarding
 * stored state; anything unusable returns null rather than throwing.
 */
export function readBackup(text: string): AppState | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  return parseState(raw);
}

export type ExportResult = { ok: true; shared: boolean } | { ok: false; error: string };

/**
 * Hand the user a backup file.
 *
 * On the web that's an ordinary download. On Android `<a download>` does nothing
 * in a Capacitor WebView, so the file is written to cache and pushed through the
 * system share sheet — which also gets it *out* of the app sandbox. Writing to
 * Directory.Documents would not: Capacitor maps it to the app-scoped external
 * directory, which Android deletes on uninstall, so the backup would die with the
 * very thing it is meant to survive.
 */
export async function exportBackup(state: AppState): Promise<ExportResult> {
  const json = JSON.stringify(buildBackup(state), null, 2);
  const filename = backupFilename();

  if (!isNative()) {
    try {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Revoke on the next tick; revoking immediately can cancel the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return { ok: true, shared: false };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }

  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    await Share.share({
      title: 'Tasks backup',
      text: filename,
      url: written.uri,
      dialogTitle: 'Save your tasks backup',
    });
    return { ok: true, shared: true };
  } catch (error) {
    // Dismissing the share sheet throws too — not worth reporting as a failure.
    const message = String(error);
    if (/cancel|abort|dismiss/i.test(message)) return { ok: true, shared: false };
    return { ok: false, error: message };
  }
}
