from __future__ import annotations

import base64
import binascii
import re
from urllib.parse import parse_qs, quote, unquote, urlparse, urlunparse

trackingKeys = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "utm_name",
    "utm_reader",
    "source",
    "src",
    "iid",
    "iis",
    "iisn",
    "jobsite",
    "feedid",
    "click_id",
    "clickid",
    "cid",
    "rx_cid",
    "rx_ch",
    "rx_group",
    "rx_id",
    "rx_medium",
    "rx_r",
    "rx_source",
    "rx_ts",
    "rx_vp",
    "rx_p",
    "tob",
    "banner",
    "mode",
}

redirectKeys = ("rx_url", "url", "redirect", "redirect_url", "dest", "destination", "target")


def normalizeHttpUrl(raw: str) -> str:
    parsed = urlparse(raw)
    path = quote(parsed.path or "", safe="/:@-._~!$&'()*+,;=%")
    query = quote(parsed.query or "", safe="=&:@-._~!$'()*+,;/%")
    return urlunparse(
        (parsed.scheme.lower(), parsed.netloc.lower(), path, parsed.params, query, "")
    )


def extractZipRecruiterTarget(raw: str) -> str:
    parsed = urlparse(raw)
    if "ziprecruiter.com" not in parsed.netloc.lower() or "/job-redirect" not in parsed.path:
        return raw
    token = parse_qs(parsed.query).get("match_token", [""])[0].strip()
    if not token:
        return raw
    blob = unquote(token)
    blob += "=" * (-len(blob) % 4)
    decoded = None
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            decoded = decoder(blob)
            break
        except (binascii.Error, ValueError):
            continue
    if not decoded:
        return raw
    text = decoded.decode("utf-8", errors="ignore")
    match = re.search(r"https?://[^\s\"'<>]+", text)
    return match.group(0) if match else raw


def unwrapRedirectUrl(raw: str) -> str:
    current = raw
    for _ in range(3):
        parsed = urlparse(current)
        if parsed.scheme.lower() not in {"http", "https"}:
            return current
        query = parse_qs(parsed.query, keep_blank_values=False)
        nested = None
        for key in redirectKeys:
            values = query.get(key) or query.get(key.lower()) or query.get(key.upper())
            if values and values[0].strip():
                nested = unquote(values[0].strip())
                break
        if not nested:
            return current
        nestedParsed = urlparse(nested)
        if nestedParsed.scheme.lower() in {"http", "https"} and nestedParsed.netloc:
            current = nested
            continue
        return current
    return current


def dropTrackingParams(raw: str) -> str:
    parsed = urlparse(raw)
    query = parse_qs(parsed.query, keep_blank_values=False)
    keptPairs: list[str] = []
    for key, values in query.items():
        low = key.lower()
        if (
            low in trackingKeys
            or low.startswith("utm_")
            or low.startswith("rx_")
            or low.startswith("tm_")
        ):
            continue
        for value in values:
            k = quote(key, safe="-._~")
            v = quote(value, safe="-._~:/@")
            keptPairs.append(f"{k}={v}")
    cleanedQuery = "&".join(keptPairs)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, cleanedQuery, ""))


def stripApplySuffix(raw: str) -> str:
    parsed = urlparse(raw)
    path = parsed.path or ""
    if path.lower().endswith("/apply"):
        path = path[:-6] or "/"
    return urlunparse((parsed.scheme, parsed.netloc, path, parsed.params, parsed.query, ""))


def cleanUrl(rawValue: object) -> str:
    text = str(rawValue or "").strip()
    if not text:
        return ""
    parsed = urlparse(text)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ""
    text = normalizeHttpUrl(text)
    text = extractZipRecruiterTarget(text)
    text = unwrapRedirectUrl(text)
    text = normalizeHttpUrl(text)
    text = dropTrackingParams(text)
    text = stripApplySuffix(text)
    parsed = urlparse(text)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        return ""
    return text


def isValidUrl(rawValue: object) -> bool:
    return bool(cleanUrl(rawValue))


def normalizeCompanyName(rawValue: object) -> str:
    text = str(rawValue or "").strip()
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text)
    # Replace URL-like or separator punctuation with spaces.
    text = re.sub(r"[./\\|]+", " ", text)
    text = re.sub(r"[_-]+", " ", text)
    # Keep common company punctuation, remove other noisy symbols.
    text = re.sub(r"[^A-Za-z0-9 &'()]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.title()
