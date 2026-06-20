# StreaMGN Provider API

Questo backend e opzionale: il sito resta compatibile con GitHub Pages.
Quando `streamApiBase` in `assets/config.js` e vuoto, il frontend usa i fallback locali.
Quando `streamApiBase` punta al Worker, il frontend chiede al backend.

## Architettura

```text
Frontend GitHub Pages
  -> /play/movie/:id
  -> /play/tv/:id/:season/:episode
  -> /play/anime/:id
  -> /sport/live

Cloudflare Worker
  -> Movie Provider
  -> TV Provider
  -> Anime Provider
  -> Sport Provider
```

## Endpoint

- `GET /health`
- `GET /play/movie/:id`
- `GET /play/tv/:id/:season/:episode`
- `GET /play/anime/:id?anilistId=16498&flatEpisode=1`
- `GET /sport/live`

Ogni endpoint risponde con:

```json
{
  "ok": true,
  "provider": "streamrip",
  "embedUrl": "https://..."
}
```

## Provider

Configura i provider con variabili Cloudflare:

- `MOVIE_PROVIDERS=vixsrc`
- `TV_PROVIDERS=vixsrc`
- `ANIME_PROVIDERS=streamrip`
- `SPORT_PROVIDERS=configured`

Gli anime usano solo Streamrip. Il frontend risolve automaticamente l'ID AniList e invia anche `flatEpisode`, perche Streamrip usa una numerazione episodio piatta.

## Deploy Cloudflare Workers

1. Copia `serverless/cloudflare/wrangler.toml.example` in `wrangler.toml`.
2. Aggiorna `CORS_ORIGIN` con il dominio reale del sito.
3. Deploy:

```bash
cd serverless/cloudflare
wrangler deploy
```

4. Prendi l'URL del Worker e mettilo in `assets/config.js`:

```js
streamApiBase: 'https://api.streamgn.it'
```

## Note provider anime

- `STREAMRIP_BASE_URL` controlla la base dell'iframe anime.
- `ANILIST_API_BASE` controlla la risoluzione titolo -> AniList, se serve farla lato Worker.
- Il frontend continua a funzionare anche senza Worker.
