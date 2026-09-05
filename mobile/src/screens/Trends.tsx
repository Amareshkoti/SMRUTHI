import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { c, space, type } from '../theme';
import { Screen, LanguagePicker, Notice } from '../components/Chrome';
import { TrendChart } from '../components/TrendChart';
import { WarningCard } from '../components/WarningCard';
import { api, type Fact, type Insight, type Language } from '../api';

/** Clinical thresholds drawn on the chart. Kept in step with the server. */
const THRESHOLDS: Record<string, number> = {
  HbA1c: 6.5,
  'Fasting Glucose': 126,
};

export function TrendsScreen({
  facts,
  language,
  onLanguage,
}: {
  facts: Fact[];
  language: Language;
  onLanguage: (l: Language) => void;
}) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [warning, setWarning] = useState<{ insight: Insight; message: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [phrasing, setPhrasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (facts.length === 0) {
      setInsights([]);
      setWarning(null);
      return;
    }
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { insights: found } = await api.insights(facts);
        if (cancelled) return;
        setInsights(found);

        const top = found.find((i) => i.severity === 'warning');
        if (!top) {
          setWarning(null);
          return;
        }
        // Show the computed finding immediately, then replace it with the
        // phrased version. The finding never waits on a model.
        setWarning({ insight: top, message: null });
        setPhrasing(true);
        const phrased = await api.warning(facts, language);
        if (!cancelled && phrased.insight) {
          setWarning({ insight: phrased.insight, message: phrased.message });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read your patterns.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setPhrasing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facts, language]);

  return (
    <Screen
      title="Patterns"
      subtitle="One report shows one day. Put them together and the shape of the years appears."
    >
      <View style={styles.langSlot}>
        <LanguagePicker value={language} onChange={onLanguage} />
      </View>

      {facts.length === 0 ? (
        <View style={styles.pad}>
          <Text style={type.lead}>Add three or more reports to see a pattern.</Text>
          <Text style={[type.body, styles.gap]}>
            Two points make a line. Three or more make a trend worth trusting.
          </Text>
        </View>
      ) : null}

      {loading && insights.length === 0 ? (
        <View style={styles.pad}>
          <ActivityIndicator color={c.ink} />
        </View>
      ) : null}

      {error ? (
        <View style={styles.pad}>
          <Notice text={error} tone="error" />
        </View>
      ) : null}

      {warning ? (
        <View style={styles.warningSlot}>
          <WarningCard insight={warning.insight} message={warning.message} loading={phrasing} />
        </View>
      ) : null}

      {insights.map((i) => (
        <View key={i.analyte} style={styles.chartBlock}>
          <View style={styles.chartHead}>
            <Text style={type.title}>{i.analyte}</Text>
            <Text style={type.small}>
              {i.direction === 'rising' ? 'Rising' : 'Falling'} about{' '}
              {Math.abs(i.slopePerYear) < 1 ? i.slopePerYear.toFixed(2) : i.slopePerYear.toFixed(1)}{' '}
              {i.unit} each year
            </Text>
          </View>
          <TrendChart insight={i} threshold={THRESHOLDS[i.analyte]} />
        </View>
      ))}

      {facts.length > 0 && insights.length === 0 && !loading ? (
        <View style={styles.pad}>
          <Text style={type.lead}>Nothing is drifting.</Text>
          <Text style={[type.body, styles.gap]}>
            Your results move up and down without a steady direction. That is what healthy usually
            looks like.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  langSlot: { marginLeft: space(5), marginRight: space(2.5), marginBottom: space(2) },
  pad: { marginLeft: space(5), marginRight: space(2.5), marginTop: space(2) },
  gap: { marginTop: space(1), maxWidth: 300 },
  warningSlot: { marginLeft: space(5), marginRight: space(2.5), marginBottom: space(3) },
  chartBlock: {
    backgroundColor: c.surface,
    marginLeft: space(5),
    marginRight: space(2.5),
    marginBottom: space(2.5),
    paddingVertical: space(2.5),
    paddingHorizontal: space(1),
  },
  chartHead: { paddingHorizontal: space(1.5), marginBottom: space(1.5), gap: 2 },
});
