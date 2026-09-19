import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { c, font, space } from '../theme';
import { Screen, Notice } from '../components/Chrome';
import type { Fact } from '../api';
import type { StoredDocument } from '../db';
import type { FamilyProfile } from '../family';

/** 'all' shows everyone's reports; 'me' is the signed-in person's own (person_id null); else a family member's id. */
type PersonFilter = 'all' | 'me' | string;

export function MemoryScreen({
  documents,
  facts,
  note,
  family,
}: {
  documents: StoredDocument[];
  facts: Fact[];
  note: string | null;
  family: FamilyProfile[];
}) {
  const [filter, setFilter] = useState<PersonFilter>('all');

  const factsByDoc = new Map<string, Fact[]>();
  for (const f of facts) {
    if (!f.docId) continue;
    const list = factsByDoc.get(f.docId) ?? [];
    list.push(f);
    factsByDoc.set(f.docId, list);
  }

  const filteredDocuments = filter === 'all'
    ? documents
    : documents.filter((d) => (d.person_id ?? null) === (filter === 'me' ? null : filter));

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

      {family.length ? (
        <View style={styles.personSlot}>
          <Text style={styles.personLabel}>SHOW REPORTS FOR</Text>
          <View style={styles.personChoices}>
            <Pressable onPress={() => setFilter('all')} style={[styles.person, filter === 'all' && styles.personOn]}>
              <Text style={[styles.personText, filter === 'all' && styles.personTextOn]}>Everyone</Text>
            </Pressable>
            <Pressable onPress={() => setFilter('me')} style={[styles.person, filter === 'me' && styles.personOn]}>
              <Text style={[styles.personText, filter === 'me' && styles.personTextOn]}>Me</Text>
            </Pressable>
            {family.map((member) => (
              <Pressable key={member.id} onPress={() => setFilter(member.id)} style={[styles.person, filter === member.id && styles.personOn]}>
                <Text style={[styles.personText, filter === member.id && styles.personTextOn]}>{member.displayName}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {documents.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No reports on this phone. Add your oldest one first.</Text>
        </View>
      ) : filteredDocuments.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No reports for this person yet.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filteredDocuments.map((d) => {
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

  personSlot: { marginHorizontal: space(3), marginTop: space(2.75) },
  personLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.4, color: c.textFaint, marginBottom: space(1) },
  personChoices: { flexDirection: 'row', gap: space(1), flexWrap: 'wrap' },
  person: { borderRadius: 12, borderWidth: 1, borderColor: c.hairSoft, paddingHorizontal: space(1.5), paddingVertical: space(0.9) },
  personOn: { borderColor: c.gold, backgroundColor: c.goldWash },
  personText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textMuted },
  personTextOn: { color: c.gold },

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
