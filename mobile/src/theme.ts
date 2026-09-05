import { Platform } from 'react-native';

/**
 * Indigo ink on ledger paper.
 *
 * The warning colour is turmeric rather than red on purpose: red reads as
 * "emergency, go to hospital now", which would be false. This finding is
 * "pay attention, see a doctor this week".
 */
export const c = {
  ink: '#14304A',
  inkSoft: '#4A6076',
  inkFaint: '#8496A6',
  paper: '#F5F7F6',
  surface: '#FFFFFF',
  mist: '#DDE4E3',
  haldi: '#E8A33D',
  haldiDeep: '#8A5B12',
  haldiWash: '#FBEFD9',
  kumkum: '#C0453B',
  leaf: '#2F7A62',
} as const;

/**
 * Android's "serif" is Noto Serif and "sans-serif" is Roboto; both carry
 * Telugu and Devanagari. Using the platform families means no font download
 * can fail during the demo, and Indic scripts still render correctly.
 */
export const font = {
  display: Platform.select({ android: 'serif', ios: 'Georgia', default: 'serif' }),
  body: Platform.select({ android: 'sans-serif', ios: 'System', default: 'System' }),
  bodyMedium: Platform.select({ android: 'sans-serif-medium', ios: 'System', default: 'System' }),
} as const;

export const type = {
  hero: { fontFamily: font.display, fontSize: 34, lineHeight: 41, color: c.ink },
  title: { fontFamily: font.display, fontSize: 25, lineHeight: 32, color: c.ink },
  lead: { fontFamily: font.display, fontSize: 19, lineHeight: 28, color: c.ink },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 25, color: c.inkSoft },
  bodyStrong: { fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 25, color: c.ink },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 21, color: c.inkFaint },
  datum: { fontFamily: font.bodyMedium, fontSize: 30, color: c.ink },
} as const;

/** The thread. Same stroke on the timeline and the chart axis. */
export const THREAD = { x: 26, width: 1.5, color: c.mist } as const;

export const space = (n: number) => n * 8;
