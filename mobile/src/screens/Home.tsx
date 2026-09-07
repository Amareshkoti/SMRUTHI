import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { c, font, space, type } from '../theme';
import { Screen, LanguagePicker } from '../components/Chrome';
import { Sparkline } from '../components/Sparkline';
import { fmt } from '../insightDisplay';
import { formatWarning, isSafeWarningMessage, type Fact, type Insight, type Language } from '../api';
import type { StoredDocument } from '../db';

export function HomeScreen({
  documents,
  facts,
  insights,
  warning,
  phrasing,
  language,
  onLanguage,
  onOpenSignal,
  onOpenVault,
}: {
  documents: StoredDocument[];
  facts: Fact[];
  insights: Insight[];
  warning: { insight: Insight; message: string | null } | null;
  phrasing: boolean;
  language: Language;
  onLanguage: (l: Language) => void;
  onOpenSignal: (analyte: string) => void;
  onOpenVault: () => void;
}) {
  const [showOtherTrends, setShowOtherTrends] = useState(false);
  const top = warning?.insight ?? null;
  const watch = !top ? insights.find((i) => i.severity === 'info') ?? null : null;
  const empty = documents.length === 0;

  const spanLabel = documents.length
    ? `${documents[documents.length - 1]!.doc_date.slice(0, 4)} — ${documents[0]!.doc_date.slice(0, 4)}`
    : 'NOTHING YET';

  const labCount = new Set(documents.map((d) => d.hospital)).size;

  const primary = top ?? watch;
  const others = insights.filter((i) => !primary || i.analyte !== primary.analyte);

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={type.label}>{spanLabel}</Text>
          <Text style={[type.hero, styles.heroTitle]}>Your memory</Text>
        </View>
        <Pressable onPress={onOpenVault} style={styles.vaultBtn} accessibilityRole="button" accessibilityLabel="Yours">
          <View style={styles.vaultIcon} />
        </Pressable>
      </View>

      {top ? (
        <Pressable onPress={() => onOpenSignal(top.analyte)} style={styles.findingCard}>
          <View style={styles.findingHead}>
            <View style={styles.findingHeadLeft}>
              <View style={styles.pulseDot} />
              <Text style={styles.findingLabel}>FINDING · COMPUTED ON DEVICE</Text>
            </View>
            <View style={styles.findingHeadRight}>
              {others.length > 0 ? (
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    setShowOtherTrends((visible) => !visible);
                  }}
                  style={styles.moreTrendsButton}
                  accessibilityRole="button"
                  accessibilityLabel="View other trends"
                >
                  <Text style={styles.moreTrendsText}>{showOtherTrends ? 'Hide' : `+${others.length}`}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {showOtherTrends ? (
            <View style={styles.otherTrendsMenu}>
              {others.map((other) => (
                <Pressable
                  key={other.analyte}
                  onPress={(event) => {
                    event.stopPropagation();
                    onOpenSignal(other.analyte);
                  }}
                  style={styles.otherTrendMenuRow}
                >
                  <View style={styles.otherTrendMenuCopy}>
                    <Text style={styles.otherTrendMenuName}>{other.analyte}</Text>
                    <Text style={styles.otherTrendMenuMeta}>
                      {other.direction === 'rising' ? 'Rising' : 'Falling'} · {other.lastValue} {other.unit}
                    </Text>
                  </View>
                  <Text style={styles.otherTrendMenuArrow}>→</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.findingValueRow}>
            <Text style={styles.findingFirst}>{top.firstValue}</Text>
            <View style={styles.findingArrow} />
            <Text style={styles.findingLast}>
              {top.lastValue}
              <Text style={styles.findingUnit}> {top.unit}</Text>
            </Text>
          </View>
          <Text style={styles.findingSub}>
            {top.analyte} · {Math.round(top.spanYears)} years · {fmt(top.slopePerYear)} {top.unit} a year
          </Text>

          <Text style={styles.findingMessage}>
            {phrasing ? 'Putting this in your language…' : (warning?.message && isSafeWarningMessage(warning.message) ? warning.message : formatWarning(top))}
          </Text>

          <View style={styles.langRow}>
            <LanguagePicker value={language} onChange={onLanguage} />
          </View>

          <View style={styles.findingFooter}>
            <Text style={styles.findingFooterText}>See the {top.points.length} reports</Text>
            <Text style={styles.findingFooterArrow}>→</Text>
          </View>
        </Pressable>
      ) : watch ? (
        <View style={styles.watchCard}>
          <View style={styles.watchHead}>
            <Text style={styles.watchLabel}>WATCHING</Text>
            {others.length > 0 ? (
              <Pressable onPress={() => setShowOtherTrends((visible) => !visible)} style={styles.moreTrendsButton} accessibilityRole="button" accessibilityLabel="View other trends">
                <Text style={styles.moreTrendsText}>{showOtherTrends ? 'Hide' : `+${others.length}`}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.watchText}>
            {watch.analyte} has moved from {watch.firstValue} to {watch.lastValue} {watch.unit} across{' '}
            {watch.points.length} reports, one direction only.
          </Text>
          <Text style={styles.watchCaption}>
            Three points is the minimum this app will trust. Add the years you are missing.
          </Text>
          {showOtherTrends ? (
            <View style={styles.otherTrendsMenu}>
              {others.map((other) => (
                <Pressable key={other.analyte} onPress={() => onOpenSignal(other.analyte)} style={styles.otherTrendMenuRow}>
                  <View style={styles.otherTrendMenuCopy}>
                    <Text style={styles.otherTrendMenuName}>{other.analyte}</Text>
                    <Text style={styles.otherTrendMenuMeta}>{other.direction === 'rising' ? 'Rising' : 'Falling'} · {other.lastValue} {other.unit}</Text>
                  </View>
                  <Text style={styles.otherTrendMenuArrow}>→</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : empty ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing remembered yet.</Text>
          <Text style={styles.emptyBody}>
            Start with your oldest report. The value appears when there are years to compare.
          </Text>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <Stat value={String(documents.length)} label="reports" />
        <Stat value={String(facts.length)} label="results" />
        <Stat value={String(labCount)} label="labs" />
      </View>

      {others.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>EVERYTHING ELSE MOVING</Text>
          <View style={styles.othersList}>
            {others.map((o) => {
              const latestStatus = o.points[o.points.length - 1]?.rangeStatus;
              const crossed = latestStatus === 'above' || latestStatus === 'below';
              const color = crossed ? c.rose : o.severity === 'none' ? c.mint : c.textMuted;
              return (
                <Pressable key={o.analyte} onPress={() => onOpenSignal(o.analyte)} style={styles.otherRow}>
                  <View style={styles.otherText}>
                    <Text style={styles.otherAnalyte}>{o.analyte}</Text>
                    <Text style={styles.otherSub}>
                      {o.direction === 'rising' ? 'Rising ' : 'Falling '}
                      {fmt(Math.abs(o.slopePerYear))} {o.unit}/yr{crossed ? ' · above range' : ''}
                    </Text>
                  </View>
                  <Sparkline values={o.points.map((p) => p.value)} color={color} />
                  <Text style={[styles.otherLast, { color }]}>{o.lastValue}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
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

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: space(3), paddingTop: space(1.25) },
  heroTitle: { marginTop: space(1.25), maxWidth: 250 },
  vaultBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: c.hairSoft, alignItems: 'center', justifyContent: 'center', marginTop: space(0.75) },
  vaultIcon: { width: 12, height: 12, borderWidth: 1.5, borderColor: c.textMuted, borderRadius: 2 },

  findingCard: {
    marginTop: space(3.25), marginHorizontal: space(3), borderRadius: 22, padding: space(3),
    backgroundColor: '#171A1F', borderWidth: 1, borderColor: 'rgba(216,178,107,.28)',
  },
  findingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  findingHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: space(1) },
  findingHeadRight: { flexDirection: 'row', alignItems: 'center', gap: space(1.25) },
  pulseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.gold },
  findingLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.gold },
  moreTrendsButton: { minWidth: 30, height: 26, paddingHorizontal: 8, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(216,178,107,.45)', alignItems: 'center', justifyContent: 'center' },
  moreTrendsText: { fontFamily: font.bodySemibold, fontSize: 11, color: c.gold },

  otherTrendsMenu: { marginTop: space(1.75), borderTopWidth: 1, borderTopColor: 'rgba(216,178,107,.16)', paddingTop: space(1) },
  otherTrendMenuRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space(1), borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.06)' },
  otherTrendMenuCopy: { flex: 1 },
  otherTrendMenuName: { fontFamily: font.bodyMedium, fontSize: 13, color: c.text },
  otherTrendMenuMeta: { fontFamily: font.body, fontSize: 11, color: c.textFaint, marginTop: 2 },
  otherTrendMenuArrow: { fontFamily: font.body, fontSize: 16, color: c.gold, paddingLeft: space(1) },

  findingValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(1.5), marginTop: space(2.5) },
  findingFirst: { fontFamily: font.displayRegular, fontSize: 24, color: '#8B8577' },
  findingArrow: { width: 26, height: 1, backgroundColor: 'rgba(216,178,107,.6)' },
  findingLast: { fontFamily: font.displayRegular, fontSize: 54, lineHeight: 54, color: c.text },
  findingUnit: { fontFamily: font.body, fontSize: 18, color: c.gold },
  findingSub: { fontFamily: font.body, fontSize: 12, color: c.textFaint, marginTop: space(0.75) },
  findingMessage: { fontFamily: font.body, fontSize: 15, lineHeight: 25, color: c.textSoft, marginTop: space(2.25) },
  langRow: { marginTop: space(2.25) },

  findingFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: space(2.5), paddingTop: space(2), borderTopWidth: 1, borderTopColor: 'rgba(216,178,107,.18)',
  },
  findingFooterText: { fontFamily: font.bodyMedium, fontSize: 13, color: c.gold },
  findingFooterArrow: { fontFamily: font.body, fontSize: 16, color: c.gold },

  watchCard: { marginTop: space(3.25), marginHorizontal: space(3), borderRadius: 22, padding: space(2.75), backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair },
  watchHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  watchLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.mint },
  watchText: { fontFamily: font.displayRegular, fontSize: 20, lineHeight: 30, color: c.text, marginTop: space(1.5) },
  watchCaption: { fontFamily: font.body, fontSize: 13, lineHeight: 21, color: c.textFaint, marginTop: space(1.5) },

  emptyCard: { marginTop: space(3.25), marginHorizontal: space(3), borderRadius: 22, padding: space(3.25), backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairSoft, borderStyle: 'dashed' },
  emptyTitle: { fontFamily: font.displayRegular, fontSize: 26, lineHeight: 34, color: c.text },
  emptyBody: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(1.25) },

  statsRow: { flexDirection: 'row', gap: space(1.25), marginTop: space(2.25), marginHorizontal: space(3) },
  stat: { flex: 1, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, paddingVertical: space(2), paddingHorizontal: space(1.75) },
  statValue: { fontFamily: font.displayRegular, fontSize: 26, color: c.text },
  statLabel: { fontFamily: font.body, fontSize: 11, color: c.textFaint, marginTop: 2 },

  sectionLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint, marginTop: space(4), marginHorizontal: space(3) },
  othersList: { marginTop: space(1.75), marginHorizontal: space(3), gap: space(1.25) },
  otherRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(1.75), borderRadius: 16,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, paddingVertical: space(2), paddingHorizontal: space(2.25),
  },
  otherText: { flex: 1 },
  otherAnalyte: { fontFamily: font.displayRegular, fontSize: 17, color: c.text },
  otherSub: { fontFamily: font.body, fontSize: 12, color: c.textFaint, marginTop: 3 },
  otherLast: { fontFamily: font.bodyMedium, fontSize: 15 },
});
