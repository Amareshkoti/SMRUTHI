import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import type { Fact, Language } from './api';

/**
 * An offline mirror of what Supabase holds for the signed-in user.
 *
 * This used to be the source of truth. It is not any more -- Postgres is, and
 * row-level security there is what actually protects anyone's results. What
 * this buys is that the app can display cached records on a dead network, which is a
 * real risk at a demo venue.
 *
 * Two consequences worth being deliberate about:
 *
 *  - Every row is tagged with the user it belongs to and every read is scoped
 *    to one, so a second person signing in on the same phone cannot be shown
 *    the first person's results while their own data loads.
 *  - The keyed-hash tamper check that used to live here is gone. It existed
 *    because a local-only database had no other integrity story. Now the server
 *    is the authority and a hash of a device key would only be theatre.
 *
 * The file name is deliberately new: the old smruti.db had no owner column, and
 * rows written before accounts existed cannot be attributed to anyone.
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function localCacheIsAvailable(): boolean {
  return Platform.OS !== 'web' || globalThis.crossOriginIsolated === true;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  // Web SQLite is optional. Public operations check localCacheIsAvailable()
  // before reaching this function; native platforms always continue here.
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('smruti-cache.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          source_name TEXT NOT NULL,
          doc_date TEXT NOT NULL,
          hospital TEXT NOT NULL,
          doctor TEXT NOT NULL,
          fact_count INTEGER NOT NULL,
          added_at TEXT NOT NULL,
          PRIMARY KEY (id, user_id)
        );
        CREATE TABLE IF NOT EXISTS facts (
          user_id TEXT NOT NULL,
          doc_id TEXT NOT NULL,
          date TEXT NOT NULL,
          analyte TEXT NOT NULL,
          analyte_printed TEXT NOT NULL,
          value REAL NOT NULL,
          unit TEXT NOT NULL,
          ref_low REAL,
          ref_high REAL,
          doctor TEXT NOT NULL,
          hospital TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL DEFAULT 'default',
          role TEXT NOT NULL,
          text TEXT NOT NULL,
          language TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (id, user_id)
        );
        CREATE INDEX IF NOT EXISTS facts_user_analyte_date ON facts (user_id, analyte, date);
        CREATE INDEX IF NOT EXISTS messages_user_created ON messages (user_id, created_at);
      `);
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(facts)');
      if (!columns.some(c => c.name === 'ref_low_inclusive')) await db.execAsync('ALTER TABLE facts ADD COLUMN ref_low_inclusive INTEGER NOT NULL DEFAULT 1');
      if (!columns.some(c => c.name === 'ref_high_inclusive')) await db.execAsync('ALTER TABLE facts ADD COLUMN ref_high_inclusive INTEGER NOT NULL DEFAULT 1');
      const messageColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(messages)');
      if (!messageColumns.some(c => c.name === 'conversation_id')) await db.execAsync("ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'default'");
      return db;
    })().catch(error => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

export interface StoredDocument {
  id: string;
  title: string;
  source_name: string;
  doc_date: string;
  hospital: string;
  doctor: string;
  fact_count: number;
  added_at: string;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  language: Language;
  createdAt: string;
}

/** Replace this user's cached reports and readings with what the server just gave us. */
export async function cacheReports(
  userId: string,
  documents: StoredDocument[],
  facts: Fact[],
): Promise<void> {
  if (!localCacheIsAvailable()) return;
  return cacheJob(async () => {
  const db = await open();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM documents WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM facts WHERE user_id = ?', userId);
    for (const d of documents) {
      await db.runAsync(
        `INSERT OR REPLACE INTO documents
           (id, user_id, title, source_name, doc_date, hospital, doctor, fact_count, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        d.id, userId, d.title, d.source_name, d.doc_date, d.hospital, d.doctor, d.fact_count, d.added_at,
      );
    }
    for (const f of facts) {
      await db.runAsync(
        `INSERT INTO facts
           (user_id, doc_id, date, analyte, analyte_printed, value, unit, ref_low, ref_high, ref_low_inclusive, ref_high_inclusive, doctor, hospital)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, f.docId ?? '', f.date, f.analyte, f.analyteAsPrinted, f.value, f.unit,
        f.refLow, f.refHigh, f.refLowInclusive === false ? 0 : 1, f.refHighInclusive === false ? 0 : 1, f.doctor, f.hospital,
      );
    }
  });
  });
}

