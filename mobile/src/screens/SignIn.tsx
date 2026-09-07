import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { c, font, space } from '../theme';
import { Button, Notice } from '../components/Chrome';
import { supabase, supabaseConfigured, SUPABASE_SETUP_HINT } from '../supabase';

type Mode = 'in' | 'up';

export function SignInScreen() {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const canSubmit = email.trim().length > 3 && password.length >= 6 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (mode === 'up') {
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        // With email confirmation switched on, there is no session yet. Saying
        // so is better than leaving them on a screen that looks like it failed.
        if (!data.session) {
          setNote('Account created. Check your email for the confirmation link, then sign in.');
          setMode('in');
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
      }
      // On success the session listener in App swaps this screen out.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!supabaseConfigured) {
    return (
      <View style={styles.root}>
        <View style={styles.centered}>
          <Text style={styles.title}>Not configured{'\n'}yet.</Text>
          <View style={styles.slot}>
            <Notice text={SUPABASE_SETUP_HINT} tone="error" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>SMRUTI</Text>
        <Text style={styles.title}>
          {mode === 'in' ? 'Your health,\nremembered.' : 'Start\nremembering.'}
        </Text>
        <Text style={styles.blurb}>
          {mode === 'in'
            ? 'Sign in to see your reports and everything you have asked.'
            : 'Your results are kept under your account, and only you can read them.'}
        </Text>

        <View style={styles.form}>
          <Field
            label="EMAIL"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!busy}
          />
          <Field
            label="PASSWORD"
            value={password}
            onChangeText={setPassword}
            placeholder="at least 6 characters"
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            editable={!busy}
            onSubmitEditing={submit}
          />
        </View>

        {error ? (
          <View style={styles.slot}>
            <Notice text={error} tone="error" />
          </View>
        ) : null}
        {note ? (
          <View style={styles.slot}>
            <Notice text={note} />
          </View>
        ) : null}

        <View style={styles.slot}>
          <Button
            label={busy ? 'Just a moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
            onPress={submit}
            disabled={!canSubmit}
          />
        </View>

        <Pressable
          onPress={() => {
            setMode(mode === 'in' ? 'up' : 'in');
            setError(null);
            setNote(null);
          }}
          disabled={busy}
          style={styles.switch}
          accessibilityRole="button"
        >
          <Text style={styles.switchText}>
            {mode === 'in' ? 'No account yet? Create one' : 'Already have an account? Sign in'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={c.textFaint}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.ink },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space(3), paddingVertical: space(5) },
  centered: { flex: 1, justifyContent: 'center', paddingHorizontal: space(3) },

  label: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.gold },
  title: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text, marginTop: space(1.25) },
  blurb: { fontFamily: font.body, fontSize: 14, lineHeight: 23, color: c.textMuted, marginTop: space(1.5) },

  form: { marginTop: space(4), gap: space(2.25) },
  fieldLabel: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint, marginBottom: space(1) },
  input: {
    borderRadius: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.hairSoft,
    paddingVertical: space(1.75), paddingHorizontal: space(2),
    color: c.text, fontSize: 15, fontFamily: font.body,
  },

  slot: { marginTop: space(2.5) },
  switch: { marginTop: space(3), alignItems: 'center' },
  switchText: { fontFamily: font.bodyMedium, fontSize: 13, color: c.textMuted },
});
