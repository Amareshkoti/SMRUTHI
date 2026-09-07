/**
 * Adds the two cross-origin-isolation headers to Expo's web dev server.
 *
 * Why this exists: expo-sqlite's web build reaches its worker through a
 * SharedArrayBuffer and blocks on Atomics.wait. Browsers only hand out
 * SharedArrayBuffer to a cross-origin-isolated page, so without these headers
 * the constructor throws inside the worker and every query hangs forever --
 * a screen stuck on "Thinking..." with no error anywhere.
 *
 * Expo's dev server is not plain Metro and ignores metro.config.js's
 * `server.enhanceMiddleware`, and the headers option the SDK 57 docs describe
 * is part of the expo-router plugin, which this app does not use. So we sit in
 * front of it instead.
 *
 * Node builtins only -- no dependency to install.
 *
 *   node web-dev-proxy.js          then open http://localhost:8090
 *
 * Nothing native ever goes through here; it is a browser-only convenience.
 */
const http = require('http');

// 8090, not 8080: something else on this machine already holds 8080.
const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 8090);
const TARGET_PORT = Number(process.env.METRO_PORT ?? 8081);
const TARGET_HOST = '127.0.0.1';

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  // "credentialless" rather than "require-corp" so the API server on :8787
  // stays fetchable without needing a CORP header of its own.
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

const server = http.createServer((clientReq, clientRes) => {
  const proxyReq = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      method: clientReq.method,
      path: clientReq.url,
      headers: { ...clientReq.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode ?? 502, {
        ...proxyRes.headers,
        ...ISOLATION_HEADERS,
      });
      proxyRes.pipe(clientRes, { end: true });
    },
  );

  proxyReq.on('error', (err) => {
    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end(
      `Cannot reach Metro on ${TARGET_HOST}:${TARGET_PORT}.\n` +
        `Start it first with:  npx expo start --web --port ${TARGET_PORT}\n\n${err.message}\n`,
    );
  });

  clientReq.pipe(proxyReq, { end: true });
});

// Hot reload rides on a WebSocket; without this the page loads but never
// refreshes on save.
server.on('upgrade', (req, socket, head) => {
  const proxyReq = http.request({
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}\r\n`)
          .join('') +
        '\r\n',
    );
    if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });

  proxyReq.on('error', () => socket.destroy());
  if (head && head.length) proxyReq.write(head);
  proxyReq.end();
});

server.listen(LISTEN_PORT, () => {
  console.log('');
  console.log('  Cross-origin-isolated proxy for the SMRUTI web build');
  console.log('');
  console.log(`  open this  ->  http://localhost:${LISTEN_PORT}`);
  console.log(`  forwarding to Metro on ${TARGET_HOST}:${TARGET_PORT}`);
  console.log('');
  console.log('  (opening :8081 directly will hang on any database call)');
  console.log('');
});
