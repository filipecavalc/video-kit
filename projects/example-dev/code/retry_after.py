import time

import requests


def fetch_report(url: str) -> dict:
    """Download the nightly report."""
    for attempt in range(5):
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            time.sleep(2 ** attempt)
    raise RuntimeError("report unavailable")
