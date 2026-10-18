#!/usr/bin/env bash
B=https://api.oregonlegislature.gov/odata/odataservice.svc
O=data-state/states/OR/probe
mkdir -p $O
g(){ curl -sS -L -G --retry 3 -A "av-observatory-research/1.0" -H "Accept: $3" -m 120 "$B/$1" "${@:4}" -o "$O/$2" -w "$2 %{http_code} %{size_download}\n"; }
g '$metadata' metadata.xml application/xml
J=application/json
g Measures measures.json $J --data-urlencode '$format=json' --data-urlencode '$top=3' --data-urlencode "\$filter=SessionKey eq '2025R1'"
g MeasureVotes mv.json $J --data-urlencode '$format=json' --data-urlencode '$top=3' --data-urlencode "\$filter=SessionKey eq '2025R1' and MeasureNumber eq 2001"
g MeasureVotes mv2.json $J --data-urlencode '$format=json' --data-urlencode '$top=100' --data-urlencode "\$filter=SessionKey eq '2025R1'"
g MeasureSponsors sp.json $J --data-urlencode '$format=json' --data-urlencode '$top=5' --data-urlencode "\$filter=SessionKey eq '2025R1'"
g MeasureHistoryActions ha.json $J --data-urlencode '$format=json' --data-urlencode '$top=5' --data-urlencode "\$filter=SessionKey eq '2025R1' and ActionText ne null and VoteText ne null"
g Legislators lg.json $J --data-urlencode '$format=json' --data-urlencode '$top=5' --data-urlencode "\$filter=SessionKey eq '2025R1'"
g MeasureAnalysisDocuments an.json $J --data-urlencode '$format=json' --data-urlencode '$top=5' --data-urlencode "\$filter=SessionKey eq '2025R1'"
for s in 2025R1 2026R1 2025S1; do
 g Measures cnt_$s.txt text/plain --data-urlencode "\$filter=SessionKey eq '$s'" --data-urlencode '$inlinecount=allpages' --data-urlencode '$top=1' --data-urlencode '$format=json'
done
curl -sS -L -A "av-observatory-research/1.0" -m 60 "https://olis.oregonlegislature.gov/liz/2025R1/Measures/Overview/HB2001" -o $O/olis_hb2001.html
