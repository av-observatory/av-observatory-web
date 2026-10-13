# Security policy

AV Observatory is a static site (Next.js export on GitHub Pages) with scheduled
data-refresh workflows. It has no server, database, or user accounts.

## Reporting a vulnerability

Please report privately through GitHub: **Security → Report a vulnerability** on this
repository. Do not open a public issue for security problems. We aim to acknowledge
reports within a few days.

## Supply-chain notes

- Browser libraries (Leaflet, Leaflet.heat, PapaParse) are vendored in `public/vendor/`
  at pinned versions rather than loaded from a CDN. Update them deliberately and verify
  hashes against the npm tarballs.
- GitHub Actions are pinned to commit SHAs; Dependabot proposes updates weekly.
- Secrets live only in GitHub Actions secrets; nothing secret may be placed in
  `NEXT_PUBLIC_*` variables or committed data.
