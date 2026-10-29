# Privacy Policy

Effective date: 30 July 2026

Last updated: 29 October 2026

This Privacy Policy explains what Sheet does with your data. Sheet is operated by Deepanshu Mishra ("we", "us", or "our"). It is a desktop app that runs on your machine, with a website at [https://sheet.dipxsy.app](https://sheet.dipxsy.app) and source code at [https://github.com/DeepanshuMishraa/sheet](https://github.com/DeepanshuMishraa/sheet).

This document is a draft for owner and counsel review. It is not legal advice.

## 1. Who we are

- Product: Sheet
- Operator: Deepanshu Mishra
- Website: [https://sheet.dipxsy.app](https://sheet.dipxsy.app)
- Contact: [hello@dipxsy.app](mailto:hello@dipxsy.app)

## 2. The short version

Sheet has no accounts, no cloud sync, and no hosted backend. Your designs stay on your computer. We do not receive them, and we do not sell or share personal data.

## 3. What stays on your machine

The desktop app stores everything in one SQLite file in your OS app-data directory, next to a local key file used for handoff links. This includes:

- Designs, drafts, version history, and canvas transactions
- Uploaded assets
- Preferences such as theme, accent, interface size, sound, and shortcuts
- Browser-style local storage used by the app window for UI state

You can back this data up, move it, or delete it by copying or removing that folder. We cannot read it.

## 4. The local server and MCP

The app starts a local server bound to `127.0.0.1`. It serves the editor, the MCP endpoint, and handoff links. It is not reachable from other machines unless you expose it yourself.

When you point an MCP client (for example Claude or Cursor) at it, that client can read and change your designs through the tools you allow. The client receives the design context those tools return. What it does with that data is governed by the client's own terms and privacy policy, not ours.

Handoff links package design data and token-scoped asset URLs. They work only while the app is running on your machine and can reach the recipient.

## 5. What we collect

We collect nothing from the app itself. The app has no analytics, no tracking, no crash reporting, and no accounts.

Two things leave your machine:

- **Update checks.** The app asks GitHub for the latest release metadata at `github.com/DeepanshuMishraa/sheet/releases`. GitHub sees your IP address and user agent as in any web request, under [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- **Email you send us.** If you write to [hello@dipxsy.app](mailto:hello@dipxsy.app), we keep the message and your address to reply and handle your request.

The marketing website is a static site. It sets no cookies and runs no analytics scripts. Its host, Cloudflare, may log standard request data such as IP address under its own policy.

## 6. Third parties

| Provider | Why | Data involved |
| --- | --- | --- |
| GitHub | Hosts releases and the update manifest | IP address, user agent |
| Cloudflare | Hosts the website | Standard request logs |
| MCP clients you choose | Work on your designs | Design context you allow |

We do not use payment processors, advertising networks, or data brokers.

## 7. Retention

We hold no copy of your designs, so there is nothing for us to retain or delete. Delete the app-data folder to remove your local data. Emails to us are kept as long as needed to deal with your request.

## 8. Your rights

We are based in India and handle personal data in line with the Digital Personal Data Protection Act, 2023. You may ask to access, correct, or erase personal data we hold, and to have a grievance addressed. If you are in the EEA, UK, or Switzerland, you may also object to or restrict processing and port your data. Because we hold almost none, the only data we can find is email correspondence. Write to [hello@dipxsy.app](mailto:hello@dipxsy.app) and we will reply within a reasonable time. You may also complain to the Data Protection Board of India or your local data protection authority.

## 9. Security

The local server binds to loopback only and checks host, origin, and a bridge cookie, so only the app window can use it. Anyone with access to your user account on your computer can read the SQLite file, so protect your device with disk encryption and a login password. No software is completely secure.

## 10. Children

Sheet is not directed to children under 16, and we do not knowingly collect data from them.

## 11. Changes

We may update this policy. Changes are posted here with a new date. The source history is public in the repository.

## 12. Contact

Privacy requests: [hello@dipxsy.app](mailto:hello@dipxsy.app)
