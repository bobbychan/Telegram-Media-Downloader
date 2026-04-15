"""
Core download logic: URL parsing and media downloading via Telethon.
"""

from __future__ import annotations

import os
import re
import sys
from typing import Optional
from urllib.parse import urlparse

from telethon import TelegramClient
from telethon.tl.types import (
    MessageMediaDocument,
    MessageMediaPhoto,
    Document,
    DocumentAttributeFilename,
    DocumentAttributeVideo,
    DocumentAttributeAnimated,
    DocumentAttributeAudio,
)


# Supported MIME type prefixes for --video-only filtering
_VIDEO_MIME_PREFIXES = ("video/",)


def parse_tme_link(url: str) -> Optional[tuple[str, int]]:
    """Parse a t.me link and return (entity, message_id).

    Supports:
    - https://t.me/channelname/12345          (public channel/username)
    - https://t.me/c/1234567890/12345         (private channel by numeric ID)
    - https://t.me/username/12345?single      (query string is ignored)

    Returns None if the URL cannot be parsed.
    """
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return None

    if parsed.netloc not in ("t.me", "www.t.me", "telegram.me"):
        return None

    # Strip leading slash and split path components
    parts = [p for p in parsed.path.strip("/").split("/") if p]

    # Private channel: /c/<numeric_id>/<msg_id>
    if len(parts) == 3 and parts[0] == "c":
        try:
            channel_id = int(parts[1])
            msg_id = int(parts[2])
        except ValueError:
            return None
        # Telethon expects private channel IDs as negative integers prefixed with -100
        entity = int(f"-100{channel_id}")
        return (str(entity), msg_id)

    # Public channel / username: /<username>/<msg_id>
    if len(parts) == 2:
        username = parts[0]
        try:
            msg_id = int(parts[1])
        except ValueError:
            return None
        return (username, msg_id)

    return None


def _document_filename(doc: Document) -> str:
    """Extract the filename from a Document's attributes, falling back to doc ID."""
    for attr in doc.attributes:
        if isinstance(attr, DocumentAttributeFilename):
            return attr.file_name
    # Derive an extension from the MIME type
    mime = getattr(doc, "mime_type", "") or ""
    ext = mime.split("/")[-1] if "/" in mime else "bin"
    return f"{doc.id}.{ext}"


def _is_video(doc: Document) -> bool:
    """Return True if a Document is a video (not a GIF/animation)."""
    mime = getattr(doc, "mime_type", "") or ""
    if not mime.startswith("video/"):
        return False
    for attr in doc.attributes:
        if isinstance(attr, DocumentAttributeAnimated):
            return False
    return True


def _is_audio(doc: Document) -> bool:
    mime = getattr(doc, "mime_type", "") or ""
    if mime.startswith("audio/"):
        return True
    for attr in doc.attributes:
        if isinstance(attr, DocumentAttributeAudio):
            return True
    return False


def _progress_callback(current: int, total: int, filename: str) -> None:
    if total:
        pct = current * 100 // total
        bar_len = 30
        filled = bar_len * current // total
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"\r  [{bar}] {pct:3d}%  {filename}", end="", flush=True)


async def download_links(
    client: TelegramClient,
    links: list[str],
    output_dir: str,
    video_only: bool,
) -> None:
    """Download media for every t.me link in *links*.

    Parameters
    ----------
    client:     An already-connected, authorised TelegramClient.
    links:      List of t.me message URLs to process.
    output_dir: Directory where downloaded files are written.
    video_only: When True only video Documents are downloaded; photos,
                GIFs, and audio are skipped.
    """
    os.makedirs(output_dir, exist_ok=True)

    for url in links:
        url = url.strip()
        if not url or url.startswith("#"):
            continue

        print(f"\n→ {url}")

        parsed = parse_tme_link(url)
        if parsed is None:
            print("  [SKIP] Cannot parse URL — expected https://t.me/<channel>/<id> format.")
            continue

        entity_id, msg_id = parsed

        try:
            entity = await client.get_entity(entity_id)
        except Exception as exc:
            print(f"  [ERROR] Cannot resolve entity {entity_id!r}: {exc}")
            continue

        try:
            messages = await client.get_messages(entity, ids=msg_id)
        except Exception as exc:
            print(f"  [ERROR] Cannot fetch message {msg_id}: {exc}")
            continue

        # get_messages() returns a list when passed a list of IDs, or a
        # single Message when passed a single integer ID.  Normalise to one object.
        if isinstance(messages, list):
            message = messages[0] if messages else None
        else:
            message = messages
        if message is None:
            print("  [SKIP] Message not found.")
            continue

        media = message.media
        if media is None:
            print("  [SKIP] Message has no media.")
            continue

        # ---- Photo -------------------------------------------------------
        if isinstance(media, MessageMediaPhoto):
            if video_only:
                print("  [SKIP] Photo skipped (--video-only).")
                continue
            filename = f"photo_{msg_id}.jpg"
            dest = os.path.join(output_dir, filename)
            print(f"  Downloading photo → {dest}")
            await client.download_media(
                message,
                file=dest,
                progress_callback=lambda c, t: _progress_callback(c, t, filename),
            )
            print()  # newline after progress bar
            print(f"  ✓ Saved: {dest}")
            continue

        # ---- Document (video / GIF / audio / file) -----------------------
        if isinstance(media, MessageMediaDocument):
            doc: Document = media.document

            if video_only and not _is_video(doc):
                mime = getattr(doc, "mime_type", "unknown")
                print(f"  [SKIP] Not a video (mime: {mime}) — skipped by --video-only.")
                continue

            filename = _document_filename(doc)
            dest = os.path.join(output_dir, filename)
            print(f"  Downloading {getattr(doc, 'mime_type', 'file')} → {dest}")
            await client.download_media(
                message,
                file=dest,
                progress_callback=lambda c, t, fn=filename: _progress_callback(c, t, fn),
            )
            print()  # newline after progress bar
            print(f"  ✓ Saved: {dest}")
            continue

        print(f"  [SKIP] Unsupported media type: {type(media).__name__}")
