import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { c, font, space } from '../theme';

export function ReportProcessingOverlay({ text, title = 'Reading your report', bottom = 84 }: { text: string; title?: string; bottom?: number }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }), Animated.timing(pulse, { toValue: 0.35, duration: 520, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [pulse]);
  return <View pointerEvents="none" style={[styles.wrap, { bottom }]}><View style={styles.card}><View style={styles.lights}>{[0, 1, 2, 3, 4].map(i => <Animated.View key={i} style={[styles.light, { opacity: pulse, transform: [{ scale: pulse.interpolate({ inputRange: [0.35, 1], outputRange: [0.72 + i * 0.03, 1.08] }) }] }]} />)}</View><View><Text style={styles.title}>{title}</Text><Text style={styles.text}>{text}</Text></View></View></View>;
}
const styles = StyleSheet.create({ wrap: { position: 'absolute', left: 16, right: 16, zIndex: 20 }, card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 18, backgroundColor: 'rgba(16, 43, 34, .96)', borderColor: 'rgba(103, 234, 170, .46)', borderWidth: 1 }, lights: { width: 48, flexDirection: 'row', alignItems: 'center', gap: 4 }, light: { width: 6, height: 24, borderRadius: 5, backgroundColor: '#67EAAA' }, title: { fontFamily: font.bodySemibold, fontSize: 14, color: c.text }, text: { marginTop: 2, fontFamily: font.body, fontSize: 12, color: '#A9D8C4' } });
