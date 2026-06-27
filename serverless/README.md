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
  -> /external/anime?url=https://www.animeunity.so
  -> /external/sport?url=https://pepperstream.xyz/index.php

Cloudflare Worker
  -> Movie Provider
  -> TV Provider
  -> Anime Provider
  -> Sport Provider
  -> External site proxy for iframe-safe Anime/Sport pages
```

## Endpoint

- `GET /health`
- `GET /play/movie/:id`
- `GET /play/tv/:id/:season/:episode`
- `GET /play/anime/:id?anilistId=16498&flatEpisode=1`
- `GET /sport/live`
- `GET /external/anime?url=https://www.animeunity.so`
- `GET /external/sport?url=https://pepperstream.xyz/index.php`

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
- `EXTERNAL_ANIME_URL=https://www.animeunity.so`
- `EXTERNAL_SPORT_URL=https://pepperstream.xyz/index.php`
- `EXTERNAL_PROXY_ALLOWED_HOSTS=animeunity.so,www.animeunity.so,pepperstream.xyz,www.pepperstream.xyz`

Gli anime usano solo Streamrip. Il frontend risolve automaticamente l'ID AniList e invia anche `flatEpisode`, perche Streamrip usa una numerazione episodio piatta.

## Sezioni Anime e Sport integrate

AnimeUnity e Pepperstream inviano header anti-iframe. Il frontend quindi usa `/external/anime` e `/external/sport` quando `streamApiBase` punta al Worker: il Worker recupera la pagina esterna, rimuove gli header che bloccano l'iframe e riscrive link e asset per mantenere la navigazione dentro StreaMGN.

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

### Deploy da GitHub Actions

Il repository include anche `.github/workflows/deploy-worker.yml`.

1. Su GitHub apri `Settings -> Secrets and variables -> Actions`.
2. Aggiungi questi secret:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Fai push su `main` oppure lancia manualmente `Deploy StreamGN Worker`.
4. Dopo il deploy, copia l'URL del Worker in `assets/remote-config.json`:

```json
"streamApiBase": "https://streamgn-provider-api.<tuo-subdomain>.workers.dev"
```

Da quel momento le sezioni Anime e Sport useranno il proxy `/external/anime` e `/external/sport` per restare visibili dentro il sito.

### Errore workers.dev non registrato

Se GitHub Actions fallisce con:

```text
You need to register a workers.dev subdomain before publishing to workers.dev
```

non e un errore del codice: Cloudflare deve ancora creare il sottodominio Workers dell'account.

1. Apri Cloudflare Dashboard.
2. Vai su `Workers & Pages`.
3. Entra nella schermata iniziale/onboarding dei Workers.
4. Registra un sottodominio `workers.dev` quando Cloudflare lo chiede.
5. Torna su GitHub -> `Actions` -> `Deploy StreamGN Worker`.
6. Premi `Run workflow`.

Quando il deploy riesce, l'URL sara simile a:

```text
https://streamgn-provider-api.<tuo-subdomain>.workers.dev
```

Copialo in `assets/remote-config.json` dentro `streamApiBase`.

## Note provider anime

- `STREAMRIP_BASE_URL` controlla la base dell'iframe anime.
- `ANILIST_API_BASE` controlla la risoluzione titolo -> AniList, se serve farla lato Worker.
- Il frontend continua a funzionare anche senza Worker.
