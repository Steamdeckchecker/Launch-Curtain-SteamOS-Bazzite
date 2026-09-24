from __future__ import annotations

import asyncio
import base64
import json
import mimetypes
import os
import re
import ssl
import struct
import urllib.parse
import urllib.request
import zlib
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict

import decky

DEFAULTS: Dict[str, Any] = {
    "enabled": True,
    "show_logo": True,
    "show_status": True,
    "background_source": "steam",
    "custom_background_path": "",
    "background_opacity": 100,
    "logo_scale": 100,
    "timeout_seconds": 45,
    "exit_delay_seconds": 1.5,
    "zoom_background": True,
}


def _homebrew_root() -> Path:
    plugin_dir = Path(__file__).resolve().parent
    plugins_dir = plugin_dir.parent
    if plugins_dir.name.lower() == "plugins":
        return plugins_dir.parent
    return Path.home() / "homebrew"


def _data_dir() -> Path:
    # Keep settings outside the plugin folder so ZIP updates do not wipe them.
    candidate = getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", None)
    if candidate:
        path = Path(str(candidate)) / "launch-curtain-steamos"
    else:
        path = _homebrew_root() / "data" / "launch-curtain-steamos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _settings_path() -> Path:
    return _data_dir() / "settings.json"


def _merge_settings(value: Any) -> Dict[str, Any]:
    out = dict(DEFAULTS)
    if isinstance(value, dict):
        out.update(value)
    out["enabled"] = bool(out.get("enabled", True))
    out["show_logo"] = bool(out.get("show_logo", True))
    out["show_status"] = bool(out.get("show_status", True))
    out["zoom_background"] = bool(out.get("zoom_background", True))
    source = str(out.get("background_source", "steam") or "steam")
    out["background_source"] = source if source in {"steam", "custom", "black"} else "steam"
    out["custom_background_path"] = str(out.get("custom_background_path", "") or "")
    try:
        out["background_opacity"] = max(0, min(100, int(round(float(out.get("background_opacity", 100))))))
    except Exception:
        out["background_opacity"] = 100
    try:
        out["logo_scale"] = max(50, min(160, int(round(float(out.get("logo_scale", 100))))))
    except Exception:
        out["logo_scale"] = 100
    try:
        out["timeout_seconds"] = max(10, min(120, int(round(float(out.get("timeout_seconds", 45))))))
    except Exception:
        out["timeout_seconds"] = 45
    try:
        out["exit_delay_seconds"] = max(0.0, min(8.0, float(out.get("exit_delay_seconds", 1.5))))
    except Exception:
        out["exit_delay_seconds"] = 1.5
    return out


def _load() -> Dict[str, Any]:
    try:
        with _settings_path().open("r", encoding="utf-8") as f:
            return _merge_settings(json.load(f))
    except Exception:
        return dict(DEFAULTS)


def _save(settings: Dict[str, Any]) -> Dict[str, Any]:
    settings = _merge_settings(settings)
    with _settings_path().open("w", encoding="utf-8") as f:
        json.dump(settings, f, ensure_ascii=False, indent=2)
    return settings


def _safe_file(path: str) -> Path | None:
    try:
        p = Path(os.path.expanduser(str(path or ""))).resolve()
        if p.is_file():
            return p
    except Exception:
        pass
    return None


def _image_data_url(path: Path, max_bytes: int = 8 * 1024 * 1024) -> str:
    try:
        if path.stat().st_size > max_bytes:
            return ""
        data = path.read_bytes()
        mime = mimetypes.guess_type(path.name)[0] or "image/png"
        return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
    except Exception:
        return ""


def _unique_existing_dirs(paths):
    out = []
    seen = set()
    for raw in paths:
        try:
            path = Path(raw).expanduser()
            if not path.exists():
                continue
            try:
                key = str(path.resolve())
            except Exception:
                key = str(path)
            if key in seen:
                continue
            seen.add(key)
            out.append(path)
        except Exception:
            continue
    return out


def _steam_roots():
    home = Path.home()
    candidates = [
        home / ".local" / "share" / "Steam",
        home / ".steam" / "steam",
    ]
    env_root = os.environ.get("STEAM_COMPAT_CLIENT_INSTALL_PATH") or os.environ.get("STEAM_INSTALL_PATH")
    if env_root:
        candidates.insert(0, Path(env_root))
    # Useful on SteamOS/Bazzite when Decky runs with a different HOME than the gaming user.
    for user_home in (Path("/home/deck"), Path("/home/bazzite"), Path("/home/gamer")):
        candidates.extend([user_home / ".local" / "share" / "Steam", user_home / ".steam" / "steam"])
    # Also discover custom Linux usernames. Decky may run as root while Steam runs as the desktop user.
    try:
        for user_home in Path("/home").iterdir():
            if user_home.is_dir():
                candidates.extend([user_home / ".local" / "share" / "Steam", user_home / ".steam" / "steam"])
    except Exception:
        pass
    return _unique_existing_dirs(candidates)


