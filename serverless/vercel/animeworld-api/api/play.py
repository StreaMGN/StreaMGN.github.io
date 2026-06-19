from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import json
from difflib import SequenceMatcher

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
    return base


def int_or_default(value, default):
    try:
        return int(float(str(value)))
    except Exception:
        return default


def result_score(result, title, season):
    name = str(result.get("name") or result.get("jtitle") or "")
    ratio = SequenceMatcher(None, name.lower(), title.lower()).ratio() * 100
    score = ratio
    if result.get("dub") is True:
        score += 25
    if name.lower() == title.lower():
        score += 35
    if int_or_default(season, 1) > 1 and str(season) in name:
        score += 8
    return score


def pick_anime(titles, season):
    best = None
    best_score = -1
    for title in titles:
        try:
            results = aw.find(title)
        except Exception:
            continue
        for result in results or []:
            score = result_score(result, title, season)
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
            season = query.get("season", ["1"])[0]
            episode = query.get("episode", ["1"])[0]
            titles = title_candidates(query, season)
            if not titles:
                status, body = payload({"ok": False, "error": "missing title"}, 400)
            else:
                result = pick_anime(titles, season)
                if not result or not result.get("link"):
                    status, body = payload({"ok": False, "error": "anime not found"}, 404)
                else:
                    ep = pick_episode(result["link"], episode)
                    if not ep:
                        status, body = payload({"ok": False, "error": "episode not found"}, 404)
                    else:
                        stream_url, server_name = pick_stream(ep)
                        status, body = payload(
                            {
                                "ok": True,
                                "provider": "animeworld",
                                "embedUrl": stream_url,
                                "streamUrl": stream_url,
                                "server": server_name,
                                "animeTitle": result.get("name"),
                                "animeWorldLink": result.get("link"),
                                "season": int_or_default(season, 1),
                                "episode": str(ep.number),
                            }
                        )
        except Exception as exc:
            status, body = payload({"ok": False, "error": str(exc)}, 500)

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
