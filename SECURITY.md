# Security policy

Weekbeat handles health and activity data, so we take security reports seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository
(<https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability>).

Include what you found, how to reproduce it, and the version or commit. We aim to answer within 7 days.

## Supported versions

Weekbeat is pre-1.0 (v0.x). Only the latest release and `main` receive fixes.

## Scope and design

- All user data stays on the device (IndexedDB) in v0.x; there is no Weekbeat server holding user data.
- Connector keys and tokens are stored only on the user's device and never exported in plain text.
- Any optional proxy (e.g. a Cloudflare Worker for CORS) must store nothing.

Reports about these guarantees being broken are especially welcome.