def _decode_vdf_string(value: str) -> str:
    return value.replace("\\\\", "\\").replace('\\\"', '"')


def _steam_library_paths():
    paths = []
    for root in _steam_roots():
        paths.append(root)
        vdf = root / "steamapps" / "libraryfolders.vdf"
        try:
            text = vdf.read_text(encoding="utf-8", errors="ignore")
            for match in re.finditer(r'"path"\s+"((?:\\.|[^"\\])*)"', text, re.I):
                raw = _decode_vdf_string(match.group(1))
                if raw:
                    paths.append(Path(raw))
        except Exception:
            pass
    return _unique_existing_dirs(paths)


def _read_manifest_title(app_id: int) -> str:
    for library in _steam_library_paths():
        manifest = library / "steamapps" / f"appmanifest_{app_id}.acf"
        try:
            text = manifest.read_text(encoding="utf-8", errors="ignore")
            match = re.search(r'"name"\s+"((?:\\.|[^"\\])*)"', text, re.I)
            if match:
                return _decode_vdf_string(match.group(1)).strip()
        except Exception:
            pass
    return ""


def _read_cstring(data: bytes, pos: int):
    end = data.find(b"\x00", pos)
    if end < 0:
        raise ValueError("unterminated VDF string")
    return data[pos:end].decode("utf-8", errors="replace"), end + 1


def _parse_binary_vdf_object(data: bytes, pos: int):
    out = {}
    length = len(data)
    while pos < length:
        value_type = data[pos]
        pos += 1
        if value_type == 0x08:
            return out, pos
        key, pos = _read_cstring(data, pos)
        key_l = key.lower()
        if value_type == 0x00:
            value, pos = _parse_binary_vdf_object(data, pos)
        elif value_type == 0x01:
            value, pos = _read_cstring(data, pos)
        elif value_type == 0x02:
            if pos + 4 > length:
                raise ValueError("truncated VDF int32")
            value = struct.unpack_from("<i", data, pos)[0]
            pos += 4
        elif value_type == 0x03:
            if pos + 4 > length:
                raise ValueError("truncated VDF float")
            value = struct.unpack_from("<f", data, pos)[0]
            pos += 4
        elif value_type == 0x07:
            if pos + 8 > length:
                raise ValueError("truncated VDF uint64")
            value = struct.unpack_from("<Q", data, pos)[0]
            pos += 8
        else:
            raise ValueError(f"unsupported VDF type {value_type:#x}")
        out[key_l] = value
    return out, pos


def _parse_shortcuts_vdf(path: Path):
    try:
        data = path.read_bytes()
        root, _ = _parse_binary_vdf_object(data, 0)
        shortcuts = root.get("shortcuts", root)
        if not isinstance(shortcuts, dict):
            return []
        result = []
        for entry in shortcuts.values():
            if not isinstance(entry, dict):
                continue
            appid = entry.get("appid")
            appname = str(entry.get("appname") or "").strip()
            if not appname:
                continue
            raw_exe = str(entry.get("exe") or "").strip()
            exe = raw_exe.strip('"')
            appids = []
            if appid is not None:
                try:
                    appids.append(int(appid) & 0xFFFFFFFF)
                except Exception:
                    pass
            # Older shortcuts, and shortcuts written by some launchers, can omit the
            # explicit appid field. Steam's shortcut AppID is the high-bit-set CRC32
            # of the exact Exe field concatenated with AppName. Keep a few quoting
            # variants because third-party writers are inconsistent about Exe quotes.
            for key in (raw_exe + appname, exe + appname, f'"{exe}"' + appname):
                if not key:
                    continue
                derived = (zlib.crc32(key.encode("utf-8")) & 0xFFFFFFFF) | 0x80000000
                if derived not in appids:
                    appids.append(derived)
            result.append({
                "appid": appids[0] if appids else 0,
                "appids": appids,
                "appname": appname,
                "exe": exe,
                "raw_exe": raw_exe,
                "startdir": str(entry.get("startdir") or "").strip().strip('"'),
            })
        return result
    except Exception:
        return []


def _find_shortcut(app_id: int):
    target = int(app_id) & 0xFFFFFFFF
    seen = set()
    for root in _steam_roots():
        userdata = root / "userdata"
        if not userdata.is_dir():
            continue
        try:
            userdirs = list(userdata.iterdir())
        except Exception:
            continue
        for userdir in userdirs:
            shortcuts = userdir / "config" / "shortcuts.vdf"
            key = str(shortcuts)
            if key in seen or not shortcuts.is_file():
                continue
            seen.add(key)
            for entry in _parse_shortcuts_vdf(shortcuts):
                ids = entry.get("appids") or [entry.get("appid")]
                if target in ids:
                    entry["userdata_id"] = userdir.name
                    entry["shortcuts_path"] = str(shortcuts)
                    return entry
    return None


