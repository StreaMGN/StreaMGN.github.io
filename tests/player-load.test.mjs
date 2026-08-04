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

test('normal playback has an immediate fallback before provider resolution', async () => {
  const appSource = await readProjectFile('assets/app.js');
  const playerStart = appSource.indexOf('async function setPlayerFrameSrc');
  const playerEnd = appSource.indexOf('\n/* TRAILERS */', playerStart);
  const playerCode = appSource.slice(playerStart, playerEnd);
  const fallbackWrite = playerCode.indexOf('setIframeSrcIfChanged(fr,fallback);');
  const providerAwait = playerCode.indexOf('await withTimeout(resolveStreamResult');

  assert.ok(fallbackWrite >= 0, 'the fallback must be assigned to the iframe');
  assert.ok(providerAwait > fallbackWrite, 'the fallback must load before waiting for the provider');
  assert.doesNotMatch(playerCode.slice(0, providerAwait), /about:blank/);
});

test('provider uses its standard URL when no backend is configured', async () => {
  const providers = loadProviders();
  const result = await providers.getMovieStream({ id: '157336', type: 'movie' });

  assert.equal(result.ok, true);
  assert.equal(result.embedUrl, 'https://vixsrc.to/movie/157336?hl=it');
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
  assert.equal(result.embedUrl, 'https://vixsrc.to/movie/157336?hl=it');
});

test('all PWA entry points reference the same player build', async () => {
  const [app, html, manifest, worker] = await Promise.all([
    readProjectFile('assets/app.js'),
    readProjectFile('index.html'),
    readProjectFile('manifest.webmanifest'),
    readProjectFile('sw.js')
  ]);

  for (const source of [app, html, manifest, worker]) {
    assert.match(source, /20260804-player19/);
  }
});
