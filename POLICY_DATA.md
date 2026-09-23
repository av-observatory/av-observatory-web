# Policy tracker data

`public/data/policy_tracker.json` is the reviewed, machine-readable snapshot. It contains federal FMVSS and oversight events, 50 state records plus D.C., state legislation/executive-order events and city policy events. Each event has a stable ID, jurisdiction level, instrument, status, date (null if unverified), summary, source URL and verification date. `source_tier: secondary` marks state entries whose direct legislation link still requires review. An event with `historical_status_unverified`, `rescinded`, or `completed` is not current operating authority.

The five-stage FMVSS display uses `status: under_review` after the comment deadline and `status: effective` only after a final rule's effective date. Federal entries include `comment_deadline`, `effective_date`, and links to the proposal or comment extension where applicable. The 2020 occupant-protection proposal remains in the source record alongside its 2022 final rule, but they appear as one rulemaking in the display. Its final rule's `fmvss` array enumerates all 13 numbered standards whose sections are amended in the Federal Register regulatory text; the 2020 proposal's array lists the 11 numbers in its proposed regulatory text. An additional 2026 FMVSS 204 final rule is tracked separately and marked `scope: related vehicle design` because its applicability change is not expressly limited to ADS vehicles. This index covers rulemakings expressly adapting FMVSS to ADS design and closely related steering-control changes, not all generally applicable FMVSS amendments (for example, ordinary seat-belt updates). For every new rulemaking, review the entire proposed and final Part 571 regulatory text, record each distinct amended standard number, check the effective and any later compliance dates, and link both stages. Search the Federal Register by NHTSA, Part 571 and ADS/steering-control terms; compare subsequent final rules and withdrawals before changing a proposal's status. Do not treat a single search result or a headline's named standard as the full list. California DMV and CPUC rulemaking milestones are individual `state_events` with stable IDs and primary agency links.

Edit the curated records in `scripts/build-policy-data.py` and state descriptions in `src/lib/statePolicySurvey.ts` / `src/lib/statePolicy.ts`, then run `npm run policy:rebuild` and review the JSON diff. The generator does not automatically infer legal changes from headlines. Add new city events to `city` and federal rulemakings to `federal`, keeping proposal and final status separate. Run `npm run build` before publishing.

## R2 configuration

The site fetches the public R2 object at runtime when `NEXT_PUBLIC_POLICY_R2_URL` is set at build time. It falls back to its bundled snapshot if R2 is unavailable. GitHub Actions uploads the validated JSON after a successful build when these repository settings exist:

| GitHub setting | Value |
| --- | --- |
| Variable `POLICY_R2_ACCOUNT_ID` | Cloudflare account ID |
| Variable `POLICY_R2_BUCKET` | R2 bucket name |
| Variable `POLICY_R2_PUBLIC_URL` | Public HTTPS URL ending `/policy/policy_tracker.json` |
| Secret `POLICY_R2_ACCESS_KEY_ID` | R2 S3 API token access key |
| Secret `POLICY_R2_SECRET_ACCESS_KEY` | R2 S3 API token secret |

Create the bucket and public custom domain, grant the API token write access to the bucket, then allow the GitHub Pages origin in its CORS policy for `GET`. Rerun the Pages workflow to upload `policy/policy_tracker.json`. The UI identifies whether R2 or the bundled snapshot supplied the visible record. Without these settings, the site publishes the JSON snapshot but does not store it in R2.
