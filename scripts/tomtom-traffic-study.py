#!/usr/bin/env python3
"""Run TomTom Traffic Stats Area Analysis for AV Observatory event studies.

Requires TOMTOM_API_KEY. Produces public/data/tomtom_event_traffic.json.
The key is never written to output.
"""
import gzip, io, json, os, time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode

API="https://api.tomtom.com/traffic/trafficstats"
KEY=os.environ["TOMTOM_API_KEY"]
OUT=Path(__file__).resolve().parent.parent/"public/data/tomtom_event_traffic.json"

# Conservative study polygons. WGS84 [lon,lat].
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

def call(url, method="GET", body=None):
    data=None if body is None else json.dumps(body).encode()
    req=Request(url, data=data, method=method, headers={"Content-Type":"application/json","User-Agent":"AV-Observatory/1.0"})
    with urlopen(req, timeout=120) as r:
        return r.read(), r.headers

def hourly_sets(hours, day):
    out=[]
    for h in hours:
        h2=(h+1)%24
        end="24:00" if h==23 else f"{h2:02d}:00"
        out.append({"name":f"{h:02d}:00","timeGroups":[{"days":[day],"times":[f"{h:02d}:00-{end}"]}]})
    return out

def submit(name, geom, date_from, date_to, day, hours, exclusions=None):
    body={
      "jobName":name,
      "distanceUnit":"MILES",
      "network":{"name":name,"timeZoneId":"America/Los_Angeles","frcs":[0,1,2,3,4,5,6,7,8],"geometry":geom,"probeSource":"ALL"},
      "dateRange":{"name":name,"from":date_from,"to":date_to},
      "timeSets":hourly_sets(hours,day),
      "acceptMode":"AUTO"
    }
    if exclusions: body["dateRange"]["exclusions"]=exclusions
    raw,_=call(f"{API}/areaanalysis/1?"+urlencode({"key":KEY}),"POST",body)
    res=json.loads(raw)
    if not res.get("jobId"): raise RuntimeError(f"TomTom submit failed: {res}")
    return str(res["jobId"]),body

def wait_job(job_id):
    url=f"{API}/status/1/{job_id}?"+urlencode({"key":KEY})
    for _ in range(120):
        raw,_=call(url)
        res=json.loads(raw)
        state=res.get("jobState")
        if state=="DONE": return res
        if state in ("FAILED","REJECTED","CANCELLED"): raise RuntimeError(f"TomTom job {job_id}: {res}")
        time.sleep(15)
    raise TimeoutError(f"TomTom job {job_id} did not finish")

def download_json(url):
    raw,headers=call(url)
    enc=(headers.get("Content-Encoding") or "").lower()
    if enc=="gzip" or url.endswith(".gz"):
        raw=gzip.decompress(raw)
    return json.loads(raw)

def result_json(done):
    urls=done.get("urls") or []
    for u in urls:
        if "json" in u.lower() and "geojson" not in u.lower():
            return download_json(u)
    if urls: return download_json(urls[0])
    raise RuntimeError("No result URL")

def summarize(result):
    tsets={int(x["@id"]):x["name"] for x in result.get("timeSets",[])}
    by={}
    for seg in result.get("network",{}).get("segmentResults",[]):
        dist=float(seg.get("distance") or 0)
        for tr in seg.get("segmentTimeResults",[]):
            name=tsets.get(int(tr.get("timeSet")),"unknown")
            speed=tr.get("averageSpeed"); tt=tr.get("averageTravelTime"); sample=tr.get("normalizedSampleSize")
            if speed is None: continue
            w=max(dist,1e-6)*(float(sample) if sample is not None else 1.0)
            x=by.setdefault(name,{"w":0.0,"speed":0.0,"travel_time":0.0,"segments":0})
            x["w"]+=w; x["speed"]+=float(speed)*w; x["segments"]+=1
            if tt is not None: x["travel_time"]+=float(tt)*w
    rows=[]
    for name,x in sorted(by.items()):
        rows.append({"hour":name,"average_speed_mph":x["speed"]/x["w"] if x["w"] else None,
                     "average_travel_time_sec":x["travel_time"]/x["w"] if x["w"] else None,
                     "segments_with_data":x["segments"]})
    return rows

def main():
    jobs=[
      ("pge_event",SF_POLY,"2025-12-20","2025-12-20","SAT",list(range(24))),
      ("pge_baseline",SF_POLY,"2025-11-22","2025-12-13","SAT",list(range(24))),
      ("july4_event",NORTH_POLY,"2026-07-04","2026-07-04","SAT",list(range(16,24))),
      ("july5_event",NORTH_POLY,"2026-07-05","2026-07-05","SUN",list(range(0,4))),
      ("july4_baseline",NORTH_POLY,"2026-06-06","2026-06-27","SAT",list(range(16,24))),
      ("july5_baseline",NORTH_POLY,"2026-06-07","2026-06-28","SUN",list(range(0,4))),
    ]
    out={"schema_version":"1.0.0","source":"TomTom Traffic Stats Area Analysis","generated_at":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"studies":{}}
    pending=[]
    for name,geom,a,b,day,hours in jobs:
        jid,body=submit(name,geom,a,b,day,hours)
        pending.append((name,jid,body))
        print("submitted",name,jid,flush=True)
    for name,jid,body in pending:
        done=wait_job(jid)
        result=result_json(done)
        out["studies"][name]={"job_id":jid,"date_range":body["dateRange"],"geography":body["network"]["name"],
                              "hours":[x["name"] for x in body["timeSets"]],"hourly":summarize(result)}
        print("finished",name,flush=True)
    OUT.write_text(json.dumps(out,indent=2)+"\n")
    print("wrote",OUT)

if __name__=="__main__": main()
