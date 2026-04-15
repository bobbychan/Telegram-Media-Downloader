"""
Telegram Media Downloader — Python CLI

Download images, GIFs, audio, and videos from Telegram message links
using the MTProto API (via Telethon). No browser required.

Requirements:
  - A Telegram API ID and API Hash obtained from https://my.telegram.org
  - Python 3.8+
  - pip install -r requirements.txt

Usage:
  # Download a single public post
  python cli.py https://t.me/channelname/5294

  # Download a post from a private channel
  python cli.py https://t.me/c/1234567890/5294

  # Download multiple links at once
  python cli.py https://t.me/chan/1 https://t.me/chan/2

  # Download only videos, skip photos/GIFs/audio
  python cli.py https://t.me/chan/1 --video-only

  # Batch download from a file (one URL per line, # for comments)
  python cli.py --batch links.txt

  # Specify output directory and custom session file
  python cli.py https://t.me/chan/1 --output ./downloads --session my.session

Environment variables (optional, avoids interactive prompts):
  TG_API_ID    — Telegram API ID
  TG_API_HASH  — Telegram API Hash
"""

import argparse
import asyncio
import os
import sys

from telethon import TelegramClient

from downloader import download_links


DEFAULT_SESSION = "tg_downloader"


def _read_links_from_file(path: str) -> list[str]:
    try:
        with open(path, encoding="utf-8") as fh:
            return [line.strip() for line in fh if line.strip() and not line.startswith("#")]
    except OSError as exc:
        raise SystemExit(f"Cannot read batch file {path!r}: {exc}") from exc


def _get_credentials(args: argparse.Namespace) -> tuple[int, str]:
    api_id_str = os.environ.get("TG_API_ID", "").strip()
    api_hash = os.environ.get("TG_API_HASH", "").strip()

    if not api_id_str:
        api_id_str = input("Enter your Telegram API ID (from https://my.telegram.org): ").strip()
    if not api_hash:
        api_hash = input("Enter your Telegram API Hash (from https://my.telegram.org): ").strip()

    try:
        api_id = int(api_id_str)
    except ValueError:
        raise SystemExit(f"Invalid API ID: {api_id_str!r}. It must be an integer.")

    return api_id, api_hash


async def _run(args: argparse.Namespace) -> None:
    links: list[str] = list(args.urls or [])

    if args.batch:
        links.extend(_read_links_from_file(args.batch))

    if not links:
        raise SystemExit("No links provided. Use positional URLs or --batch <file>.")

    api_id, api_hash = _get_credentials(args)

    session_path = args.session or DEFAULT_SESSION
    output_dir = args.output or "."

    async with TelegramClient(session_path, api_id, api_hash) as client:
        if not await client.is_user_authorized():
            raise SystemExit(
                "Not logged in. Run  python auth.py  first to create a session file."
            )

        await download_links(
            client=client,
            links=links,
            output_dir=output_dir,
            video_only=args.video_only,
        )

    print("\nDone.")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python cli.py",
        description="Download media from Telegram message links via the MTProto API.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    parser.add_argument(
        "urls",
        nargs="*",
        metavar="URL",
        help="One or more https://t.me/... message links.",
    )
    parser.add_argument(
        "--batch",
        metavar="FILE",
        help="Path to a text file containing one t.me link per line (# comments are ignored).",
    )
    parser.add_argument(
        "--video-only",
        action="store_true",
        default=False,
        help="Skip photos, GIFs, and audio; download only video files.",
    )
    parser.add_argument(
        "--output",
        metavar="DIR",
        default=".",
        help="Directory where downloaded files are saved (default: current directory).",
    )
    parser.add_argument(
        "--session",
        metavar="FILE",
        default=DEFAULT_SESSION,
        help=f"Session file path (without .session extension). Default: {DEFAULT_SESSION}",
    )

    args = parser.parse_args()
    asyncio.run(_run(args))


if __name__ == "__main__":
    main()
