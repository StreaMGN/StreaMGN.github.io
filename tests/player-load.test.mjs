import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const readProjectFile = path => readFile(new URL(path, root), 'utf8');

function loadProviders(config = {}, fetchImpl = async () => ({ ok: false })) {
  const window = {
    STREAMGN_CONFIG: config,
    innerHeight: 900,
    innerWidth: 1440,
    matchMedia: () => ({ matches: false })
  };
  const context = {
    AbortController,
    URL,
    URLSearchParams,
    clearTimeout,
    console,
    fetch: fetchImpl,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { maxTouchPoints: 0, platform: '', userAgent: '' },
    screen: { height: 900, width: 1440 },
    setTimeout,
    window
  };
  vm.runInNewContext(providerSource, context, { filename: 'assets/providers.js' });
  return window.StreamGNProviders;
}

const providerSource = await readProjectFile('assets/providers.js');

test('normal playback shows the app message before provider resolution when no fallback is configured', async () => {
  const appSource = await readProjectFile('assets/app.js');
  const playerStart = appSource.indexOf('async function setPlayerFrameSrc');
  const playerEnd = appSource.indexOf('\n/* TRAILERS */', playerStart);
  const playerCode = appSource.slice(playerStart, playerEnd);
  const loadingMessage = playerCode.indexOf("setFrameMessage(fr,'Caricamento player'");
  const providerAwait = playerCode.indexOf('await withTimeout(resolveStreamResult');

  assert.ok(loadingMessage >= 0, 'the app must show a loading message instead of a third-party fallback');
  assert.ok(providerAwait > loadingMessage, 'the message must be visible before waiting for the provider');
  assert.doesNotMatch(playerCode.slice(0, providerAwait), /about:blank/);
});

test('provider returns no public fallback when no backend is configured', async () => {
  const providers = loadProviders();
  const result = await providers.getMovieStream({ id: '157336', type: 'movie' });

  assert.equal(result.ok, false);
  assert.equal(result.embedUrl, '');
});

test('cancelling a backend request returns the fallback without leaving a pending fetch', async () => {
  let receivedSignal;
  const providers = loadProviders(
    { streamApiBase: 'https://provider.example.test' },
    (_url, options) => new Promise((resolve, reject) => {
      receivedSignal = options.signal;
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
    })
  );
  const controller = new AbortController();
  const resultPromise = providers.getMovieStream({ id: '157336', type: 'movie' }, { signal: controller.signal });

  controller.abort();
  const result = await resultPromise;

  assert.equal(receivedSignal.aborted, true);
  assert.equal(result.embedUrl, '');
});

test('all PWA entry points reference the same player build', async () => {
  const [app, html, manifest, worker] = await Promise.all([
    readProjectFile('assets/app.js'),
    readProjectFile('index.html'),
    readProjectFile('manifest.webmanifest'),
    readProjectFile('sw.js')
  ]);

  for (const source of [app, html, manifest, worker]) {
    assert.match(source, /20260804-player20/);
  }
});
