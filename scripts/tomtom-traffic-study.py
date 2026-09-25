#!/usr/bin/env python3
"""Run TomTom Area Analytics Lite for AV Observatory event studies.

Requires TOMTOM_API_KEY. Produces public/data/tomtom_event_traffic.json.
The key is never written to output.
"""
import json, os, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode

API="https://api.tomtom.com/areaanalytics/reports/lite/aggregated"
KEY=os.environ["TOMTOM_API_KEY"]
OUT=Path(__file__).resolve().parent.parent/"public/data/tomtom_event_traffic.json"

SF_POLY={
 "type":"Polygon",
 "coordinates":[[[-122.5149,37.7080],[-122.5060,37.7838],[-122.4770,37.8125],
                 [-122.4100,37.8105],[-122.3870,37.7900],[-122.3770,37.7080],
                 [-122.5149,37.7080]]]
}
NORTH_POLY={
 "type":"Polygon",
 "coordinates":[[[-122.5160,37.7860],[-122.5160,37.8128],[-122.4770,37.8128],
                 [-122.4350,37.8085],[-122.4050,37.8070],[-122.4050,37.7860],
                 [-122.5160,37.7860]]]
}

def call(body, aggregation="HOURLY"):
    url=API+"?"+urlencode({"key":KEY,"aggregation":aggregation})
    req=Request(url,data=json.dumps(body).encode(),method="POST",
                headers={"Content-Type":"application/json","User-Agent":"AV-Observatory/1.0"})
    try:
        with urlopen(req,timeout=180) as r:
            return json.loads(r.read())
    except HTTPError as e:
        detail=e.read().decode("utf-8","replace")
        raise RuntimeError(f"TomTom HTTP {e.code}: {detail[:1200]}") from None

def feature(name,geom):
    return {"type":"Feature","properties":{"name":name,"timezone":"America/Los_Angeles"},"geometry":geom}

def study(name,geom,start,end,hours,days=None):
    body={
      "name":name,
      "frcs":[0,1,2,3,4,5,6,7,8],
      "hours":hours,
      "dataTypes":["NETWORK_LENGTH","CONGESTION_LEVEL","FREE_FLOW_SPEED","TRAVEL_TIME","SPEED"],
      "features":[feature(name,geom)]
    }
    if days:
        body["days"]=days
    else:
        body["startDate"]=start; body["endDate"]=end
    res=call(body,"HOURLY")
    pts=res.get("points",[])
    return {
      "date_range":{"start":start,"end":end},
      "hours":hours,
      "points":[
        {"time":p.get("time"),"speed_kph":p.get("v"),"free_flow_speed_kph":p.get("fv"),
         "congestion_pct":p.get("c"),"travel_time_min_per_10km":p.get("t"),
         "network_length_km":p.get("l")}
        for p in pts
      ]
    }

def main():
    specs=[
      ("pge_event",SF_POLY,"2025-12-20","2025-12-20",list(range(24)),["2025-12-20"]),
      ("pge_baseline",SF_POLY,"2025-11-22","2025-12-13",list(range(24)),
       ["2025-11-22","2025-11-29","2025-12-06","2025-12-13"]),
      ("july4_event",NORTH_POLY,"2026-07-04","2026-07-04",list(range(16,24)),["2026-07-04"]),
      ("july5_event",NORTH_POLY,"2026-07-05","2026-07-05",list(range(0,4)),["2026-07-05"]),
      ("july4_baseline",NORTH_POLY,"2026-06-06","2026-06-27",list(range(16,24)),
       ["2026-06-06","2026-06-13","2026-06-20","2026-06-27"]),
      ("july5_baseline",NORTH_POLY,"2026-06-07","2026-06-28",list(range(0,4)),
       ["2026-06-07","2026-06-14","2026-06-21","2026-06-28"])
    ]
    out={"schema_version":"2.0.0","source":"TomTom Area Analytics Lite","generated_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"studies":{}}
    for name,geom,a,b,hours,days in specs:
        print("running",name,flush=True)
        out["studies"][name]=study(name,geom,a,b,hours,days)
    OUT.write_text(json.dumps(out,indent=2)+"\n")
    print("wrote",OUT)

if __name__=="__main__": main()
