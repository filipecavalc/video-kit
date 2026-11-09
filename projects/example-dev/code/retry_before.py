import time

import requests


def fetch_report(url: str) -> dict:
    """Download the nightly report."""
    for attempt in range(5):
        try:
            response = requests.get(url)
            return response.json()
        except requests.RequestException:
            time.sleep(1)
    raise RuntimeError("report unavailable")
