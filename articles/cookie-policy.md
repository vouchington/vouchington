---
title: 'Cookie Policy'
slug: cookie-policy
post_type: article
---

# Cookie Policy

**Effective Date:** April 27, 2026
**Company:** Voucha, Inc.
**Contact:** team@voucha.ai

This Cookie Policy explains what cookies and similar technologies Voucha uses, why we use them, and how you can control them. It supplements our [Privacy Policy](./privacy-policy.md).

---

## What Are Cookies?

Cookies are small text files stored on your device by your browser when you visit a website. They allow the site to recognize your device across requests and sessions. We also use browser local storage for similar purposes.

---

## Cookies We Use

### Essential Cookies

These cookies are required for the platform to function. You cannot opt out of essential cookies while using Voucha.

| Name             | Type          | Purpose                                                      | Duration                   | Party       |
| ---------------- | ------------- | ------------------------------------------------------------ | -------------------------- | ----------- |
| `st`             | HTTP cookie   | Session token — authenticates your current session           | 2 days                     | First-party |
| `dt`             | HTTP cookie   | Device token — recognizes your device for session continuity | 30 days                    | First-party |
| `cookie-consent` | Local storage | Stores your cookie consent preference                        | Persistent (until cleared) | First-party |

Both `st` and `dt` are set with `HttpOnly`, `Secure`, and `SameSite=Lax` flags. They are not accessible to JavaScript.

### Analytics Cookies

These cookies are only set when you choose **"Accept All"** in the cookie consent banner. They are not loaded for users who choose **"Essential Only."**

| Name                         | Type                        | Purpose                                                                                                                                                 | Duration                         | Party                                              |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| GTM tags (via `g.voucha.ai`) | HTTP cookie / local storage | Server-side Google Tag Manager — usage analytics, page view tracking, and conversion measurement                                                        | Per GTM tag configuration        | Third-party (Voucha-operated server-side endpoint) |
| Sentry session replay        | Script                      | Error monitoring and session replay (approximately 10% of sessions; 100% of sessions that encounter errors). Replay data may include page interactions. | Per Sentry session configuration | Third-party (Sentry)                               |

### Functional Cookies

These cookies support specific features. They are loaded as part of the platform and are not dependent on analytics consent.

| Name                 | Type            | Purpose                                                       | Duration | Party                    |
| -------------------- | --------------- | ------------------------------------------------------------- | -------- | ------------------------ |
| Cloudflare Turnstile | Script / cookie | Bot detection and CAPTCHA challenge on login and signup forms | Session  | Third-party (Cloudflare) |

### Local Storage (Non-Cookie)

In addition to cookies, we use browser local storage to store preferences that are only used client-side and are not transmitted to our servers as separate requests:

| Key                    | Purpose                      | Cleared when                   |
| ---------------------- | ---------------------------- | ------------------------------ |
| `cookie-consent`       | Cookie consent preference    | User clears browser storage    |
| Theme preference       | Light/dark mode setting      | User clears browser storage    |
| UI display preferences | Layout and display settings  | User clears browser storage    |
| Draft content          | Unsaved post or reply drafts | User submits or discards draft |

---

## What We Don't Use

- No third-party advertising cookies
- No Google AdSense or ad network tracking pixels
- No cross-site tracking cookies or fingerprinting

---

## How to Control Cookies

### Cookie Consent Banner

When you first visit Voucha, a banner appears at the bottom of the page. You can choose:

- **Essential Only** — only essential cookies are set; analytics and session replay are not loaded
- **Accept All** — essential and analytics cookies are set

You can change your choice at any time by clearing your browser's local storage for the `cookie-consent` key, which will cause the banner to reappear on your next visit.

### Browser Settings

You can also control cookies through your browser settings. Most browsers allow you to:

- View cookies currently set
- Block all cookies
- Delete cookies on exit
- Block cookies from specific sites

Note that blocking essential cookies will prevent you from logging in to Voucha.

---

## Changes to This Policy

We may update this Cookie Policy when we add or change cookies. We will update the Effective Date above and, where the change is material, notify you via the platform.

---

## Contact

If you have questions about cookies or this policy, contact us at:

**Voucha, Inc.**
team@voucha.ai
