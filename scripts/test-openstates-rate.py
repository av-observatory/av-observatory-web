#!/usr/bin/env python3
"""Offline checks for Open States request scheduling and backoff."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import openstates_rate as rate
from urllib.error import HTTPError
from email.message import Message
from urllib.request import Request

assert 8.0<=rate.retry_seconds("8",0)<=8.01
assert 0<=rate.retry_seconds("0",0)<=.01
assert rate.retry_seconds("not-a-delay",0)>=20
calls=[]
class FakeResponse:
    def __enter__(self):return self
    def __exit__(self,*args):return False
def fake_open(_request,timeout):
    calls.append(timeout)
    if len(calls)==1:
        h=Message();h["Retry-After"]="0"
        raise HTTPError("https://v3.openstates.org/bills",429,"slow down",h,None)
    return FakeResponse()
old_open,old_wait,old_load=rate.urlopen,rate.wait_turn,rate.json.load
try:
    rate.urlopen=fake_open
    rate.wait_turn=lambda:None
    rate.json.load=lambda response:{"ok":True}
    assert rate.open_json(Request("https://v3.openstates.org/bills"),max_attempts=3)=={"ok":True}
    assert len(calls)==2
finally:
    rate.urlopen,rate.wait_turn,rate.json.load=old_open,old_wait,old_load
print("Rate-limit retry tests passed.")