export async function cacheMessages(userId: string, messages: StoredMessage[]): Promise<void> {
  if (!localCacheIsAvailable()) return;
  return cacheJob(async () => {
  const db = await open();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM messages WHERE user_id = ?', userId);
    for (const m of messages) {
      await db.runAsync(
        `INSERT OR REPLACE INTO messages (id, user_id, conversation_id, role, text, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        m.id, userId, m.conversationId, m.role, m.text, m.language, m.createdAt,
      );
    }
  });
  });
}

export async function listDocuments(userId: string): Promise<StoredDocument[]> {
  if (!localCacheIsAvailable()) return [];
  return cacheJob(async () => {
  const db = await open();
  return db.getAllAsync<StoredDocument>(
    `SELECT id, title, source_name, doc_date, hospital, doctor, fact_count, added_at
       FROM documents WHERE user_id = ? ORDER BY doc_date DESC`,
    userId,
  );
  });
}

export async function listFacts(userId: string): Promise<Fact[]> {
  if (!localCacheIsAvailable()) return [];
  return cacheJob(async () => {
  const db = await open();
  const rows = await db.getAllAsync<{
    doc_id: string; date: string; analyte: string; analyte_printed: string; value: number;
    unit: string; ref_low: number | null; ref_high: number | null; ref_low_inclusive: number; ref_high_inclusive: number;
    doctor: string; hospital: string;
  }>('SELECT * FROM facts WHERE user_id = ? ORDER BY date ASC', userId);
  return rows.map((r) => ({
    docId: r.doc_id,
    date: r.date,
    analyte: r.analyte,
    analyteAsPrinted: r.analyte_printed,
    value: r.value,
    unit: r.unit,
    refLow: r.ref_low,
    refHigh: r.ref_high,
    refLowInclusive: r.ref_low_inclusive !== 0,
    refHighInclusive: r.ref_high_inclusive !== 0,
    doctor: r.doctor,
    hospital: r.hospital,
  }));
  });
}

export async function listMessages(userId: string): Promise<StoredMessage[]> {
  if (!localCacheIsAvailable()) return [];
  return cacheJob(async () => {
  const db = await open();
  const rows = await db.getAllAsync<{
    id: string; conversation_id: string; role: string; text: string; language: string; created_at: string;
  }>('SELECT * FROM messages WHERE user_id = ? ORDER BY created_at ASC', userId);
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role === 'assistant' ? 'assistant' : 'user',
    text: r.text,
    language: r.language as Language,
    createdAt: r.created_at,
  }));
  });
}

export async function storageSummary(userId: string): Promise<{
  documents: number;
  facts: number;
  messages: number;
  bytes: number;
}> {
  if (!localCacheIsAvailable()) return { documents: 0, facts: 0, messages: 0, bytes: 0 };
  return cacheJob(async () => {
  const db = await open();
  const d = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE user_id = ?', userId);
  const f = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM facts WHERE user_id = ?', userId);
  const m = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages WHERE user_id = ?', userId);
  const chars = await db.getFirstAsync<{ n: number }>(
    'SELECT COALESCE(SUM(LENGTH(text)), 0) AS n FROM messages WHERE user_id = ?', userId,
  );
  const facts = f?.n ?? 0;
  return { documents: d?.n ?? 0, facts, messages: m?.n ?? 0, bytes: facts * 200 + (chars?.n ?? 0) };
  });
}

/** Everything cached for one user. Used on sign-out and after a wipe. */
export async function clearCache(userId: string): Promise<void> {
  if (!localCacheIsAvailable()) return;
  return cacheJob(async () => {
  const db = await open();
  await db.execAsync('BEGIN');
  try {
    await db.runAsync('DELETE FROM facts WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM documents WHERE user_id = ?', userId);
    await db.runAsync('DELETE FROM messages WHERE user_id = ?', userId);
    await db.execAsync('COMMIT');
  } catch (err) {
    await db.execAsync('ROLLBACK');
    throw err;
  }
  });
}
/** Serialize all reads and transactions, including sign-out, on the single SQLite connection. */
let cacheQueue: Promise<unknown> = Promise.resolve();
function cacheJob<T>(work: () => Promise<T>): Promise<T> {
  const result = cacheQueue.then(work, work);
  cacheQueue = result.catch(() => undefined);
  return result;
}
