import React from 'react';
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native';
import { c, font, space } from '../theme';
import { Screen, BackHeader, Button, Notice } from '../components/Chrome';

export function PrivacyScreen({
  summary,
  email,
  offline,
  onBack,
  onAskWipe,
  onSignOut,
  onFamily,
}: {
  summary: { documents: number; facts: number; messages: number; bytes: number };
  email: string | null;
  offline: boolean;
  onBack: () => void;
  onAskWipe: () => void;
  onSignOut: () => void;
  onFamily: () => void;
}) {
  return (
    <Screen>
      <BackHeader onBack={onBack} label="YOURS" />
      <Text style={styles.title}>What this app{'\n'}holds, and where.</Text>

      <Pressable style={styles.help} onPress={() => Linking.openURL('tel:+918978382219')} accessibilityRole="button">
        <Text style={styles.helpLabel}>HELPLINE</Text>
        <Text style={styles.helpNumber}>+91 8978382219</Text>
        <Text style={styles.helpHint}>Tap to call for help</Text>
      </Pressable>

      {email ? (
        <View style={styles.account}>
          <Text style={styles.accountLabel}>SIGNED IN AS</Text>
          <Text style={styles.accountEmail}>{email}</Text>
        </View>
      ) : null}

      {offline ? (
        <View style={styles.slot}>
          <Notice text="Showing the copy saved on this phone. The server could not be reached, so anything added elsewhere may be missing." />
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <Stat value={String(summary.facts)} label="results stored" />
        <Stat value={String(summary.documents)} label="reports read" />
      </View>

      <View style={styles.sections}>
        <Section
          title="Family members"
          body="Add a child or another family member, then choose who a report belongs to before it is read."
        />
        <Section
          title="Under your account"
          body="Your report results are stored under the account you signed in with, so they follow you to another phone. Your Ask conversations are different: they stay only on this device."
        />
        <Section
          title="Only you can read your results"
          body="The database protects your report results from other accounts. Someone else signing in on this phone sees their own reports and nothing of yours."
        />
        <Section
          title="Your reports are never stored"
          body="The file you pick is read once to pull out the numbers, then removed. It is not kept as a document. What is saved is only the results it contained, such as the date, measurement, and value."
        />
        <Section
          title="This phone keeps a copy"
          body="Your results may be mirrored on this device so the app can open without a network. Your Ask conversations are always kept only here. Signing out erases both copies."
        />
        <Section
          title="What we do not do yet"
          body="The copy on this phone is not encrypted at rest, and the database is hosted by a third party rather than by us. Saying so is better than implying a protection you do not have."
        />
      </View>

      <View style={styles.familySlot}><Button label="Manage family members" onPress={onFamily} tone="quiet" /></View>

      <View style={styles.wipeSlot}>
        <Button
          label="Forget everything"
          onPress={onAskWipe}
          disabled={false}
          tone="dangerOutline"
        />
      </View>
      <View style={styles.signOutSlot}>
        <Button label="Sign out" onPress={onSignOut} tone="quiet" />
      </View>
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(2.25), marginHorizontal: space(3) },

  account: { marginTop: space(2.5), marginHorizontal: space(3) },
  accountLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint },
  accountEmail: { fontFamily: font.bodyMedium, fontSize: 15, color: c.gold, marginTop: 4 },

  help: { marginTop: space(2.5), marginHorizontal: space(3), borderRadius: 16, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.gold, padding: space(2) },
  helpLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.gold },
  helpNumber: { fontFamily: font.displayRegular, fontSize: 22, color: c.text, marginTop: 4 },
  helpHint: { fontFamily: font.body, fontSize: 12, color: c.textMuted, marginTop: 2 },

  slot: { marginTop: space(2), marginHorizontal: space(3) },

  statsRow: { flexDirection: 'row', gap: space(1.25), marginTop: space(3), marginHorizontal: space(3) },
  stat: { flex: 1, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, paddingVertical: space(2), paddingHorizontal: space(1.75) },
  statValue: { fontFamily: font.displayRegular, fontSize: 24, color: c.text },
  statLabel: { fontFamily: font.body, fontSize: 11, color: c.textFaint, marginTop: 2 },

  sections: { marginTop: space(3.5), marginHorizontal: space(3), gap: space(2.75) },
  section: {},
  sectionTitle: { fontFamily: font.displayRegular, fontSize: 21, color: c.text },
  sectionBody: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(0.75) },

  wipeSlot: { marginTop: space(4), marginHorizontal: space(3) },
  familySlot: { marginTop: space(3), marginHorizontal: space(3) },
  signOutSlot: { marginTop: space(1.25), marginHorizontal: space(3) },
});
