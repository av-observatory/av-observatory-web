#!/usr/bin/env bash
B=https://api.oregonlegislature.gov/odata/odataservice.svc
O=data-state/states/OR/probe
mkdir -p $O
g(){ curl -sS -L --retry 3 -A "av-observatory-research/1.0" -H "Accept: application/json" -m 120 "$B/$1" -o "$O/$2" -w "$2 %{http_code} %{size_download}\n"; }
g '$metadata' metadata.xml
g "" service.json
g 'LegislativeSessions?$format=json' sessions.json
g "Measures?\$format=json&\$top=3&\$filter=SessionKey eq '2025R1'" measures.json
for e in MeasureSponsors MeasureHistoryActions MeasureDocuments MeasureAnalysisDocuments Legislators Committees CommitteeMeetings MeasureVotes Votes MeasureSummaries; do
 g "$e?\$format=json&\$top=3" $e.json; done
curl -sS -L -A "av-observatory-research/1.0" -m 60 "https://olis.oregonlegislature.gov/liz/2025R1/Measures/Overview/HB2001" -o $O/olis_hb2001.html -w "olis %{http_code} %{size_download}\n"
