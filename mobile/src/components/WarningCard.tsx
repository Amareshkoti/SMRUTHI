import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { c, font, space, type } from '../theme';
import type { Insight } from '../api';

/**
 * The one loud element in the app. Everything else stays quiet so this lands.
 * Turmeric, not red: this is "see a doctor this week", not "go to casualty".
 */
export function WarningCard({
  insight,
  message,
  loading,
}: {
  insight: Insight;
  message: string | null;
  loading: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.rule} />
      <Text style={styles.heading}>Nobody raised this</Text>
      <View style={styles.figures}>
        <Text style={styles.from}>{insight.firstValue}</Text>
        <View style={styles.arrow} />
        <Text style={styles.to}>
          {insight.lastValue}
          <Text style={styles.unit}>{insight.unit}</Text>
        </Text>
        <Text style={styles.span}>
          over {Math.round(insight.spanYears)} years
        </Text>
      </View>
      {loading && !message ? (
        <View style={styles.loading}>
          <ActivityIndicator color={c.haldiDeep} />
          <Text style={styles.loadingText}>Putting this in your language…</Text>
        </View>
      ) : (
        <Text style={styles.message}>{message ?? insight.statement}</Text>
      )}
      <Text style={styles.disclaimer}>
        This is a pattern found in your own reports, not a diagnosis. Please show it to a doctor.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: c.haldiWash, padding: space(3), paddingTop: space(2.5) },
  rule: { height: 3, width: 44, backgroundColor: c.haldi, marginBottom: space(2) },
  heading: { fontFamily: font.display, fontSize: 27, lineHeight: 34, color: c.haldiDeep },
  figures: { flexDirection: 'row', alignItems: 'baseline', marginTop: space(2), marginBottom: space(2) },
  from: { fontFamily: font.body, fontSize: 26, color: c.haldiDeep, opacity: 0.55 },
  arrow: { width: 22, height: 1.5, backgroundColor: c.haldi, marginHorizontal: space(1.25) },
  to: { fontFamily: font.bodyMedium, fontSize: 40, color: c.haldiDeep },
  unit: { fontFamily: font.body, fontSize: 20 },
  span: { ...type.small, color: c.haldiDeep, opacity: 0.8, marginLeft: space(1.5) },
  message: { fontFamily: font.body, fontSize: 17, lineHeight: 27, color: c.haldiDeep },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space(1.5), paddingVertical: space(1) },
  loadingText: { ...type.small, color: c.haldiDeep },
  disclaimer: {
    ...type.small,
    color: c.haldiDeep,
    opacity: 0.75,
    marginTop: space(2),
    paddingTop: space(1.5),
    borderTopWidth: 1,
    borderTopColor: 'rgba(138,91,18,0.18)',
  },
});
