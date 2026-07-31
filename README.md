# Web Change Alert

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Published-blue?style=for-the-badge&logo=googlechrome)](https://chromewebstore.google.com/detail/jcfhchhliffpofclnhhjjdjakinpmfmc?utm_source=item-share-cb)


Web Change Alert monitors selected parts of webpages and sends a browser notification only when the value actually changes.

Chrome Web Store: [Web Change Alert](https://chromewebstore.google.com/detail/jcfhchhliffpofclnhhjjdjakinpmfmc?utm_source=item-share-cb)

## Features

- Select text, images, SVG, canvas, or attributes directly from a page
- Choose from nearby/nested target candidates when several values overlap
- Schedule automatic checks by interval, daily, weekly, or monthly time
- Add optional filters so alerts fire only when text contains, disappears, or matches a pattern
- Copy an Agent AI prompt for Codex, Claude Code, OpenClaw, Antigravity, and similar browser-controlling agents
- Save site title and favicon for easier monitor scanning
- Run a monitor manually at any time
- Re-select the target quickly when collection fails
- Track multiple sites at once

## Notes

- Login-required sites need an active signed-in session
- Sites protected by anti-bot systems may require manual verification
- Very short intervals can cause rate limiting or blocking from the target site

## Web Change Alert Pro

Pro is a **separate extension**, not an in-app purchase. This free version stays exactly as it is —
nothing that used to be free was moved behind a paywall, and the free package contains no Pro code
at all.

| | Free (this extension) | Pro (separate) |
|---|---|---|
| Visual target picking, scheduling, browser notifications | ✅ | ✅ |
| Number of monitors | unlimited | unlimited |
| **Scenario steps** — click a tab, scroll to load, type, press Enter, *then* read the value | — | ✅ |
| **Order-based targeting** — pick by visible text or "the 3rd match", not just a CSS selector | — | ✅ |
| **Automatic login** — credentials encrypted with your own master passphrase, used when a check hits a login wall | — | ✅ |
| **Failure diagnosis** — tells a dropped session apart from a captcha, an empty page, or a moved element | — | ✅ |
| Telegram / Slack / Discord / Webhook / ntfy alerts | — | ✅ |
| Number rules (alert only when a value crosses a threshold or moves by X%) | — | ✅ |
| Change history per monitor + CSV / JSON export | last value only | up to 500 entries |
| Catch up on checks missed while the browser was closed | — | ✅ |

**Price:** $39.90 one-time, permanent, includes future updates, up to 3 browsers.
Launch price **$24.90** for the first 100 buyers.
For comparison, Distill Web Monitor's Starter plan is $15 *per month* ($180 a year).

**Buy:** [Pro page](https://minwoo19930301.github.io/web-change-alert/). A hosted checkout is
being set up; until it is linked there, email rlaalsdn456456@naver.com and the license key follows.

The Chrome Web Store has not supported paid extensions since February 2021, so every paid extension
is bought outside the store and unlocked with a license key. This one verifies the key offline, with
no license server.

### How credentials are stored (Pro)

Encrypted with AES-GCM using a key derived from your master passphrase (PBKDF2-SHA256, 250,000
iterations). The passphrase is never stored anywhere. While unlocked, decrypted values live only in
memory and disappear when you close the browser. They are typed into a page only at the moment the
login step runs. No local helper program, no local server, no cloud.

### How the license works (Pro)

No account, no license server, no phone-home. After purchase you get a signed license key; the
extension verifies its ECDSA P-256 signature locally and works completely offline.

### Honest limitation (both versions)

Checks run inside your own browser. That is why login-protected pages work and why bot protection
rarely blocks you — but it also means checks pause while your browser is closed. Pro runs the missed
checks as soon as you come back. It is not a 24/7 cloud monitor.

### Source layout

This repository holds the free extension, and what ships to the store is exactly this code.
The Pro extension is built from a separate private repository (`web-change-alert-pro`) that vendors
this code and adds its own modules on top; its paywall and credential-handling code is not public,
because a paywall whose bypass logic is published is not a paywall.
