---
title: 'Privacy Policy'
slug: privacy-policy
post_type: article
---

# Privacy Policy

**Effective Date:** April 27, 2026
**Company:** Voucha, Inc.
**Contact:** team@voucha.ai

This Privacy Policy explains how Voucha, Inc. ("Voucha," "we," "our," or "us") collects, uses, and protects your information when you use the Voucha platform.

---

## 1. Information We Collect

### Account Information

When you create an account, we collect:

- **Email address** — used for authentication, notifications, and account recovery
- **Phone number** — optionally provided; used for authentication and account recovery
- **Username and display name** — public-facing identity on the platform
- **Authentication credentials** — we support email one-time passwords, WebAuthn passkeys, and TOTP authenticator apps. One-time codes are stored as SHA-256 hashes and expire after 15 minutes. We do not store passwords.
- **OAuth provider data** — if you sign in via Google, GitHub, Facebook, Apple, X, LinkedIn, Microsoft, or other OAuth providers, we receive a unique identifier and basic profile information (name, email) from that provider. We may also receive an access token to enable features such as friend discovery.

### User-Generated Content

Content you contribute to the platform, including:

- Posts, reviews, data points, and discussions
- Votes, upvotes, and downvotes you cast
- Follows, bookmarks, and list memberships
- Bio and profile settings

### Usage Data

We collect information about how you use the platform:

- Pages viewed and features used
- Search queries
- Referral links clicked
- Contribution timestamps and activity patterns

### Device and Technical Information

- IP address
- Browser type and version
- Operating system
- Referring URL
- Session identifiers
- User agent strings associated with votes (used for fraud and integrity analysis)

### Vote Integrity Data

To protect the integrity of the platform's trust scoring, we analyze voting patterns for anomalies. This analysis may involve correlating IP addresses across votes to detect coordinated or inauthentic behavior. Results are stored as integrity flags and are retained for the life of the account.

### Recently Viewed

We retain a record of content you have recently viewed for up to 30 days to support features like "recently viewed" and personalized feeds.

### Business Contact Information (CRM)

Voucha operates an internal business CRM used to manage relationships with prospective partners, influencers, and business contacts. This system may contain contact information (name, email, phone, social media handles) sourced from inbound inquiries, referrals, or publicly available professional profiles. This data is used solely for outreach and partnership management and is accessible only to Voucha staff. If you believe Voucha holds your contact information and you wish to access, correct, or delete it, contact us at team@voucha.ai.

---

## 2. How We Use Your Information

### Providing the Service

We use your information to operate Voucha, including:

- Authenticating your identity and maintaining your session
- Displaying your contributions and profile
- Computing trust scores and data aggregates
- Ranking content based on your social graph and trust signals
- Delivering feeds, notifications, and RSS content

### Content Moderation

Voucha uses automated tools, including OpenAI's API, to help moderate submitted content for policy violations. **We use OpenAI solely for moderation purposes. We do not sell your data to AI companies, and your content is not used to train AI models.**

### Copyright Process

If Voucha activates its US copyright process, we process the information in copyright notices,
appeals, counter-notices, email correspondence, and supporting evidence to assess and administer a
copyright case. This can include names, contact details, signatures, hosted-use URLs, descriptions
of copyrighted work, the original email, attachments, and correspondence metadata. We use a
restricted agent-assisted extraction only to structure an email or identify abuse. Staff review
email submissions and required legal decisions.

Accepted case records can be viewed by signed-in members. They show only a redacted case projection
such as case status, dates, hosted-use references, and timeline events. We do not publish claimant
or poster identity, contact details, signatures, raw email, evidence, staff rationale, or agent
analysis. Private case data is restricted to participants where appropriate and authorized staff.

### Analytics

We use server-side analytics (Google Tag Manager, server-side configuration) to understand platform usage, improve features, and measure performance. Analytics are only loaded when you grant consent via the cookie banner. We do not use client-side advertising trackers or Google AdSense.

### Personalization

We use your activity, follows, and social graph to personalize your feed, surface relevant content, and prioritize trusted contributions.

### Communications

We may send you:

- Account-related notifications (security alerts, billing confirmations)
- Platform notifications you have opted into (new followers, content replies)
- Service announcements for material changes to the platform

You can manage notification preferences in your account settings.

---

## 3. Cookies and Local Storage

We use cookies and local storage to operate the platform. For a complete list of cookies, their purposes, and durations, see our [Cookie Policy](./cookie-policy.md).

### Session Cookies

We use session cookies to maintain your authenticated state. These are essential for the platform to function and cannot be opted out while using the service.

### Analytics Cookies

When you choose "Accept All" in the cookie consent banner, we load Google Tag Manager (server-side, via `g.voucha.ai`) and Sentry session replay. You can change your preference at any time using the cookie banner.

### Local Storage

We store user preferences in your browser's local storage, including:

- Theme preference (light/dark)
- Display settings and UI preferences
- Cookie consent choice
- Draft content

These are stored locally on your device and are not transmitted to our servers except as part of normal account sync.

### What We Don't Use

- No third-party advertising cookies
- No Google AdSense or ad network tracking pixels
- No cross-site tracking cookies

---

## 4. Third-Party Services

Voucha integrates with third-party services that may process your data:

