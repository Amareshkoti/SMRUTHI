import { useSyncExternalStore } from 'react';
import { deleteAsync } from 'expo-file-system/legacy';
import { api, type PrescriptionExtraction } from './api';

/**
 * Reading a prescription can take a while (a vision-reasoning model call),
 * so it runs here rather than inside PrescriptionSheet -- closing the sheet
 * (Minimize) does not cancel it, and reopening it just reattaches to
 * whatever is already in flight or already finished.
 *
 * The result is kept only in this module's memory. Nothing here is written
 * to chatStorage, the SQLite cache, or Supabase -- the same "never saved"
 * rule as the rest of the prescription feature.
 */
type Job = {
  busy: boolean;
  text: string;
  error: string | null;
  result: PrescriptionExtraction | null;
  /** Bumped on every settle so effects keyed on it fire exactly once per run. */
  completed: number;
};

let job: Job | null = null;
const listeners = new Set<() => void>();
const publish = (next: Job) => { job = next; listeners.forEach((fn) => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const usePrescriptionJob = () => useSyncExternalStore(subscribe, () => job, () => null);
export const prescriptionJobInProgress = () => Boolean(job?.busy);

export function clearPrescriptionJob() {
  publish({ busy: false, text: '', error: null, result: null, completed: 0 });
  job = null;
  listeners.forEach((fn) => fn());
}

export async function startPrescriptionRead(file: { uri: string; mimeType: string }) {
  if (job?.busy) throw new Error('A prescription is already being read.');
  publish({ busy: true, text: 'Reading the prescription', error: null, result: null, completed: 0 });
  const update = (text: string) => publish({ busy: true, text, error: null, result: null, completed: 0 });
  try {
    const result = await api.ingestPrescription(file, update);
    publish({ busy: false, text: '', error: null, result, completed: Date.now() });
  } catch (err) {
    publish({ busy: false, text: '', error: err instanceof Error ? err.message : 'Could not read that prescription.', result: null, completed: Date.now() });
  } finally {
    if (file.uri.startsWith('file://') && file.uri.includes('/cache/')) await deleteAsync(file.uri, { idempotent: true }).catch(() => {});
  }
}
