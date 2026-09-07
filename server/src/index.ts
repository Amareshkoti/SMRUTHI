import { app } from './app.js';
import { assertConfigured, config } from './config.js';

assertConfigured();
app.listen(config.port, () => console.log(`SMRUTI API listening on port ${config.port} (demo: ${config.mock})`));
