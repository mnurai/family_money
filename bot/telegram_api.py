"""Minimal Telegram Bot API client using only the standard library."""
import json
import ssl
import urllib.error
import urllib.parse
import urllib.request

try:
    import certifi

    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL = ssl.create_default_context()


class TelegramError(Exception):
    pass


class TelegramAPI:
    def __init__(self, token: str):
        self._base = f"https://api.telegram.org/bot{token}/"

    def _call(self, method: str, params: dict, timeout: int = 30):
        data = urllib.parse.urlencode(params).encode()
        try:
            with urllib.request.urlopen(self._base + method, data=data, timeout=timeout, context=_SSL) as resp:
                body = json.load(resp)
        except urllib.error.HTTPError as exc:
            # Telegram explains errors in the body, e.g. "message is not modified".
            try:
                description = json.load(exc).get("description", f"HTTP {exc.code}")
            except ValueError:
                description = f"HTTP {exc.code}"
            raise TelegramError(f"{method} failed: {description}") from None
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            # Show the reason, but never the URL: it contains the bot token.
            reason = getattr(exc, "reason", exc)
            raise TelegramError(f"{method} failed: {type(exc).__name__}: {reason}") from None
        if not body.get("ok"):
            raise TelegramError(f"{method} failed: {body.get('description', 'unknown error')}")
        return body["result"]

    def send_message(self, chat_id: int, text: str, reply_markup: str | None = None) -> None:
        params = {"chat_id": chat_id, "text": text}
        if reply_markup:
            params["reply_markup"] = reply_markup
        self._call("sendMessage", params)

    def edit_message_text(self, chat_id: int, message_id: int, text: str, reply_markup: str | None = None) -> None:
        params = {"chat_id": chat_id, "message_id": message_id, "text": text}
        if reply_markup:
            params["reply_markup"] = reply_markup
        self._call("editMessageText", params)

    def answer_callback_query(self, callback_id: str) -> None:
        self._call("answerCallbackQuery", {"callback_query_id": callback_id})

    def set_my_commands(self, commands: list[tuple[str, str]]) -> None:
        payload = [{"command": name, "description": desc} for name, desc in commands]
        self._call("setMyCommands", {"commands": json.dumps(payload)})

    def get_updates(self, offset: int, timeout: int = 20) -> list:
        return self._call(
            "getUpdates",
            {"offset": offset, "timeout": timeout, "allowed_updates": json.dumps(["message", "callback_query"])},
            timeout=timeout + 10,
        )
