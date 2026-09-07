import type { Insight, Language } from './contracts';

/** Templates contain no disease-specific conclusions; all numbers come from the reports. */
export function formatWarning(i: Insight, language: Language = 'en'): string {
  const first = i.points[0]?.date ?? '';
  const last = i.points[i.points.length - 1];
  const status = last?.rangeStatus ?? 'unknown';
  if (language === 'hi') {
    const direction = i.direction === 'rising' ? 'बढ़ने' : i.direction === 'falling' ? 'घटने' : 'स्थिर रहने';
    const range = status === 'above' ? 'अंतिम परिणाम रिपोर्ट की ऊपरी सीमा से अधिक है।' : status === 'below' ? 'अंतिम परिणाम रिपोर्ट की निचली सीमा से कम है।' : status === 'within' ? 'अंतिम परिणाम उस रिपोर्ट की सीमा में है।' : 'अंतिम रिपोर्ट में तुलना की सीमा उपलब्ध नहीं है।';
    return `${i.analyte}: ${first} को ${i.firstValue} ${i.unit}, ${last?.date ?? ''} को ${i.lastValue} ${i.unit}। समय के साथ ${direction} का रुझान है। ${range} इन परिणामों पर अपने डॉक्टर से बात करें।`;
  }
  if (language === 'te') {
    const direction = i.direction === 'rising' ? 'పెరుగుతున్న' : i.direction === 'falling' ? 'తగ్గుతున్న' : 'స్థిరమైన';
    const range = status === 'above' ? 'చివరి ఫలితం ఆ నివేదికలోని ఎగువ పరిమితి కంటే ఎక్కువగా ఉంది.' : status === 'below' ? 'చివరి ఫలితం ఆ నివేదికలోని దిగువ పరిమితి కంటే తక్కువగా ఉంది.' : status === 'within' ? 'చివరి ఫలితం ఆ నివేదికలోని పరిమితుల్లో ఉంది.' : 'చివరి నివేదికలో పోల్చడానికి పరిమితులు లేవు.';
    return `${i.analyte}: ${first} న ${i.firstValue} ${i.unit}, ${last?.date ?? ''} న ${i.lastValue} ${i.unit}. కాలక్రమంలో ${direction} ధోరణి ఉంది. ${range} ఈ ఫలితాల గురించి మీ వైద్యుడితో మాట్లాడండి.`;
  }
  const range = status === 'above' ? 'The latest result is above its report’s upper limit.' : status === 'below' ? 'The latest result is below its report’s lower limit.' : status === 'within' ? 'The latest result is within its report’s range.' : 'The latest report has no reference range to compare.';
  return `${i.statement} ${range} Please discuss these results with your doctor.`;
}

export function isSafeWarningMessage(message: string | null | undefined): message is string {
  return typeof message === 'string' && !!message.trim() && !/(?:<\/?think\b|<\|(?:analysis|channel)|\bwe (?:need|must|should)\b|\bi (?:need to|should|must) (?:respond|answer|restate)|reply only in|system prompt|let['’]s (?:craft|think)|restat(?:e|ing) the finding|sentence \d+:)/i.test(message);
}
