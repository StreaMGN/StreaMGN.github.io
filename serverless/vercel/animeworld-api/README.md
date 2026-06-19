# StreaMGN AnimeWorld API Wrapper

Wrapper Vercel opzionale per usare `AnimeWorld-API` come provider anime.

## Deploy

```bash
cd serverless/vercel/animeworld-api
vercel deploy
```

Poi usa l'URL Vercel in uno di questi modi:

- nel Worker Cloudflare: `ANIMEWORLD_API_BASE=https://nome-progetto.vercel.app`
- oppure direttamente nel frontend: `animeWorldApiBase: 'https://nome-progetto.vercel.app'`

## Endpoint

```text
GET /play?title=...&titles=...&season=1&episode=1
```

Risposta:

```json
{
  "ok": true,
  "provider": "animeworld",
  "embedUrl": "https://...",
  "streamUrl": "https://..."
}
```
