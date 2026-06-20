from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json
from difflib import SequenceMatcher
import os

import animeworld as aw


def unique(items):
    seen = set()
    out = []
    for item in items:
        text = str(item or "").strip()
        if not text or text.lower() in seen:
            continue
        seen.add(text.lower())
        out.append(text)
    return out


def title_candidates(query, season):
    base = unique(
        query.get("title", [])
        + query.get("titles", [])
        + query.get("q", [])
        + query.get("keyword", [])
    )
    if int_or_default(season, 1) > 1:
        extra = []
        for title in base:
            extra.extend(
                [
                    f"{title} {season}",
                    f"{title} stagione {season}",
                    f"{title} season {season}",
                ]
            )
        base = unique(extra + base)
    ita = []
    for title in base:
        lower = title.lower()
        if "ita" not in lower and "italiano" not in lower:
            ita.extend([f"{title} ITA", f"{title} italiano"])
    return unique(ita + base)


def int_or_default(value, default):
    try:
        return int(float(str(value)))
    except Exception:
        return default


def is_italian_dub(result):
    return result.get("dub") is True or str(result.get("language") or "").lower() == "it"


def bool_query(query, key, default=True):
    raw = (query.get(key, [str(default)])[0] or "").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def result_score(result, title, season, require_dub=True):
    name = str(result.get("name") or result.get("jtitle") or "")
    ratio = SequenceMatcher(None, name.lower(), title.lower()).ratio() * 100
    score = ratio
    dubbed = is_italian_dub(result)
    if dubbed:
        score += 160
        if "(ita)" in name.lower():
            score += 25
    elif require_dub:
        score -= 220
    if name.lower() == title.lower():
        score += 35
    if int_or_default(season, 1) > 1 and str(season) in name:
        score += 8
    return score


def pick_anime(titles, season, require_dub=True):
    best = None
    best_score = -1
    for title in titles:
        try:
            results = aw.find(title)
        except Exception:
            continue
        for result in results or []:
            if require_dub and not is_italian_dub(result):
                continue
            score = result_score(result, title, season, require_dub=require_dub)
            if score > best_score:
                best = result
                best_score = score
    return best


def pick_episode(anime_link, episode_number):
    anime = aw.Anime(anime_link)
    episodes = anime.getEpisodes([str(episode_number), int_or_default(episode_number, 1)])
    if not episodes:
        episodes = anime.getEpisodes()
    for episode in episodes:
        if str(episode.number) == str(episode_number):
            return episode
    return episodes[0] if episodes else None


def pick_stream(episode):
    errors = []
    for server in episode.links:
        try:
            url = server.fileLink()
            if url:
                return url, getattr(server, "name", "AnimeWorld")
        except Exception as exc:
            errors.append(str(exc))
    raise RuntimeError("; ".join(errors) or "no playable server")


def resolve_anime(query):
    season = query.get("season", ["1"])[0]
    episode = query.get("episode", ["1"])[0]
    require_dub = bool_query(
        query,
        "dub",
        default=os.environ.get("STREAMGN_REQUIRE_DUB", "1") != "0",
    )
    titles = title_candidates(query, season)
    if not titles:
        return {"ok": False, "error": "missing title"}, 400

    result = pick_anime(titles, season, require_dub=require_dub)
    if not result and require_dub and bool_query(query, "allowSubFallback", default=False):
        result = pick_anime(titles, season, require_dub=False)
    if not result or not result.get("link"):
        msg = "anime doppiato italiano non trovato" if require_dub else "anime not found"
        return {"ok": False, "error": msg, "titles": titles}, 404
    if require_dub and not is_italian_dub(result):
        return {"ok": False, "error": "doppiaggio italiano non disponibile", "animeTitle": result.get("name")}, 404

    ep = pick_episode(result["link"], episode)
    if not ep:
        return {"ok": False, "error": "episode not found", "animeTitle": result.get("name")}, 404

    stream_url, server_name = pick_stream(ep)
    return {
        "ok": True,
        "provider": "animeworld",
        "embedUrl": stream_url,
        "streamUrl": stream_url,
        "server": server_name,
        "animeTitle": result.get("name"),
        "animeWorldLink": result.get("link"),
        "dub": is_italian_dub(result),
        "language": result.get("language"),
        "season": int_or_default(season, 1),
        "episode": str(ep.number),
    }, 200


def payload(data, status=200):
    body = json.dumps(data).encode("utf-8")
    return status, body


class handler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        try:
            query = parse_qs(urlparse(self.path).query)
            data, status_code = resolve_anime(query)
            status, body = payload(data, status_code)
        except Exception as exc:
            status, body = payload({"ok": False, "error": str(exc)}, 500)

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
