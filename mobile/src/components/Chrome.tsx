import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { c, font, space, THREAD, type } from '../theme';
import type { Language } from '../api';

export type Tab = 'timeline' | 'trends' | 'ask' | 'privacy';

const TABS: { key: Tab; label: string }[] = [
  { key: 'timeline', label: 'Memory' },
  { key: 'trends', label: 'Patterns' },
  { key: 'ask', label: 'Ask' },
  { key: 'privacy', label: 'Yours' },
];

export function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.tabMark, on && styles.tabMarkOn]} />
            <Text style={[styles.tabLabel, on && styles.tabLabelOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The thread: one continuous stroke running the height of the screen. */
export function Screen({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.thread} pointerEvents="none" />
      <View style={styles.header}>
        <Text style={type.hero}>{title}</Text>
        {subtitle ? <Text style={[type.body, styles.subtitle]}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

export function LanguagePicker({ value, onChange }: {
  value: Language;
  onChange: (l: Language) => void;
}) {
  const options: { key: Language; label: string }[] = [
    { key: 'en', label: 'English' },
    { key: 'hi', label: 'हिन्दी' },
    { key: 'te', label: 'తెలుగు' },
  ];
  return (
    <View style={styles.langRow}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.lang, on && styles.langOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.langText, on && styles.langTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ label, onPress, disabled, tone = 'ink' }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'ink' | 'quiet' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        tone === 'quiet' && styles.buttonQuiet,
        tone === 'danger' && styles.buttonDanger,
        (disabled || pressed) && styles.buttonDim,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          tone === 'quiet' && styles.buttonLabelQuiet,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'error' }) {
  return (
    <View style={[styles.notice, tone === 'error' && styles.noticeError]}>
      <Text style={[styles.noticeText, tone === 'error' && styles.noticeTextError]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.paper },
  screenContent: { paddingBottom: space(6) },
  thread: {
    position: 'absolute',
    left: THREAD.x,
    top: 0,
    bottom: 0,
    width: THREAD.width,
    backgroundColor: THREAD.color,
  },
  header: { paddingHorizontal: space(2.5), paddingTop: space(3), paddingBottom: space(2.5), marginLeft: space(2) },
  subtitle: { marginTop: space(1), maxWidth: 320 },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderTopWidth: 1,
    borderTopColor: c.mist,
    paddingBottom: space(1.5),
    paddingTop: space(1),
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: space(0.75) },
  tabMark: { width: 20, height: 2, backgroundColor: 'transparent', marginBottom: space(0.75) },
  tabMarkOn: { backgroundColor: c.ink },
  tabLabel: { fontFamily: font.body, fontSize: 13, color: c.inkFaint },
  tabLabelOn: { fontFamily: font.bodyMedium, color: c.ink },

  langRow: { flexDirection: 'row', gap: space(1) },
  lang: {
    paddingVertical: space(0.75),
    paddingHorizontal: space(1.75),
    borderWidth: 1,
    borderColor: c.mist,
    borderRadius: 999,
    backgroundColor: c.surface,
  },
  langOn: { backgroundColor: c.ink, borderColor: c.ink },
  langText: { fontFamily: font.body, fontSize: 15, color: c.inkSoft },
  langTextOn: { fontFamily: font.bodyMedium, color: c.surface },

  button: { backgroundColor: c.ink, paddingVertical: space(1.75), paddingHorizontal: space(3), alignItems: 'center' },
  buttonQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.mist },
  buttonDanger: { backgroundColor: c.kumkum },
  buttonDim: { opacity: 0.5 },
  buttonLabel: { fontFamily: font.bodyMedium, fontSize: 16, color: c.surface },
  buttonLabelQuiet: { color: c.inkSoft },

  notice: { backgroundColor: c.surface, borderLeftWidth: 3, borderLeftColor: c.mist, padding: space(2) },
  noticeError: { borderLeftColor: c.kumkum },
  noticeText: { ...type.body },
  noticeTextError: { color: c.kumkum },
});
