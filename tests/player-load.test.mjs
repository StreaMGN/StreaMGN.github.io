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

test('initial TV playback starts through the selected episode path before metadata', async () => {
  const appSource = await readProjectFile('assets/app.js');
  const playerStart = appSource.indexOf('async function openPlayer');
  const playerEnd = appSource.indexOf('\nasync function loadEpisodesForPlayer', playerStart);
  const playerCode = appSource.slice(playerStart, playerEnd);
  const metadataLoad = playerCode.indexOf('await loadEpisodesForPlayer');
  const selectedEpisodeLoad = playerCode.indexOf('loadSelectedTvEpisode(lastS,lastE);');

  assert.ok(metadataLoad >= 0, 'season and episode metadata must still load');
  assert.ok(selectedEpisodeLoad >= 0, 'initial playback must use the selected-episode flow');
  assert.ok(selectedEpisodeLoad < metadataLoad, 'initial playback must start before metadata requests finish');
  assert.doesNotMatch(playerCode, /setPlayerFrameSrc\(id,type,lastS,lastE/);
});

test('player suppresses the blocked referrer on the first and PiP navigations', async () => {
  const [app, html] = await Promise.all([
    readProjectFile('assets/app.js'),
    readProjectFile('index.html')
  ]);
  const iframe = html.match(/<iframe id="vix-frame"[^>]*>/)?.[0] || '';
  const prepareStart = app.indexOf('function preparePlayerFrame');
  const prepareEnd = app.indexOf('\nfunction buildSrcToggle', prepareStart);
  const prepareCode = app.slice(prepareStart, prepareEnd);
  const setterStart = app.indexOf('function setIframeSrcIfChanged');
  const setterEnd = app.indexOf('\nfunction setFrameMessage', setterStart);
  const setterCode = app.slice(setterStart, setterEnd);
  const pipStart = app.indexOf("const ic=pw.document.createElement('iframe')");
  const pipEnd = app.indexOf("ic.style.cssText", pipStart);
  const pipCode = app.slice(pipStart, pipEnd);

  assert.match(iframe, /referrerpolicy="no-referrer"/);
  assert.match(prepareCode, /frame\.referrerPolicy=PLAYER_REFERRER_POLICY/);
  assert.ok(setterCode.indexOf('preparePlayerFrame(frame)') < setterCode.indexOf('frame.src=next'), 'every iframe navigation must set the referrer policy first');
  assert.ok(pipCode.indexOf('ic.referrerPolicy=') < pipCode.indexOf('ic.src='), 'PiP must set the referrer policy before navigating');
});

test('player does not perform the delayed VixSrc self-heal navigation', async () => {
  const [app, html, css] = await Promise.all([
    readProjectFile('assets/app.js'),
    readProjectFile('index.html'),
    readProjectFile('assets/styles.css')
  ]);

  assert.doesNotMatch(app, /scheduleVixsrcSelfHeal|cfSelfHeal|_r=/);
  assert.doesNotMatch(html, /pm-cf-overlay/);
  assert.doesNotMatch(css, /pm-cf-overlay/);
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
    assert.match(source, /20260812-player22/);
  }
});