| Service                                                                       | Purpose                                                                                                                                           | Data Shared                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stripe**                                                                    | Billing and subscription management                                                                                                               | Name, email, payment method details; retained for 7 years per financial regulations; email is redacted from the Stripe customer record when you delete your account              |
| **OAuth Providers** (Google, GitHub, Facebook, Apple, X, LinkedIn, Microsoft) | Authentication and friend discovery                                                                                                               | Unique ID, email, name from provider; access tokens where required for friend sync                                                                                               |
| **AWS**                                                                       | Infrastructure, file storage (S3 for images and data exports), email delivery (SES)                                                               | Uploaded images, data export files, email content for delivery                                                                                                                   |
| **OpenAI**                                                                    | Content moderation and copyright-intake analysis                                                                                                  | Submitted content text for policy review; for copyright email submissions: sender name and email address, subject line, full message body, and attachment filenames and metadata |
| **Cloudflare**                                                                | CDN, DDoS protection, edge routing                                                                                                                | IP address, request metadata                                                                                                                                                     |
| **Sentry**                                                                    | Error monitoring, session replay recordings (approximately 10% of sessions and 100% of error sessions; replay data may include page interactions) | Error traces, browser info, session interactions                                                                                                                                 |

Each of these providers has their own privacy policy. We select providers who maintain appropriate security and data protection standards.

**Regarding OpenAI:** Content submitted for moderation review and copyright-intake analysis is processed by OpenAI's API under their data processing terms. For a copyright email submission, this can include the sender's name and email address, subject line, full message body, and attachment filenames and metadata. This data is used only for moderation and copyright-case determinations and is not used to train OpenAI's models under our API agreement.

**Regarding email delivery:** Outbound emails sent by the platform (notifications, data export links, authentication codes) are delivered via AWS SES. A copy of outbound emails is retained in an internal mailbox for deliverability monitoring.

---

## 5. Data Retention

- **Account data and content** — retained while your account is active
- **Deleted account content** — posts are reassigned to a [deleted] tombstone; personal identifying information (email, phone, social logins, passkeys) is removed upon account deletion
- **Recently viewed data** — 30-day rolling retention
- **Vote and activity data** — retained in aggregate form for trust scoring even after individual user deletion
- **Billing records** — retained as required by financial regulations (typically 7 years); the email address associated with your Stripe customer record is redacted when you delete your account
- **Security logs** — retained for up to 12 months
- **Vote integrity flags** — retained for the life of the account; anonymized upon account deletion
- **Copyright case records and evidence** — retained under the applicable legal, safety, and
  retention requirements. We do not publish private evidence or correspondence.

---

## 6. Your Rights

### Access

You may request a copy of your personal data at any time from your account settings. We will prepare a downloadable archive (ZIP file) containing your profile, posts, votes, and bookmarks. Exports are typically ready within a few minutes.

### Correction

You may update your account information, username, and profile at any time from your account settings.

### Deletion

You may delete your account at any time from your account settings. Account deletion is immediate and irreversible. Upon deletion:

- Your email, phone number, and linked social accounts are permanently removed
- Your posts remain on the platform attributed to [deleted]
- Your votes, bookmarks, and follows are permanently deleted

To delete your account, go to Settings and confirm by typing "delete my account."

### Data Export (Portability)

Your data export contains:

- `profile.csv` — username, display preferences, bio, settings, created date
- `posts.csv` — all posts created by you
- `votes.csv` — all votes you cast
- `bookmarks.csv` — saves, follows, hides, and other bookmarks

Download links expire after 7 days. You can request a new export at any time.

### Opt-Out

You can opt out of analytics and non-essential cookie processing using the cookie consent banner when it is presented. If you have already made a cookie choice and want to change it, clear the `cookie-consent` entry from your browser's local storage and reload the page to see the banner again. You may also opt out of additional non-essential data processing by contacting us at team@voucha.ai. Note that essential processing required to operate the service (authentication, trust scoring) cannot be opted out while using the platform.

### GDPR and CCPA

If you are in the European Economic Area, you have rights under GDPR including the right to access, rectification, erasure, restriction of processing, data portability, and the right to object. If you are in California, you have rights under CCPA including the right to know, delete, and opt-out of sale of personal information. **Voucha does not sell personal information.**

To exercise any of these rights, contact us at team@voucha.ai or use the self-service tools in your account settings.

---

## 7. Children's Privacy

Voucha is not directed at children under 13. We do not knowingly collect personal information from children under 13. If we become aware that we have collected information from a child under 13, we will delete that account and associated data promptly.

If you believe a child under 13 has created an account, please contact us at team@voucha.ai.

---

## 8. Security

We take security seriously and implement appropriate technical and organizational measures, including:

- **Encryption in transit** — all data transmitted between your browser and our servers uses TLS encryption
- **Secure credential storage** — one-time authentication codes are stored as SHA-256 hashes; API keys are stored as SHA-256 hashes and cannot be recovered after creation
- **Rate limiting** — API endpoints and authentication flows are rate-limited to prevent abuse
- **Access controls** — internal access to user data is restricted to authorized personnel

No system is completely secure. If you suspect a security issue, please report it to team@voucha.ai.

---

## 9. International Data Transfers

Voucha is operated from the United States. If you are located outside the United States, your information may be transferred to and processed in the United States and other countries where our service providers operate. We take steps to ensure that such transfers comply with applicable data protection laws.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes via the platform. For changes that materially affect how we process your personal data, we will seek your affirmative re-consent before the changes take effect. The "Effective Date" at the top of this page indicates when the policy was last revised.

---

## 11. Contact

If you have questions about this Privacy Policy or how we handle your data, contact us at:

**Voucha, Inc.**
team@voucha.ai
