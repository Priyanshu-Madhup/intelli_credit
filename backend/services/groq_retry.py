"""
Shared retry wrapper for Groq API calls with exponential backoff on 429 errors.
"""
import time
import re
from groq import Groq


def groq_chat_with_retry(client: Groq, max_retries: int = 2, **kwargs):
    """
    Call client.chat.completions.create(**kwargs) with automatic retry on
    rate-limit (429) errors. Parses the Retry-After hint from the error
    message when available.

    Args:
        client: Groq client instance.
        max_retries: Maximum number of retries (default 2, so 3 total attempts).
        **kwargs: All arguments forwarded to chat.completions.create().

    Returns:
        The chat completion response object.

    Raises:
        The last exception if all retries are exhausted.
    """
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return client.chat.completions.create(**kwargs)
        except Exception as exc:
            last_exc = exc
            err_str = str(exc)
            # Only retry on rate-limit errors
            if "429" not in err_str and "rate_limit" not in err_str.lower():
                raise

            if attempt >= max_retries:
                raise

            # Try to parse wait time from error message
            wait = 10 * (attempt + 1)  # default exponential backoff
            match = re.search(r'(\d+)m(\d+(?:\.\d+)?)s', err_str)
            if match:
                wait = int(match.group(1)) * 60 + float(match.group(2)) + 1
            else:
                match_sec = re.search(r'(\d+(?:\.\d+)?)\s*s', err_str)
                if match_sec:
                    wait = float(match_sec.group(1)) + 1

            # Cap wait at 30 seconds to avoid hanging
            wait = min(wait, 30)
            time.sleep(wait)

    raise last_exc
