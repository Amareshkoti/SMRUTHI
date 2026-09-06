/**
 * SMRUTI v2 -- "a darker, quieter room."
 *
 * Near-black with a cool cast, pale gold for the finding, mint for in-range,
 * rose only for the clinical line. Newsreader (serif) for anything meant to
 * be read like a sentence, Manrope (sans) for labels, numbers and UI.
 */
export const c = {
  ink: '#0B0E11',
  surface: '#13171B',
  surfaceWash: 'rgba(216,178,107,.06)',
  hair: 'rgba(255,255,255,.07)',
  hairSoft: 'rgba(255,255,255,.09)',
  text: '#F2F4F3',
  textSoft: '#C9CFD2',
  textMuted: '#9AA4A9',
  textFaint: '#626D74',
  gold: '#D8B26B',
  goldDeep: '#8A6B2E',
  goldWash: 'rgba(216,178,107,.16)',
  mint: '#7FC3A5',
  rose: '#D97C74',
} as const;

export const font = {
  display: 'Newsreader_300Light',
  displayRegular: 'Newsreader_400Regular',
  displayMedium: 'Newsreader_500Medium',
  displayItalic: 'Newsreader_300Light_Italic',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemibold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const fontsToLoad = {
  Newsreader_300Light: require('@expo-google-fonts/newsreader/300Light/Newsreader_300Light.ttf'),
  Newsreader_400Regular: require('@expo-google-fonts/newsreader/400Regular/Newsreader_400Regular.ttf'),
  Newsreader_500Medium: require('@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf'),
  Newsreader_300Light_Italic: require('@expo-google-fonts/newsreader/300Light_Italic/Newsreader_300Light_Italic.ttf'),
  Manrope_400Regular: require('@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf'),
  Manrope_500Medium: require('@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf'),
  Manrope_600SemiBold: require('@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf'),
  Manrope_700Bold: require('@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf'),
} as const;

export const type = {
  hero: { fontFamily: font.display, fontSize: 38, lineHeight: 44, color: c.text },
  title: { fontFamily: font.display, fontSize: 27, lineHeight: 34, color: c.text },
  lead: { fontFamily: font.display, fontSize: 20, lineHeight: 30, color: c.text },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 23, color: c.textMuted },
  bodyStrong: { fontFamily: font.bodyMedium, fontSize: 15, lineHeight: 23, color: c.text },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 21, color: c.textFaint },
  label: { fontFamily: font.bodySemibold, fontSize: 10, letterSpacing: 1.6, color: c.textFaint },
  datum: { fontFamily: font.displayRegular, fontSize: 24, color: c.text },
} as const;

export const space = (n: number) => n * 8;
