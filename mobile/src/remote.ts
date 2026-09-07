import { supabase } from './supabase';
import type { Fact, IngestedDocument, Language } from './api';
import type { StoredDocument } from './db';

/**
 * Supabase is the source of truth. Every query here is scoped to the signed-in
 * user by row-level security in Postgres, not by the filters below -- the
 * `user_id` we send is what the policy checks our writes against, and reads
 * come back already filtered. If RLS were off, none of this would be safe.
 */

function requireUserId(userId: string | null): string {
  if (!userId) throw new Error('You are signed out. Please sign in again.');
  return userId;
}

/** Rows as they are shaped in Postgres. */
interface DocumentRow {
  id: string;
  title: string;
  source_name: string;
  doc_date: string | null;
  hospital: string;
  doctor: string;
  fact_count: number;
  added_at: string;
}

interface FactRow {
  doc_id: string;
  measured_on: string;
  analyte: string;
  analyte_printed: string;
  value: number;
  unit: string;
  ref_low: number | null;
  ref_high: number | null;
  ref_low_inclusive: boolean;
  ref_high_inclusive: boolean;
  doctor: string;
  hospital: string;
}


export async function pushDocument(userId: string | null, doc: IngestedDocument): Promise<void> {
  const uid = requireUserId(userId);

  const { data: session } = await supabase.auth.getSession();
  if (session.session?.user.id !== uid) throw new Error('Your account changed. Please retry.');
  const { error } = await supabase.rpc('save_report', { report: doc });
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Database update required: apply migration 0003_atomic_records.sql before uploading.'
    : 'Could not save this report. Your existing results have been preserved.');
}

export async function fetchDocuments(): Promise<StoredDocument[]> {
  const data = await readAll('documents', 'doc_date', false);
  return (data as DocumentRow[]).map((r) => ({
    id: r.id,
    title: r.title,
    source_name: r.source_name,
    doc_date: r.doc_date ?? '',
    hospital: r.hospital,
    doctor: r.doctor,
    fact_count: r.fact_count,
    added_at: r.added_at,
  }));
}

export async function fetchFacts(): Promise<Fact[]> {
  const data = await readAll('facts', 'measured_on', true);
  return (data as FactRow[]).map((r) => ({
    docId: r.doc_id,
    date: r.measured_on,
    analyte: r.analyte,
    analyteAsPrinted: r.analyte_printed,
    value: r.value,
    unit: r.unit,
    refLow: r.ref_low,
    refHigh: r.ref_high,
    refLowInclusive: r.ref_low_inclusive,
    refHighInclusive: r.ref_high_inclusive,
    doctor: r.doctor,
    hospital: r.hospital,
  }));
}

/** Deleting documents cascades facts; chats are local and are cleared separately. */
export async function wipeRemote(userId: string | null): Promise<void> {
  const uid = requireUserId(userId);
  const { data: session } = await supabase.auth.getSession();
  if (session.session?.user.id !== uid) throw new Error('Your account changed. Please retry.');
  const { error } = await supabase.rpc('erase_my_records');
  if (error) throw new Error('Could not erase your records. Please retry.');
}

/** Explicitly page past Supabase's response cap and keep tie ordering deterministic. */
async function readAll(table: string, order: string, ascending: boolean, filters: Record<string, string> = {}): Promise<unknown[]> {
  const { data: session } = await supabase.auth.getSession();
  const uid = requireUserId(session.session?.user.id ?? null);
  const rows: unknown[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select('*').eq('user_id', uid);
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
    const { data, error } = await query
      .order(order, { ascending }).order('id', { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}
