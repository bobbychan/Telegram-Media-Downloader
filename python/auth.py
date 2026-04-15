"""
First-time login helper.

Run this once to create a .session file that stores your MTProto credentials.
Subsequent runs of cli.py will reuse the session and will not prompt for login.

Usage:
    python auth.py
    python auth.py --session my_custom.session
"""

import argparse
import asyncio
import os

from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError


DEFAULT_SESSION = "tg_downloader"


async def _login(session_path: str, api_id: int, api_hash: str) -> None:
    client = TelegramClient(session_path, api_id, api_hash)
    await client.connect()

    if await client.is_user_authorized():
        me = await client.get_me()
        print(f"Already logged in as {me.first_name} (@{me.username}).")
        await client.disconnect()
        return

    phone = input("Enter your phone number (international format, e.g. +12025551234): ").strip()
    await client.send_code_request(phone)

    code = input("Enter the verification code you received: ").strip()
    try:
        await client.sign_in(phone, code)
    except SessionPasswordNeededError:
        password = input("Two-step verification is enabled. Enter your password: ")
        await client.sign_in(password=password)

    me = await client.get_me()
    print(f"Logged in successfully as {me.first_name} (@{me.username}).")
    print(f"Session saved to: {session_path}.session")
    await client.disconnect()


def main() -> None:
    parser = argparse.ArgumentParser(description="Authenticate with Telegram and save a session file.")
    parser.add_argument(
        "--session",
        default=DEFAULT_SESSION,
        help=f"Path for the session file (without .session extension). Default: {DEFAULT_SESSION}",
    )
    args = parser.parse_args()

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

    asyncio.run(_login(args.session, api_id, api_hash))


if __name__ == "__main__":
    main()
