import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BackHeader, Button, Notice, Screen } from '../components/Chrome';
import { addFamilyMember, fetchFamily, removeFamilyMember, type FamilyProfile } from '../family';
import { c, font, space } from '../theme';

export function FamilyScreen({ onBack, onChanged }: { onBack: () => void; onChanged: () => void }) {
  const [members, setMembers] = useState<FamilyProfile[]>([]);
  const [name, setName] = useState(''); const [relationship, setRelationship] = useState('Child'); const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const load = async () => { try { setMembers(await fetchFamily()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your family.'); } };
  useEffect(() => { void load(); }, []);
  async function add() {
    const birthYear = year.trim() ? Number(year) : null;
    if (!name.trim()) { setError('Enter the child or family member’s name.'); return; }
    if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1900 || birthYear > new Date().getFullYear())) { setError('Enter a valid birth year, or leave it blank.'); return; }
    setBusy(true); setError(null);
    try { await addFamilyMember(name, relationship, birthYear); setName(''); setYear(''); await load(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not add this family member.'); } finally { setBusy(false); }
  }
  async function remove(id: string) { setBusy(true); try { await removeFamilyMember(id); await load(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not remove this family member.'); } finally { setBusy(false); } }
  return <Screen><BackHeader onBack={onBack} label="FAMILY" /><Text style={styles.title}>Your family{`\n`}members.</Text><Text style={styles.body}>Add a child or another family member once. Choose their name before you read each report.</Text>
    <View style={styles.form}><TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={c.textFaint} style={styles.input} editable={!busy} /><TextInput value={relationship} onChangeText={setRelationship} placeholder="Relationship, for example Child" placeholderTextColor={c.textFaint} style={styles.input} editable={!busy} /><TextInput value={year} onChangeText={setYear} placeholder="Birth year (optional)" keyboardType="number-pad" placeholderTextColor={c.textFaint} style={styles.input} editable={!busy} /><Button label={busy ? 'Saving...' : 'Add family member'} onPress={() => void add()} disabled={busy} /></View>
    {error ? <View style={styles.notice}><Notice text={error} tone="error" /></View> : null}
    <View style={styles.list}>{members.map(member => <View key={member.id} style={styles.member}><View><Text style={styles.memberName}>{member.displayName}</Text><Text style={styles.memberMeta}>{member.relationship}{member.birthYear ? ` · Born ${member.birthYear}` : ''}</Text></View><Pressable disabled={busy} onPress={() => void remove(member.id)}><Text style={styles.remove}>Remove</Text></Pressable></View>)}</View>
  </Screen>;
}
const styles = StyleSheet.create({ title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(2.25), marginHorizontal: space(3) }, body: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(1.25), marginHorizontal: space(3) }, form: { margin: space(3), gap: space(1.25) }, input: { borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairSoft, paddingVertical: space(1.5), paddingHorizontal: space(2), color: c.text, fontFamily: font.body, fontSize: 15 }, notice: { marginHorizontal: space(3) }, list: { marginHorizontal: space(3), gap: space(1) }, member: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: c.surface, borderColor: c.hair, borderWidth: 1, borderRadius: 14, padding: space(1.75) }, memberName: { color: c.text, fontFamily: font.bodyMedium, fontSize: 15 }, memberMeta: { color: c.textFaint, fontFamily: font.body, fontSize: 12, marginTop: 3 }, remove: { color: c.rose, fontFamily: font.bodyMedium, fontSize: 12 } });
