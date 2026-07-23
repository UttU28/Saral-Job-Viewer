#!/usr/bin/env python3
"""Import local Gmail / PlaceTrack JSON files into MongoDB placetrackWorkspace."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env", override=False)

from utils.placetrackStore import importLocalJsonData  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge local Gmail + PlaceTrack JSON/files into MongoDB placetrackWorkspace.",
    )
    parser.add_argument(
        "--jwt",
        help="PlaceTrack JWT string (optional; not stored in repo files by default)",
    )
    parser.add_argument(
        "--jwt-file",
        type=Path,
        help="Path to a file containing the PlaceTrack JWT (plain text or JSON {\"token\": \"...\"})",
    )
    parser.add_argument("--token-file", type=Path, help="Gmail token.json path")
    parser.add_argument("--sent-cache-file", type=Path, help="sent_recipients_cache.json path")
    parser.add_argument("--resume-meta-file", type=Path, help="resume_meta.json path")
    parser.add_argument("--resume-pdf-file", type=Path, help="resume.pdf path")
    parser.add_argument(
        "--mail-templates-file",
        type=Path,
        help="mail-templates.json path (legacy array or full config object)",
    )
    parser.add_argument(
        "--skip-mail-templates",
        action="store_true",
        help="Do not seed default mail templates when missing from MongoDB",
    )
    args = parser.parse_args()

    jwt = args.jwt
    if args.jwt_file and args.jwt_file.is_file():
        raw = args.jwt_file.read_text(encoding="utf-8").strip()
        if raw.startswith("{"):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    jwt = str(parsed.get("token") or parsed.get("placeTrackJwt") or "").strip() or jwt
            except json.JSONDecodeError:
                pass
        else:
            jwt = raw or jwt

    result = importLocalJsonData(
        jwt=jwt,
        tokenFile=args.token_file,
        sentCacheFile=args.sent_cache_file,
        resumeMetaFile=args.resume_meta_file,
        resumePdfFile=args.resume_pdf_file,
        mailTemplatesFile=args.mail_templates_file,
        seedMailTemplates=not args.skip_mail_templates,
    )
    print(json.dumps(result, indent=2))
    if not result.get("fields"):
        print("No local files found to import.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
