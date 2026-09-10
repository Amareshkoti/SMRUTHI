import React, { useRef, useState } from 'react';
import { Image, PermissionsAndroid, Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { c, font, space } from '../theme';
import type { Fact, Language } from '../api';

const publicKey = process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY?.trim() ?? '';
const assistantId = process.env.EXPO_PUBLIC_VAPI_ASSISTANT_ID?.trim() ?? '';
const json = (value: string) => JSON.stringify(value).replace(/</g, '\\u003c');

function voicePage() {
  return `<!doctype html><html><body><script type="module">
import Vapi from 'https://esm.sh/@vapi-ai/web@2.7.0';
let client;
const send=(type,message)=>window.ReactNativeWebView?.postMessage(JSON.stringify({type,message}));
const errorText=e=>{try{return e?.message||e?.error?.message||JSON.stringify(e)||'Voice call could not start';}catch{return 'Voice call could not start';}};
try {
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in Android WebView.');
  client=new Vapi(${json(publicKey)});
  client.on('call-start',()=>send('start'));
  client.on('call-end',()=>send('end'));
  client.on('error',e=>send('error',errorText(e)));
  send('ready');
} catch(e){send('error',errorText(e));}
const handle=async e=>{try{const raw=e?.data;const d=typeof raw==='string'?JSON.parse(raw):raw;if(!d||typeof d!=='object')throw new Error('Invalid voice command.');if(d.type==='stop')return client?.stop();if(d.type==='start'){if(!client)throw new Error('Voice service is still loading.');await client.start(${json(assistantId)},{variableValues:d.variables});}}catch(e){send('error',errorText(e));}};
document.addEventListener('message',handle);window.addEventListener('message',handle);
</script></body></html>`;
}

function variables(facts: Fact[], language: Language) {
  return { report_context: facts.map(f => `${f.date}: ${f.analyte} ${f.value} ${f.unit}`).join('\n') || 'No reports have been added yet.', preferred_language: language === 'hi' ? 'Hindi' : language === 'te' ? 'Telugu' : 'English' };
}

export function VoiceCallButton({ facts, language }: { facts: Fact[]; language: Language }) {
  const ref = useRef<WebView>(null);
  const pending = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [error, setError] = useState<string | null>(null);
  const live = state === 'live';

  async function toggle() {
    setError(null);
    if (!publicKey || !assistantId) { setError('Voice is not configured in this build.'); return; }
    if (state !== 'idle') { ref.current?.postMessage(JSON.stringify({ type: 'stop' })); setState('idle'); return; }
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) { setError('Microphone permission is needed for a voice conversation.'); return; }
    const message = JSON.stringify({ type: 'start', variables: variables(facts, language) });
    setState('connecting');
    if (ready) ref.current?.postMessage(message); else pending.current = message;
  }

  function onMessage(e: WebViewMessageEvent) {
    try {
      const raw = e.nativeEvent.data;
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object') throw new Error('Invalid voice response.');
      if (d.type === 'ready') { setReady(true); if (pending.current) { ref.current?.postMessage(pending.current); pending.current = null; } }
      if (d.type === 'start') setState('live');
      if (d.type === 'end') setState('idle');
      if (d.type === 'error') { setState('idle'); setError(typeof d.message === 'string' ? d.message : 'The voice call could not start.'); }
    } catch { setState('idle'); setError('The voice call could not start.'); }
  }

  return <View style={styles.wrap}>
    <WebView ref={ref} source={{ html: voicePage(), baseUrl: 'https://app.vapi.ai/' }} onMessage={onMessage} onError={() => { setReady(false); setError('Voice service could not load. Check your internet connection.'); }} javaScriptEnabled domStorageEnabled mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback mediaCapturePermissionGrantType="grant" originWhitelist={['*']} style={styles.hidden} />
    <Pressable accessibilityRole="button" accessibilityLabel={live ? 'End voice call' : 'Call SMRUTI'} onPress={() => void toggle()} style={[styles.button, live && styles.hangup]}>
      <Image source={require('../../assets/smruti-assistant.png')} style={styles.avatar} />
      <View style={styles.copy}><Text style={styles.title}>{live ? 'Call connected' : state === 'connecting' ? 'Connecting...' : 'Call SMRUTI'}</Text><Text style={styles.subtitle}>{live ? 'Tap to end the call' : 'Speak with Riley about your reports'}</Text></View>
      <View style={[styles.action, live && styles.actionHangup]}><Text style={styles.actionText}>{live ? '×' : '☎'}</Text></View>
    </Pressable>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: space(3), marginTop: space(1.5) }, hidden: { height: 1, opacity: 0 },
  button: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 22, padding: 8, paddingRight: 12, backgroundColor: 'rgba(42, 163, 117, .24)', borderWidth: 1, borderColor: 'rgba(103, 234, 170, .48)' },
  hangup: { backgroundColor: 'rgba(193, 66, 66, .24)', borderColor: 'rgba(255, 144, 144, .55)' },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: c.surface }, copy: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.bodySemibold, fontSize: 15, color: c.text }, subtitle: { fontFamily: font.body, fontSize: 12, color: c.textMuted, marginTop: 3 },
  action: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#46C486', alignItems: 'center', justifyContent: 'center' }, actionHangup: { backgroundColor: '#D96363' }, actionText: { color: c.ink, fontSize: 23, lineHeight: 25 },
  error: { marginTop: space(1), fontFamily: font.body, fontSize: 12, lineHeight: 18, color: c.rose },
});
