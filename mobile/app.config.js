const fs = require('node:fs');
const path = require('node:path');

// Embed the existing provider configuration in this personal APK.
module.exports = ({ config }) => {
  const envPath = path.resolve(__dirname, '../server/.env');
  const local = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
  const setting = (name) => process.env[name] || local[name];
  return {
    ...config,
    extra: {
      ...config.extra,
      ai: {
        nvidiaApiKey: setting('EXPO_PUBLIC_NVIDIA_API_KEY') || setting('NVIDIA_API_KEY'),
        baseUrl: setting('NIM_BASE_URL'),
        parseModel: setting('NIM_PARSE_MODEL'),
        extractModel: setting('NIM_EXTRACT_MODEL'),
        answerModel: setting('NIM_ANSWER_MODEL'),
        teluguModel: setting('NIM_TELUGU_MODEL'),
      },
    },
  };
};
