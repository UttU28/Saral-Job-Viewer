#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parents[1]


def utcStamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def touchPython(path: Path, stamp: str, dryRun: bool) -> None:
    text = path.read_text(encoding="utf-8")
    marker = f"# deployTouch: {stamp}"
    newText: str
    pyPat = re.compile(r"^# deploy(?:Touch|-touch):.*$", flags=re.M)
    if pyPat.search(text):
        newText = pyPat.sub(marker, text, count=1)
    else:
        newText = text.rstrip() + "\n\n" + marker + "\n"
    if newText != text and not dryRun:
        path.write_text(newText, encoding="utf-8")


def touchFrontendIndex(path: Path, stamp: str, dryRun: bool) -> None:
    text = path.read_text(encoding="utf-8")
    comment = f"<!-- deployTouch: {stamp} -->"
    htmlPat = re.compile(r"<!-- deploy(?:Touch|-touch):[^>]*-->")
    if htmlPat.search(text):
        newText = htmlPat.sub(comment, text, count=1)
    else:
        newText = text.replace("</html>", f"  {comment}\n</html>", 1)
        if newText == text:
            raise SystemExit(f"Could not find closing </html> in {path}")
    if newText != text and not dryRun:
        path.write_text(newText, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print paths and stamp only; do not write files.",
    )
    args = parser.parse_args()
    stamp = utcStamp()

    targets = [
        (root / "app.py", touchPython),
        (root / "validation.py", touchPython),
        (root / "frontend" / "index.html", touchFrontendIndex),
    ]
    for path, handler in targets:
        if not path.is_file():
            print(f"missing: {path.relative_to(root)}", file=sys.stderr)
            return 1
        print(
            f"{'would touch' if args.dry_run else 'touching'} {path.relative_to(root)} ({stamp})"
        )
        handler(path, stamp, args.dry_run)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
