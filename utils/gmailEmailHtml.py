from __future__ import annotations

import html
import re

MARKDOWN_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
CONTACT_PATTERN = re.compile(
    r"([A-Za-z][A-Za-z0-9 /&.-]{0,40}): (https?://\S+)"
    r"|(https?://\S+)"
    r"|(Phone:\s*((?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}))"
    r"|(Email:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}))",
    re.IGNORECASE,
)


def _cleanUrl(url: str) -> str:
    return re.sub(r"[.,;:!?)]+$", "", url)


def _phoneToTelHref(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"tel:+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"tel:+{digits}"
    return f"tel:+{digits}"


def _anchor(href: str, label: str) -> str:
    return (
        f'<a href="{html.escape(href, quote=True)}" '
        f'style="color:#1a73e8;text-decoration:underline;">'
        f"{html.escape(label)}</a>"
    )


def _linkifyChunk(chunk: str) -> str:
    parts: list[str] = []
    last = 0

    for match in CONTACT_PATTERN.finditer(chunk):
        if match.start() > last:
            parts.append(html.escape(chunk[last : match.start()]))

        if match.group(1) and match.group(2):
            parts.append(html.escape(f"{match.group(1).strip()}: "))
            href = _cleanUrl(match.group(2))
            parts.append(_anchor(href, href))
        elif match.group(3):
            href = _cleanUrl(match.group(3))
            parts.append(_anchor(href, href))
        elif match.group(4) and match.group(5):
            display = match.group(5).strip()
            parts.append(html.escape("Phone: "))
            parts.append(_anchor(_phoneToTelHref(display), display))
        elif match.group(6) and match.group(7):
            address = match.group(7).strip()
            parts.append(html.escape("Email: "))
            parts.append(_anchor(f"mailto:{address}", address))

        last = match.end()

    if last < len(chunk):
        parts.append(html.escape(chunk[last:]))

    return "".join(parts)


def bodyToHtml(body: str) -> str:
    normalized = MARKDOWN_LINK.sub(r"\1: \2", body)
    paragraphs = normalized.split("\n\n")
    blocks: list[str] = []

    for paragraph in paragraphs:
        lines = paragraph.split("\n")
        if any(line.strip().startswith("•") for line in lines):
            items: list[str] = []
            for line in lines:
                stripped = line.strip()
                if not stripped:
                    continue
                content = stripped[1:].strip() if stripped.startswith("•") else stripped
                items.append(f"<li>{_linkifyChunk(content)}</li>")
            blocks.append(
                '<ul style="margin:0 0 14px;padding-left:22px;line-height:1.5;">'
                + "".join(items)
                + "</ul>"
            )
        else:
            lineHtml = "<br>".join(_linkifyChunk(line) for line in lines)
            blocks.append(
                f'<p style="margin:0 0 14px;line-height:1.5;font-family:Arial,sans-serif;'
                f'font-size:14px;color:#222;">{lineHtml}</p>'
            )

    return (
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;">'
        + "".join(blocks)
        + "</div>"
    )
