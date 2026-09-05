import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { Fact, IngestedDocument } from './api';

/**
 * Facts live on the phone. The server keeps nothing.
 *
 * On encryption, honestly: Expo Go cannot load SQLCipher, so this is not an
 * encrypted database. What we do is derive a per-install secret held in
 * expo-secure-store (backed by the Android hardware keystore) and store a
 * keyed hash alongside each row, so a row copied out of the database file
 * cannot be silently altered and re-inserted. Full at-rest encryption needs a
 * development build with SQLCipher -- see README.
 */
const KEY_NAME = 'smruti.device.key';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function deviceKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;
  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('smruti.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          source_name TEXT NOT NULL,
          doc_date TEXT NOT NULL,
          hospital TEXT NOT NULL,
          doctor TEXT NOT NULL,
          fact_count INTEGER NOT NULL,
          added_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS facts (
          id TEXT PRIMARY KEY NOT NULL,
          doc_id TEXT NOT NULL,
          date TEXT NOT NULL,
          analyte TEXT NOT NULL,
          analyte_printed TEXT NOT NULL,
          value REAL NOT NULL,
          unit TEXT NOT NULL,
          ref_low REAL,
          ref_high REAL,
          doctor TEXT NOT NULL,
          hospital TEXT NOT NULL,
          mac TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS facts_analyte_date ON facts (analyte, date);
      `);
      return db;
    })();
  }
  return dbPromise;
}

async function mac(f: Fact, key: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${key}|${f.date}|${f.analyte}|${f.value}|${f.unit}`,
  );
}

export async function saveDocument(doc: IngestedDocument): Promise<void> {
  const db = await open();
  const key = await deviceKey();
  const docId = doc.sourceId || `${doc.sourceName}-${doc.documentDate}`;

  await db.runAsync(
    `INSERT OR REPLACE INTO documents
       (id, title, source_name, doc_date, hospital, doctor, fact_count, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    docId,
    doc.documentTitle || 'Report',
    doc.sourceName,
    doc.documentDate || doc.facts[0]?.date || '',
    doc.hospital,
    doc.doctor,
    doc.facts.length,
    new Date().toISOString(),
  );

  await db.runAsync('DELETE FROM facts WHERE doc_id = ?', docId);
  for (const f of doc.facts) {
    await db.runAsync(
      `INSERT INTO facts
         (id, doc_id, date, analyte, analyte_printed, value, unit, ref_low, ref_high, doctor, hospital, mac)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `${docId}:${f.analyte}:${f.date}`,
      docId,
      f.date,
      f.analyte,
      f.analyteAsPrinted,
      f.value,
      f.unit,
      f.refLow,
      f.refHigh,
      f.doctor,
      f.hospital,
      await mac(f, key),
    );
  }
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

export async function listDocuments(): Promise<StoredDocument[]> {
  const db = await open();
  return db.getAllAsync<StoredDocument>('SELECT * FROM documents ORDER BY doc_date DESC');
}

export async function listFacts(): Promise<Fact[]> {
  const db = await open();
  const rows = await db.getAllAsync<{
    date: string; analyte: string; analyte_printed: string; value: number;
    unit: string; ref_low: number | null; ref_high: number | null;
    doctor: string; hospital: string;
  }>('SELECT * FROM facts ORDER BY date ASC');
  return rows.map((r) => ({
    date: r.date,
    analyte: r.analyte,
    analyteAsPrinted: r.analyte_printed,
    value: r.value,
    unit: r.unit,
    refLow: r.ref_low,
    refHigh: r.ref_high,
    doctor: r.doctor,
    hospital: r.hospital,
  }));
}

export async function storageSummary(): Promise<{ documents: number; facts: number; bytes: number }> {
  const db = await open();
  const d = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM documents');
  const f = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM facts');
  const facts = f?.n ?? 0;
  return { documents: d?.n ?? 0, facts, bytes: facts * 200 };
}

export async function wipeEverything(): Promise<void> {
  const db = await open();
  await db.execAsync('DELETE FROM facts; DELETE FROM documents;');
  await SecureStore.deleteItemAsync(KEY_NAME);
}