def _normalize_game_name(value: str) -> str:
    text = str(value or "").casefold()
    text = re.sub(r"[™®©]", "", text)
    text = re.sub(r"\b(non[- ]?steam|shortcut|launcher|game)\b", " ", text)
    text = re.sub(r"[^\w]+", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def _art_match_cache_path() -> Path:
    return _data_dir() / "artwork-title-cache.json"


def _load_art_match_cache():
    try:
        raw = json.loads(_art_match_cache_path().read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def _save_art_match_cache(cache):
    try:
        _art_match_cache_path().write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _steam_ssl_context():
    for cafile in (
        "/etc/ssl/certs/ca-certificates.crt",
        "/etc/pki/tls/certs/ca-bundle.crt",
        "/etc/ssl/cert.pem",
    ):
        try:
            if Path(cafile).is_file():
                return ssl.create_default_context(cafile=cafile)
        except Exception:
            pass
    return ssl.create_default_context()


def _search_steam_store_app_id(title: str) -> int:
    title = str(title or "").strip()
    norm = _normalize_game_name(title)
    if not norm:
        return 0
    cache = _load_art_match_cache()
    cached = cache.get(norm)
    try:
        if isinstance(cached, dict) and int(cached.get("app_id", 0)) > 0:
            return int(cached["app_id"])
    except Exception:
        pass

    params = urllib.parse.urlencode({"term": title, "l": "english", "cc": "DE"})
    url = f"https://store.steampowered.com/api/storesearch/?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "Launch-Curtain-SteamOS/1.0.7"})
    try:
        with urllib.request.urlopen(req, timeout=6, context=_steam_ssl_context()) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace"))
    except Exception:
        return 0

    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list) or not items:
        return 0

    best_id = 0
    best_name = ""
    best_score = 0.0
    for item in items[:20]:
        if not isinstance(item, dict):
            continue
        try:
            candidate_id = int(item.get("id") or 0)
        except Exception:
            continue
        candidate_name = str(item.get("name") or "").strip()
        candidate_norm = _normalize_game_name(candidate_name)
        if candidate_id <= 0 or not candidate_norm:
            continue
        if candidate_norm == norm:
            best_id, best_name, best_score = candidate_id, candidate_name, 1.0
            break
        score = SequenceMatcher(None, norm, candidate_norm).ratio()
        # Reward containment for names such as "Game - Definitive Edition".
        if norm in candidate_norm or candidate_norm in norm:
            score = max(score, 0.82)
        if score > best_score:
            best_id, best_name, best_score = candidate_id, candidate_name, score

    # Avoid obviously unrelated store results. Exact/near-exact shortcut names still match automatically.
    if best_id and best_score >= 0.68:
        cache[norm] = {"app_id": best_id, "matched_name": best_name, "score": round(best_score, 4)}
        _save_art_match_cache(cache)
        return best_id
    return 0


def _first_image(paths):
    seen = set()
    for path in paths:
        try:
            p = Path(path)
            key = str(p)
            if key in seen:
                continue
            seen.add(key)
            if p.is_file() and p.stat().st_size > 0:
                return p
        except Exception:
            continue
    return None


def _custom_grid_candidates(app_id: int, suffix: str):
    candidates = []
    for root in _steam_roots():
        userdata = root / "userdata"
        if not userdata.is_dir():
            continue
        try:
            userdirs = list(userdata.iterdir())
        except Exception:
            continue
        for userdir in userdirs:
            grid = userdir / "config" / "grid"
            for ext in ("png", "jpg", "jpeg", "webp"):
                candidates.append(grid / f"{app_id}_{suffix}.{ext}")
    return candidates


def _library_cache_candidates(app_id: int, kind: str):
    candidates = []
    if kind == "logo":
        names = ("logo.png", "logo.jpg", "library_logo.png", "library_logo.jpg")
        flat = (f"{app_id}_logo.png", f"{app_id}_logo.jpg")
    else:
        names = ("library_hero.jpg", "library_hero.png", "library_hero.webp", "library_hero_blur.jpg", "header.jpg")
        flat = (f"{app_id}_library_hero.jpg", f"{app_id}_library_hero.png", f"{app_id}_library_hero_blur.jpg", f"{app_id}_header.jpg")
    for root in _steam_roots():
        cache = root / "appcache" / "librarycache"
        candidates.extend(cache / name for name in flat)
        appdir = cache / str(app_id)
        candidates.extend(appdir / name for name in names)
        if appdir.is_dir():
            # Newer Steam clients can place assets one level below an app/hash directory.
            try:
                subdirs = [p for p in appdir.iterdir() if p.is_dir()]
            except Exception:
                subdirs = []
            for subdir in subdirs:
                candidates.extend(subdir / name for name in names)
    return candidates


def _resolve_steam_assets(app_id: int, title_hint: str = "") -> Dict[str, Any]:
    try:
        app_id = int(app_id) & 0xFFFFFFFF
    except Exception:
        return {"ok": False, "app_id": 0, "title": "", "logo": "", "hero": "", "is_shortcut": False, "art_app_id": 0}
    if app_id <= 0:
        return {"ok": False, "app_id": app_id, "title": "", "logo": "", "hero": "", "is_shortcut": False, "art_app_id": 0}

    # Custom artwork uses the shortcut's own random AppID, so always check it first.
    logo = _first_image(_custom_grid_candidates(app_id, "logo") + _library_cache_candidates(app_id, "logo"))
    hero = _first_image(_custom_grid_candidates(app_id, "hero") + _library_cache_candidates(app_id, "hero"))

    shortcut = _find_shortcut(app_id)
    manifest_title = _read_manifest_title(app_id)
    hint = str(title_hint or "").strip()
    title = str(shortcut.get("appname") or "").strip() if shortcut else (manifest_title or hint)
    # If no normal appmanifest exists but Steam's frontend knows a display name, treat it as
    # a shortcut-like entry. This is important for non-Steam games when shortcuts.vdf parsing
    # is unavailable or Decky runs under a different HOME.
    is_shortcut = bool(shortcut) or (not manifest_title and bool(hint))
    art_app_id = app_id
    matched_store_title = ""

    # Non-Steam shortcuts have a random AppID with no Valve CDN art. Resolve their display
    # name from shortcuts.vdf OR accept the live Steam frontend title as a reliable fallback,
    # then search the Steam store by that name for official art.
    if is_shortcut and title:
        matched_id = _search_steam_store_app_id(title)
        if matched_id > 0:
            art_app_id = matched_id
            matched_store_title = title
            # If Steam already cached the matched store game's art locally, prefer it.
            if not logo:
                logo = _first_image(_library_cache_candidates(art_app_id, "logo"))
            if not hero:
                hero = _first_image(_library_cache_candidates(art_app_id, "hero"))

    logo_url = _image_data_url(logo, max_bytes=5 * 1024 * 1024) if logo else ""
    hero_url = _image_data_url(hero, max_bytes=14 * 1024 * 1024) if hero else ""
    return {
        "ok": bool(title or logo_url or hero_url or art_app_id),
        "app_id": app_id,
        "title": title,
        "logo": logo_url,
        "hero": hero_url,
        "logo_path": str(logo) if logo else "",
        "hero_path": str(hero) if hero else "",
        "is_shortcut": is_shortcut,
        "art_app_id": art_app_id,
        "matched_store_title": matched_store_title,
    }


class Plugin:
    async def _main(self):
        decky.logger.info("Launch Curtain SteamOS loaded")
        _data_dir()

    async def _unload(self):
        decky.logger.info("Launch Curtain SteamOS unloaded")

    async def get_settings(self) -> Dict[str, Any]:
        return _load()

    async def save_settings(self, settings: Dict[str, Any]) -> Dict[str, Any]:
        return _save(settings)

    async def get_image_preview(self, path: str) -> Dict[str, Any]:
        file = _safe_file(path)
        if not file:
            return {"ok": False, "url": "", "message": "Datei nicht gefunden."}
        url = await asyncio.to_thread(_image_data_url, file)
        if not url:
            return {"ok": False, "url": "", "message": "Bild ist zu groß oder konnte nicht gelesen werden."}
        return {"ok": True, "url": url, "path": str(file)}

    async def validate_launch_image_path(self, path: str) -> Dict[str, Any]:
        file = _safe_file(path)
        if not file:
            return {"ok": False, "message": "Datei nicht gefunden."}
        if file.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".avif"}:
            return {"ok": False, "message": "Nicht unterstütztes Bildformat."}
        return {"ok": True, "path": str(file), "message": "OK"}

    async def get_steam_game_assets(self, app_id: int, title_hint: str = "") -> Dict[str, Any]:
        return await asyncio.to_thread(_resolve_steam_assets, app_id, title_hint)

    async def platform_info(self) -> Dict[str, Any]:
        return {
            "platform": "linux" if os.name == "posix" else os.name,
            "home": str(Path.home()),
            "gamescope": bool(os.environ.get("GAMESCOPE_WAYLAND_DISPLAY") or os.environ.get("STEAM_GAMEPADUI")),
        }
