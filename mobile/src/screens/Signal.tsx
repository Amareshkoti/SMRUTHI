import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { c, font, space, type } from '../theme';
import { Screen, BackHeader } from '../components/Chrome';
import { SignalChart } from '../components/TrendChart';
import { THRESHOLDS, THR_TEXT, yearsToThreshold, fmt } from '../insightDisplay';
import type { Insight } from '../api';

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function SignalScreen({ insight, onBack }: { insight: Insight; onBack: () => void }) {
  const [selectedIndex, setSelectedIndex] = useState(insight.points.length - 1);
  const i = Math.min(selectedIndex, insight.points.length - 1);
  const point = insight.points[i]!;

  const threshold = THRESHOLDS[insight.analyte];
  const years = yearsToThreshold(insight.lastValue, insight.slopePerYear, threshold);
  const crossed = threshold !== undefined && insight.lastValue >= threshold;
  const labs = new Set(insight.points.map((p) => p.hospital)).size;

  const verdict = point.normalOnItsOwnReport ? 'Called normal on that report' : 'Flagged outside range on that report';
  const delta = fmt(Math.abs(insight.lastValue - insight.firstValue));
  const rate = `${insight.direction === 'rising' ? 'Rising' : 'Falling'} ${fmt(Math.abs(insight.slopePerYear))} ${insight.unit} per year`;
  const thrText = (THR_TEXT[insight.analyte] ?? '') + (years !== null ? ` · about ${years.toFixed(1)} years away at this rate` : '');

  return (
    <Screen>
      <BackHeader onBack={onBack} label={`${labs} LABS · ${insight.points.length} REPORTS`} />

      <View style={styles.titleBlock}>
        <Text style={styles.analyte}>{insight.analyte}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{insight.lastValue}</Text>
          <Text style={styles.unit}>{insight.unit}</Text>
          <Text style={styles.delta}>
            {insight.direction === 'rising' ? '+' : '−'}
            {delta} since {insight.points[0]!.date.slice(0, 4)}
          </Text>
        </View>
        <Text style={styles.context}>
          {crossed ? 'Above the printed range on the latest report.' : 'Every report so far sat inside its own printed range.'}
        </Text>
      </View>

      <View style={styles.chartWrap}>
        <SignalChart insight={insight} selectedIndex={i} />
      </View>

      <View style={styles.chips}>
        {insight.points.map((p, k) => {
          const on = k === i;
          return (
            <Pressable key={p.date} onPress={() => setSelectedIndex(k)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.date.slice(0, 4)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.selCard}>
        <View style={styles.selHead}>
          <Text style={styles.selHospital}>{point.hospital}</Text>
          <Text style={styles.selValue}>{point.value}</Text>
        </View>
        <Text style={styles.selMeta}>{formatDate(point.date)}</Text>
        <View style={styles.selVerdictRow}>
          <View style={styles.mintDot} />
          <Text style={styles.selVerdict}>{verdict}</Text>
        </View>
      </View>

      <View style={styles.howCard}>
        <Text style={styles.howLabel}>HOW THIS WAS FOUND</Text>
        <View style={styles.howGrid}>
          <HowRow k="Method" v={`Least-squares slope over ${insight.points.length} points`} />
          <HowRow k="Rate" v={rate} />
          <HowRow k="Threshold" v={thrText || 'No clinical threshold tracked for this test yet'} />
          <HowRow k="Model" v="Used only to translate this sentence, never to judge it" />
        </View>
        <Text style={styles.howFoot}>A pattern in your own reports, not a diagnosis. Take it to a doctor.</Text>
      </View>
    </Screen>
  );
}

function HowRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <Text style={styles.howKey}>{k}</Text>
      <Text style={styles.howVal}>{v}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  titleBlock: { paddingHorizontal: space(3), paddingTop: space(2.75) },
  analyte: { fontFamily: font.displayRegular, fontSize: 34, lineHeight: 40, color: c.text },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: space(1.25), marginTop: space(1.75) },
  value: { fontFamily: font.displayRegular, fontSize: 44, color: c.text },
  unit: { fontFamily: font.body, fontSize: 15, color: c.textMuted },
  delta: { fontFamily: font.bodyMedium, fontSize: 12, color: c.rose, marginLeft: space(0.75) },
  context: { fontFamily: font.body, fontSize: 13, lineHeight: 21, color: c.textFaint, marginTop: space(0.75) },

  chartWrap: { marginTop: space(2.5), alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space(1), paddingHorizontal: space(3), marginTop: space(0.75) },
  chip: { paddingVertical: space(0.875), paddingHorizontal: space(1.625), borderRadius: 10, borderWidth: 1, borderColor: c.hairSoft },
  chipOn: { borderColor: 'rgba(216,178,107,.5)', backgroundColor: c.goldWash },
  chipText: { fontFamily: font.bodyMedium, fontSize: 12, color: c.textFaint },
  chipTextOn: { color: c.gold },

  selCard: { marginTop: space(2.5), marginHorizontal: space(3), borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hair, padding: space(2.5) },
  selHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  selHospital: { fontFamily: font.displayRegular, fontSize: 19, color: c.text },
  selValue: { fontFamily: font.bodyMedium, fontSize: 18, color: c.text },
  selMeta: { fontFamily: font.body, fontSize: 12, color: c.textFaint, marginTop: space(0.5) },
  selVerdictRow: { flexDirection: 'row', alignItems: 'center', gap: space(1), marginTop: space(1.75), paddingTop: space(1.75), borderTopWidth: 1, borderTopColor: c.hair },
  mintDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.mint },
  selVerdict: { fontFamily: font.body, fontSize: 13, color: c.textMuted },

  howCard: { marginTop: space(2), marginHorizontal: space(3), borderRadius: 18, backgroundColor: c.surfaceWash, borderWidth: 1, borderColor: 'rgba(216,178,107,.18)', padding: space(2.5) },
  howLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.gold },
  howGrid: { marginTop: space(1.75), gap: space(1) },
  howKey: { fontFamily: font.body, fontSize: 12, color: c.textFaint },
  howVal: { fontFamily: font.body, fontSize: 12, color: c.textSoft, marginTop: 2, marginBottom: space(0.75) },
  howFoot: { fontFamily: font.body, fontSize: 12, lineHeight: 20, color: c.textMuted, marginTop: space(1.25) },
});
