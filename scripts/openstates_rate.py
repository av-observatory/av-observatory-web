"""Shared Open States API pacing and HTTP 429 retry handling.

State is shared by the discovery and editorial processes on the same runner.
The file lives in RUNNER_TEMP and is never committed.
"""
import fcntl
import json
import os
from pathlib import Path
import random
import time
from urllib.error import HTTPError
from urllib.request import urlopen
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

INTERVAL=max(2.5,float(os.environ.get("OPENSTATES_REQUEST_INTERVAL","3.0")))
STATE=Path(os.environ.get("RUNNER_TEMP","/tmp"))/"av-observatory-openstates-rate.json"

def wait_turn():
    STATE.parent.mkdir(parents=True,exist_ok=True)
    with STATE.open("a+") as handle:
        fcntl.flock(handle,fcntl.LOCK_EX)
        handle.seek(0)
        try: state=json.load(handle)
        except (ValueError,TypeError): state={}
        now=time.time()
        scheduled=max(now,float(state.get("next_request",0)))
        delay=max(0,scheduled-now)
        if delay: time.sleep(delay)
        now=time.time()
        handle.seek(0);handle.truncate()
        json.dump({"next_request":now+INTERVAL},handle)
        handle.flush()
        fcntl.flock(handle,fcntl.LOCK_UN)

def retry_seconds(header,attempt):
    if header:
        try:
            return max(0,min(900,float(header)))
        except ValueError:
            try:
                return max(0,min(900,(parsedate_to_datetime(header)-datetime.now(timezone.utc)).total_seconds()))
            except (ValueError,TypeError):pass
    return min(300,20*(2**attempt))+random.uniform(0,3)

def open_json(request,timeout=55,max_attempts=5):
    for attempt in range(max_attempts):
        wait_turn()
        try:
            with urlopen(request,timeout=timeout) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code!=429 or attempt==max_attempts-1:raise
            delay=retry_seconds(exc.headers.get("Retry-After"),attempt)
            print(f"Open States rate limited; waiting {delay:.0f}s before retry {attempt+2}/{max_attempts}")
            time.sleep(delay)
    raise RuntimeError("Open States retries exhausted")
