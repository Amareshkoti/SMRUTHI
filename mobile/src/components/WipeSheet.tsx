import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { c, font, space } from '../theme';
import { Sheet, Button } from './Chrome';
import { wipeEverything } from '../db';

export function WipeSheet({ open, onClose, onWiped }: { open: boolean; onClose: () => void; onWiped: () => void }) {
  const [wiping, setWiping] = useState(false);

  async function confirm() {
    setWiping(true);
    try {
      await wipeEverything();
      onWiped();
    } finally {
      setWiping(false);
      onClose();
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={styles.title}>Forget everything?</Text>
      <Text style={styles.body}>This erases every result stored on this phone. Your files in Google Drive are untouched.</Text>
      <View style={styles.actions}>
        <View style={styles.spacer}>
          <Button label="Keep it" onPress={onClose} disabled={wiping} tone="quiet" />
        </View>
        <View style={styles.spacer}>
          <Button label={wiping ? 'Forgetting…' : 'Forget everything'} onPress={confirm} disabled={wiping} tone="dangerSolid" />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: font.display, fontSize: 27, lineHeight: 34, color: c.text },
  body: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(1.25) },
  actions: { flexDirection: 'row', gap: space(1.25), marginTop: space(3) },
  spacer: { flex: 1 },
});
