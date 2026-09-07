import React, { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { c, font, space } from '../theme';
import { Sheet, Button, Notice } from './Chrome';
import { clearCache } from '../db';
import { wipeRemote } from '../remote';
import { clearLocalChats } from '../chatStorage';

export function WipeSheet({ open, onClose, onWiped, userId }: {
  open: boolean;
  onClose: () => void;
  onWiped: () => void;
  userId: string | null;
}) {
  const [wiping, setWiping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setWiping(true);
    setError(null);
    try {
      // Server first. If that fails we must not clear the local mirror, or the
      // app would look empty while the records are still sitting in Postgres.
      await wipeRemote(userId);
      if (userId) {
        await clearCache(userId);
        await clearLocalChats(userId);
      }
      onWiped();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not erase your records. Nothing was deleted.');
    } finally {
      setWiping(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={styles.title}>Forget everything?</Text>
      <Text style={styles.body}>
        This erases every result and every conversation held under your account, on this phone and
        on the server. It cannot be undone. Your account itself stays, and the original files on
        your phone are untouched.
      </Text>
      {error ? (
        <View style={styles.errorSlot}>
          <Notice text={error} tone="error" />
        </View>
      ) : null}
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
  errorSlot: { marginTop: space(2) },
  actions: { flexDirection: 'row', gap: space(1.25), marginTop: space(3) },
  spacer: { flex: 1 },
});
