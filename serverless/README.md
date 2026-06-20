# StreaMGN Provider API

Questo backend e opzionale: il sito resta compatibile con GitHub Pages.
Quando `streamApiBase` in `assets/config.js` e vuoto, il frontend usa i fallback locali.
Quando `streamApiBase` punta al Worker, il frontend chiede sempre al backend.

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
- `GET /play/anime/:id?title=...&season=1&episode=1`
- `GET /sport/live`

Ogni endpoint risponde con:

```json
{
  "ok": true,
  "provider": "vixsrc",
  "embedUrl": "https://..."
}
```

## Provider

Configura i provider con variabili Cloudflare:

- `MOVIE_PROVIDERS=vixsrc`
- `TV_PROVIDERS=vixsrc`
- `ANIME_PROVIDERS=animeworld,tadako`
- `SPORT_PROVIDERS=configured`

Anime usa fallback automatico:

```text
AnimeWorld
  -> Tadako
  -> errore JSON
```

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

- `animeworld` usa il wrapper Vercel in `serverless/vercel/animeworld-api`, configurabile con `ANIMEWORLD_API_BASE`.
- `tadako` richiede un piccolo servizio wrapper Node/TypeScript, configurabile con `TADAKO_API_BASE`.
- Il frontend invia sempre `title`, eventuali `titles` alternativi, `id`, `season` ed `episode`.
- Un wrapper AnimeWorld/Tadako compatibile puo esporre `GET /play`, `GET /stream`, `GET /find` o `GET /search` e deve rispondere con `embedUrl`, `iframeUrl`, `url` o `streamUrl`.
- Per evitare caricamenti infiniti, il frontend non usa piu lo scraping AnimeWorld diretto dal browser: senza wrapper/API configurata mostra errore gestito.
- Il frontend non deve cambiare se in futuro sostituisci AnimeWorld, Tadako o Sport.
