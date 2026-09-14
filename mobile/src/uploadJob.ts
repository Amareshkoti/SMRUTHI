import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { deleteAsync } from 'expo-file-system/legacy';
import { reportTools } from '../modules/report-tools';
import { api } from './api';
import { hasMatchingRecord, hasUploadedFile, pushDocument } from './remote';
import { supabase } from './supabase';

type Job = { userId: string; busy: boolean; text: string; error: boolean; completed: number };
let job: Job | null = null;
const listeners = new Set<() => void>();
const publish = (next: Job) => { job = next; listeners.forEach(fn => fn()); };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useUploadJob = () => useSyncExternalStore(subscribe, () => job, () => null);
export const uploadInProgress = () => Boolean(job?.busy);

export async function startUpload(userId: string, file: { uri: string; name: string; mimeType: string }, personId: string | null = null) {
  if (job?.busy) throw new Error('A report is already being processed.');
  publish({ userId, busy: true, text: 'Checking this file', error: false, completed: 0 });
  let nativeStarted = false;
  const update = (text: string) => publish({ userId, busy: true, text, error: false, completed: 0 });
  try {
    if (Platform.OS !== 'android') throw new Error('Use the Android APK to process reports directly on this device.');
    const native = reportTools();
    await native.startProcessing();
    nativeStarted = true;
    const sourceId = (await native.hashFile(file.uri)).slice(0, 32);
    if (await hasUploadedFile(userId, sourceId)) throw new Error('You already added this report. No duplicate was saved.');
    const result = await api.ingest({ ...file, sourceId }, update);
    update('Checking for duplicate results');
    for (const document of result.documents) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.id !== userId) throw new Error('Your account changed. The report was not saved.');
      if (await hasMatchingRecord(document.facts)) throw new Error('These report results are already in your records. No duplicate was saved.');
      update('Saving your results');
      await pushDocument(userId, document, personId);
    }
    publish({ userId, busy: false, text: `Report added: ${result.factCount} results remembered.`, error: false, completed: Date.now() });
  } catch (error) {
    publish({ userId, busy: false, text: error instanceof Error ? error.message : 'Could not read this report.', error: true, completed: Date.now() });
  } finally {
    if (nativeStarted) await reportTools().stopProcessing().catch(() => {});
    if (file.uri.startsWith('file://') && file.uri.includes('/cache/')) await deleteAsync(file.uri, { idempotent: true }).catch(() => {});
  }
}
