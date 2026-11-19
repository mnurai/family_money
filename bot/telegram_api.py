"""Minimal Telegram Bot API client using only the standard library."""
import json
import urllib.error
import urllib.parse
import urllib.request


class TelegramError(Exception):
    pass


class TelegramAPI:
    def __init__(self, token: str):
        self._base = f"https://api.telegram.org/bot{token}/"

    def _call(self, method: str, params: dict, timeout: int = 30):
        data = urllib.parse.urlencode(params).encode()
        try:
            with urllib.request.urlopen(self._base + method, data=data, timeout=timeout) as resp:
                body = json.load(resp)
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            # Do not include the URL: it contains the bot token.
            raise TelegramError(f"{method} failed: {type(exc).__name__}") from None
        if not body.get("ok"):
            raise TelegramError(f"{method} failed: {body.get('description', 'unknown error')}")
        return body["result"]

    def send_message(self, chat_id: int, text: str) -> None:
        self._call("sendMessage", {"chat_id": chat_id, "text": text})

    def get_updates(self, offset: int, timeout: int = 20) -> list:
        return self._call(
            "getUpdates",
            {"offset": offset, "timeout": timeout, "allowed_updates": json.dumps(["message"])},
            timeout=timeout + 10,
        )
