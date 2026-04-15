# Telegram Media Downloader — Python CLI

A command-line tool that downloads images, GIFs, audio, and videos from
Telegram message links using the **MTProto API** (via [Telethon](https://github.com/LonamiWebs/Telethon)).

No browser or userscript manager required. Works with public channels and
private channels where your Telegram account has access.

---

## Requirements

- Python 3.8 or newer
- A **Telegram API ID** and **API Hash** — get them for free at <https://my.telegram.org>

---

## Installation

```bash
cd python
pip install -r requirements.txt
```

---

## First-time login

Run the authentication helper **once** to create a session file. The session
stores your MTProto credentials locally so subsequent runs do not require
re-authentication.

```bash
python auth.py
```

You will be prompted for:
1. Your Telegram API ID
2. Your Telegram API Hash
3. Your phone number (international format, e.g. `+12025551234`)
4. The verification code sent to your Telegram app
5. Your 2-step verification password (only if enabled)

The session is saved as `tg_downloader.session` in the current directory.

> **Security note:** The `.session` file contains your login credentials.
> Keep it private and never commit it to version control.
> It is already listed in the root `.gitignore`.

You can store your API credentials in environment variables to skip the
interactive prompts:

```bash
export TG_API_ID=12345678
export TG_API_HASH=abcdef1234567890abcdef1234567890
```

---

## Usage

### Download a single post

```bash
# Public channel
python cli.py https://t.me/channelname/5294

# Private channel (numeric ID from the URL)
python cli.py https://t.me/c/1234567890/5294
```

### Download multiple links

```bash
python cli.py https://t.me/chan/1 https://t.me/chan/2 https://t.me/chan/3
```

### Download only videos (skip photos, GIFs, audio)

```bash
python cli.py https://t.me/chan/1 --video-only
```

### Batch download from a file

Create a text file with one URL per line (lines starting with `#` are ignored):

```
# My download list
https://t.me/SafeASMR/5294
https://t.me/c/1234567890/100
https://t.me/channelname/42
```

Then run:

```bash
python cli.py --batch links.txt
```

### Specify output directory

```bash
python cli.py https://t.me/chan/1 --output ./downloads
```

### Use a custom session file

```bash
python cli.py https://t.me/chan/1 --session /path/to/my.session
```

---

## All options

```
usage: python cli.py [URL ...] [options]

positional arguments:
  URL              One or more https://t.me/... message links.

options:
  --batch FILE     Text file with one t.me link per line.
  --video-only     Skip photos, GIFs, and audio; download only videos.
  --output DIR     Directory to save downloaded files (default: .).
  --session FILE   Session file path without .session extension
                   (default: tg_downloader).
```

---

## How it works

| Userscript (browser)             | Python CLI                                    |
|----------------------------------|-----------------------------------------------|
| DOM intercept of `video.src`     | `message.media` object accessed via MTProto   |
| Range-based `fetch` in chunks    | Telethon `download_media()` with built-in chunking |
| "Video only" toggle in UI        | `--video-only` flag                           |
| Runs inside Telegram Web         | Runs entirely from the terminal               |
| Private channels via browser session | Private channels via Telegram account    |

The tool connects directly to Telegram's MTProto servers using your account
credentials (same as the official apps), so it can download media from any
channel or chat your account has access to — including channels with
download restrictions.

---

## Files

```
python/
├── requirements.txt   # Python dependencies (telethon)
├── auth.py            # First-time login helper
├── downloader.py      # Link parsing and download logic
├── cli.py             # Command-line entry point
└── README.md          # This file
```
