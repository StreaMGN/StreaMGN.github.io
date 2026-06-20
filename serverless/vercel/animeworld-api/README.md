# StreaMGN AnimeWorld API Wrapper

Wrapper Vercel per usare `AnimeWorld-API` come provider anime doppiato italiano.

Il frontend statico non puo risolvere gli episodi AnimeWorld direttamente dal browser:
serve questo wrapper per ottenere un link video reale.

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
GET /play?title=...&titles=...&season=1&episode=1&dub=1
```

`dub=1` e il comportamento predefinito: il wrapper preferisce e richiede risultati
con `dub: true` o `language: it`.

Risposta:

```json
{
  "ok": true,
  "provider": "animeworld",
  "animeTitle": "Death Note (ITA)",
  "dub": true,
  "language": "it",
  "embedUrl": "https://...",
  "streamUrl": "https://..."
}
```

## Verifica eseguita

Testato con:

```text
GET /play?title=Death%20Note&season=1&episode=1
```

Risultato verificato: `Death Note (ITA)`, `dub: true`, `language: it`, episodio `1`,
link `video/mp4` raggiungibile con risposta HTTP `200`.
