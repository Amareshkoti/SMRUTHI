import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { c, font, space } from '../theme';
import { Screen, Notice } from '../components/Chrome';
import type { Fact } from '../api';
import type { StoredDocument } from '../db';

export function MemoryScreen({
  documents,
  facts,
  note,
}: {
  documents: StoredDocument[];
  facts: Fact[];
  note: string | null;
}) {
  const factsByDoc = new Map<string, Fact[]>();
  for (const f of facts) {
    if (!f.docId) continue;
    const list = factsByDoc.get(f.docId) ?? [];
    list.push(f);
    factsByDoc.set(f.docId, list);
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.label}>MEMORY</Text>
        <Text style={styles.title}>Every report,{'\n'}read once.</Text>
        <Text style={styles.subtitle}>The numbers stay on this phone. The file never leaves your Drive.</Text>
      </View>

      {note ? (
        <View style={styles.noteSlot}>
          <Notice text={note} />
        </View>
      ) : null}

      {documents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No reports on this phone. Add your oldest one first.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {documents.map((d) => {
            const chips = (factsByDoc.get(d.id) ?? []).map((f) => `${f.analyte} ${f.value}`);
            return (
              <View key={d.id} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.hospital}>{d.hospital || d.title}</Text>
                  <Text style={styles.year}>{d.doc_date.slice(0, 4) || '—'}</Text>
                </View>
                {d.doctor ? <Text style={styles.doctor}>{d.doctor}</Text> : null}
                {chips.length > 0 ? (
                  <View style={styles.chips}>
                    {chips.map((ch, i) => (
                      <Text key={i} style={styles.chip}>{ch}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space(3), paddingTop: space(1.25) },
  label: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint },
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(1.25) },
  subtitle: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(1.25), maxWidth: 280 },

  noteSlot: { marginHorizontal: space(3), marginTop: space(2.75) },

  empty: { marginHorizontal: space(3), marginTop: space(3.25), borderRadius: 18, borderWidth: 1, borderColor: c.hairSoft, borderStyle: 'dashed', padding: space(3) },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted },

  list: { marginHorizontal: space(3), marginTop: space(3.25), gap: space(1.5) },
  card: { borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, padding: space(2.5) },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hospital: { fontFamily: font.displayRegular, fontSize: 17, color: c.text },
  year: { fontFamily: font.displayRegular, fontSize: 20, color: c.textFaint },
  doctor: { fontFamily: font.body, fontSize: 12, color: c.textFaint, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1), marginTop: space(1.75) },
  chip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,.05)', fontFamily: font.bodyMedium, fontSize: 11, color: c.textMuted, overflow: 'hidden' },
});
