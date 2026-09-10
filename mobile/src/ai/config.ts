import Constants from 'expo-constants';
export type { Language } from '../../../shared/contracts';
const settings = Constants.expoConfig?.extra?.ai ?? {};
export const config = {
  nvidiaApiKey: String(settings.nvidiaApiKey ?? ''),
  nimBaseUrl: String(settings.baseUrl ?? 'https://integrate.api.nvidia.com/v1'),
  mock: false,
  models: {
    parse: String(settings.parseModel ?? 'nvidia/nemotron-parse'),
    extract: String(settings.extractModel ?? 'nvidia/nemotron-3-super-120b-a12b'),
    answer: String(settings.answerModel ?? 'nvidia/nemotron-3-super-120b-a12b'),
    answerTelugu: String(settings.teluguModel ?? 'nvidia/nemotron-3-ultra-550b-a55b'),
  },
};
