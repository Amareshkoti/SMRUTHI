import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Keyboard } from 'react-native';
import { c, font, space, type } from '../theme';
import type { Language } from '../api';

export type View5 = 'home' | 'signal' | 'memory' | 'ask' | 'vault';

const NAV: { key: Exclude<View5, 'signal'>; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'memory', label: 'Memory' },
  { key: 'ask', label: 'Ask' },
  { key: 'vault', label: 'Yours' },
];

export function BottomNav({
  active,
  onChange,
  onAdd,
}: {
  active: View5;
  onChange: (v: View5) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.nav}>
      {NAV.slice(0, 2).map((t) => (
        <NavItem key={t.key} label={t.label} on={active === t.key} onPress={() => onChange(t.key)} />
      ))}
      <Pressable onPress={onAdd} style={styles.plus} accessibilityRole="button" accessibilityLabel="Add a report">
        <Text style={styles.plusLabel}>+</Text>
      </Pressable>
      {NAV.slice(2).map((t) => (
        <NavItem key={t.key} label={t.label} on={active === t.key} onPress={() => onChange(t.key)} />
      ))}
    </View>
  );
}

function NavItem({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.navItem}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
    >
      <View style={[styles.navMark, on && styles.navMarkOn]} />
      <Text style={[styles.navLabel, on && styles.navLabelOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * True while the software keyboard is on screen. Used to stand the bottom nav
 * down, so a composer pinned above the keyboard is not floating on top of it.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Plain dark scroll container. Screens bring their own header. */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function BackHeader({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <View style={styles.backRow}>
      <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
        <Text style={styles.backArrow}>←</Text>
      </Pressable>
      <Text style={type.label}>{label}</Text>
    </View>
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
            style={[styles.pill, on && styles.pillOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Button({ label, onPress, disabled, tone = 'gold' }: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'gold' | 'quiet' | 'dangerOutline' | 'dangerSolid';
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        tone === 'quiet' && styles.buttonQuiet,
        tone === 'dangerOutline' && styles.buttonDangerOutline,
        tone === 'dangerSolid' && styles.buttonDangerSolid,
        (disabled || pressed) && styles.buttonDim,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          tone === 'quiet' && styles.buttonLabelQuiet,
          tone === 'dangerOutline' && styles.buttonLabelDangerOutline,
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

/** Dim overlay + rounded-top slide-up panel, used by both bottom sheets. */
export function Sheet({ open, onClose, children }: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheetPanel}>
          <View style={styles.sheetHandle} />
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.ink },
  screenContent: { paddingBottom: space(5) },

  backRow: { flexDirection: 'row', alignItems: 'center', gap: space(1.75), paddingHorizontal: space(3), paddingTop: space(1.25) },
  backBtn: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: c.hairSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { color: c.textMuted, fontSize: 15 },

  nav: {
    flexDirection: 'row', alignItems: 'center', gap: space(1),
    paddingHorizontal: space(2.5), paddingTop: space(1.25), paddingBottom: space(2.75),
    backgroundColor: c.ink,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 5, paddingVertical: space(1) },
  navMark: { width: 16, height: 2, borderRadius: 2, backgroundColor: 'transparent' },
  navMarkOn: { backgroundColor: c.gold },
  navLabel: { fontFamily: font.bodyMedium, fontSize: 11, color: c.textFaint },
  navLabelOn: { color: c.text },
  plus: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: c.gold,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    shadowColor: c.gold, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  plusLabel: { color: c.ink, fontSize: 24, fontFamily: font.bodySemibold, lineHeight: 26 },

  langRow: { flexDirection: 'row', gap: space(1) },
  pill: {
    paddingVertical: space(0.875), paddingHorizontal: space(1.75),
    borderWidth: 1, borderColor: c.hairSoft, borderRadius: 999, backgroundColor: 'transparent',
  },
  pillOn: { borderColor: c.gold, backgroundColor: c.goldWash },
  pillText: { fontFamily: font.bodyMedium, fontSize: 13, color: c.textMuted },
  pillTextOn: { color: c.gold },

  button: { backgroundColor: c.gold, paddingVertical: space(1.875), paddingHorizontal: space(2.5), borderRadius: 12, alignItems: 'center' },
  buttonQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.hairSoft },
  buttonDangerOutline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(217,124,116,.4)' },
  buttonDangerSolid: { backgroundColor: c.rose },
  buttonDim: { opacity: 0.5 },
  buttonLabel: { fontFamily: font.bodySemibold, fontSize: 15, color: c.ink },
  buttonLabelQuiet: { color: c.textMuted },
  buttonLabelDangerOutline: { color: c.rose },

  notice: { backgroundColor: 'rgba(127,195,165,.08)', borderWidth: 1, borderColor: 'rgba(127,195,165,.25)', borderRadius: 16, padding: space(2) },
  noticeError: { backgroundColor: 'rgba(217,124,116,.08)', borderColor: 'rgba(217,124,116,.3)' },
  noticeText: { fontFamily: font.body, fontSize: 13, lineHeight: 21, color: '#A9D8C4' },
  noticeTextError: { color: c.rose },

  sheetOverlay: { flex: 1, backgroundColor: 'rgba(6,8,10,.6)', justifyContent: 'flex-end' },
  sheetPanel: {
    backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: 'rgba(216,178,107,.25)',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: space(3),
    paddingTop: space(2.75), paddingBottom: space(4.5),
  },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: c.hairSoft, alignSelf: 'center', marginBottom: space(2.5) },
});
