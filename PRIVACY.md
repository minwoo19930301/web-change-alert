# Privacy Policy — Web Change Alert

Last updated: 2026-07-31

## Short version

Web Change Alert does not collect, transmit, or sell your data. Everything it stores stays in
your own browser. There is no account, no server, and no analytics.

## What the extension stores, and where

All of the following is written to `chrome.storage.local` on your own machine and never leaves it
unless you explicitly configure it to (see "Outbound requests" below):

- The monitors you create: page URL, the CSS selector of the element you picked, the extraction
  mode, the page title and favicon URL
- The schedule and alert filters you set for each monitor
- The most recently collected value, the previous value, and timestamps
- Pro only: change history per monitor (up to the limit you choose), and the alert channel
  settings you enter
- Pro only: your license key

You can delete all of it at any time by removing a monitor, clearing the history from the Pro
page, or uninstalling the extension.

## Outbound requests

The extension makes network requests in only two situations, both driven by you:

1. **Checking a page you asked it to monitor.** The extension opens the URL you provided in a
   background tab of your own browser and reads the element you selected. This is an ordinary
   request from your browser to that site, using your existing session. Nothing is routed
   through any server operated by the developer.
2. **Pro alert channels you configure yourself.** If you enable Telegram, Slack, Discord, ntfy,
   or a custom webhook, the extension sends the change notification directly to the endpoint
   *you* entered. The developer does not receive a copy and cannot see those messages. Leave
   these channels off and no outbound alert request is made at all.

There is no telemetry, no crash reporting, and no usage analytics.

## License verification (Pro)

The Pro license key is a token signed with the developer's private key. The extension verifies
the signature locally using a bundled public key. This check performs **no network request**, so
activating or using Pro does not report anything about you to anyone.

## Data sharing

No data is sold or transferred to third parties. No data is used or transferred for purposes
unrelated to the extension's single purpose (monitoring page elements you select and alerting you
when they change). No data is used to determine creditworthiness or for lending purposes.

## Permissions and why they are needed

| Permission | Why |
|---|---|
| `storage` | Save your monitors, settings, and history locally |
| `alarms` | Run the checks on the schedule you set |
| `notifications` | Show a browser notification when a value changes |
| `scripting` | Read the value of the element you selected on the page you chose |
| `tabs` | Open and close the background tab used for a check; open the page when you click a notification |
| `<all_urls>` | You choose which sites to monitor, so the set of hosts cannot be known in advance. Also used to deliver alerts to the Pro channel endpoints you configure |

## Payments

Pro is purchased outside the Chrome Web Store through a third-party payment provider. That
provider handles the transaction and any personal data involved in it under its own privacy
policy. The extension never sees payment details.

## Contact

rlaalsdn456456@naver.com
