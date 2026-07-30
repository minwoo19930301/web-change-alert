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

Pro is an optional paid upgrade inside the same extension. Everything listed under **Features**
above stays free — Pro only adds new capabilities on top.

| | Free | Pro |
|---|---|---|
| Visual target picking, scheduling, browser notifications | ✅ | ✅ |
| Number of monitors | unlimited | unlimited |
| Telegram / Slack / Discord / Webhook / ntfy alerts | — | ✅ |
| Number rules (alert only when a value crosses a threshold or moves by X%) | — | ✅ |
| Change history per monitor + CSV / JSON export | last value only | up to 500 entries |
| Catch up on checks missed while the browser was closed | — | ✅ |

**Price:** $24.9 one-time, permanent, includes future updates.
Launch price **$14.9** for the first 100 buyers.
For comparison, Distill Web Monitor's Starter plan is $15 *per month*.

**Buy:** [Pro page](https://minwoo19930301.github.io/web-change-alert/) — the checkout page is
being set up. Until it is live, email rlaalsdn456456@naver.com to buy at the launch price or to be
notified when it opens.

### How the license works

No account, no license server, no phone-home. After purchase you get a signed license key;
the extension verifies its ECDSA P-256 signature locally and works completely offline.

### Honest limitation

Checks run inside your own browser. That is why login-protected pages work and why bot
protection rarely blocks you — but it also means checks pause while your browser is closed.
Pro runs the missed checks as soon as you come back. It is not a 24/7 cloud monitor.

### Source layout

This repository holds the free extension. The Pro-only code lives in a separate private
repository (`web-change-alert-pro`) because a paywall whose bypass logic is public is not a
paywall. The package published to the Chrome Web Store is the free code in this repository
plus that Pro module, which stays locked until a license is activated.
