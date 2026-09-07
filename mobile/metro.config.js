const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// The API and mobile app share transport contracts from the repository root.
// Metro must watch that folder before it will resolve an import that sits
// outside the mobile project root.
config.watchFolders = [path.resolve(__dirname, '..', 'shared')];

/**
 * Cross-origin isolation, needed only by `expo start --web`.
 *
 * expo-sqlite's web build talks to its worker over a SharedArrayBuffer and
 * blocks on Atomics.wait (see expo-sqlite/web/WorkerChannel.ts). Browsers only
 * expose SharedArrayBuffer to a cross-origin-isolated page, so without these
 * two headers the constructor throws inside the worker and every database call
 * hangs forever -- no error, no rejection, just a screen stuck on "Thinking...".
 *
 * "credentialless" rather than "require-corp" so the API server on :8787 stays
 * fetchable without needing a Cross-Origin-Resource-Policy header of its own.
 *
 * Native builds never see this: it is dev-server middleware only.
 */
config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return middleware(req, res, next);
  },
};

/**
 * wa-sqlite ships as a .wasm file, and Metro does not treat .wasm as an asset
 * by default -- so the worker's fetch for it 404s and the database call never
 * settles. The SDK 57 docs call this out as a required step for web.
 */
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

module.exports = config;
