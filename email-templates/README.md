# Email Templates

React Email templates for all Voucha emails.

Templates use React Email 6's unified `react-email` package for components and
`@react-email/render` for HTML/text rendering. The email template build bundles
the component and rendering runtime into `dist/index.mjs`, so React Email,
React, React DOM, and the preview server remain development-only dependencies.

## Templates

If a template is not listed below, it is not active.

Templates whose Props include `physicalAddress` are commercial/marketing email and require both a physical mailing address and a visible unsubscribe link, per CAN-SPAM. The address value itself is supplied by the backend (env-configurable, currently a placeholder pending a real value) — see `MarketingFooter` in `components.tsx`. `marketing-footer.test.mts` enforces that both the address and unsubscribe link render for every such template.

### Transactional

| Template                 | Subject                                      | Trigger                                                   | Site notification | Props                                                                       | Settings |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- | -------- |
| `login-token`            | Your Voucha One-Time Password Login          | User requests sign-in                                     | None              | `emailAddress`, `token`, `expiration`                                       | N/A      |
| `email-verification`     | Verify Your Email Address                    | Email address confirmation                                | None              | `token`                                                                     | N/A      |
| `community-invite`       | You've been invited to join {communityName}  | Another user invites the recipient to a community         | None              | `communityName`, `inviterName`, `code`                                      | N/A      |
| `data-export-ready`      | Your Data Export is Ready                    | Export job completes                                      | None              | `downloadUrl`, `expiresInDays`                                              | N/A      |
| `renewal-price-increase` | Your Voucha {plan} renewal price is changing | A renewing membership will move to a higher current price | None              | `plan`, `interval`, `currentPrice`, `newPrice`, `renewsAt`, `membershipUrl` | N/A      |

### Moderation

| Template                         | Subject                                                   | Trigger                                                      | Site notification | Props                                                                                                | Settings                 |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------- | ------------------------ |
| `community-moderation-summary`   | Community moderation summary for {generatedForDate}       | Scheduled summary for community owners and moderators        | None              | `userName?`, `generatedForDate`, `settingsUrl`, `unsubscribeUrl`, `physicalAddress`, `communities[]` | Moderation email cadence |
| `community-application-decision` | Your application to {communityName} was approved/rejected | An owner or moderator approves or rejects a join application | None              | `communityName`, `communityUrl`, `status`, `rejectionReason?`                                        | N/A                      |
| `community-role-change`          | Your role in {communityName} has changed                  | An owner promotes or demotes a member's role                 | None              | `communityName`, `communityUrl`, `newRole`, `direction`                                              | N/A                      |
| `community-ownership-transfer`   | Ownership of {communityName} has changed                  | An owner transfers ownership to a moderator                  | None              | `communityName`, `communityUrl`, `recipientRole`                                                     | N/A                      |

### Engagement

| Template              | Subject                            | Trigger                                             | Site notification | Props                                                                                 | Settings          |
| --------------------- | ---------------------------------- | --------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- | ----------------- |
| `welcome`             | Welcome to Voucha                  | User signs up                                       | None              | `userName`                                                                            | N/A               |
| `follow-topics`       | Topics from people you trust       | The user follows no topics and has recommendations  | None              | `userName?`, `topics[]`, `settingsUrl`, `unsubscribeUrl`, `physicalAddress`           | Engagement emails |
| `post-referral-link`  | Referral links from your circle    | The user has not activated a referral link          | None              | `userName?`, `referralPrograms[]`, `settingsUrl`, `unsubscribeUrl`, `physicalAddress` | Engagement emails |
| `follow-news-sources` | News sources from people you trust | The user follows no sources and has recommendations | None              | `userName?`, `sources[]`, `settingsUrl`, `unsubscribeUrl`, `physicalAddress`          | Engagement emails |

### Customer Support

| Template        | Subject                  | Trigger                   | Site notification | Props                  | Settings |
| --------------- | ------------------------ | ------------------------- | ----------------- | ---------------------- | -------- |
| `support-reply` | Re: Your support request | Support reply from Voucha | None              | `bodyText`, `subject?` | N/A      |

Transactional templates accept an optional `uiLocale` prop. Supported locales are `en`, `es`, `fr`, and `pt`; the renderer normalizes unknown values back to English. Voucha-authored copy is localized for those locales, while user-authored support bodies stay in the original language.

## Design

Styling conventions and tokens are in `styles.mts`. All values are derived from the web design system light mode palette ([`web/DESIGN-SYSTEM.md`](../web/DESIGN-SYSTEM.md)) — email client dark-mode rendering is inconsistent and not reliably controllable, so light mode is used exclusively.

### Key tokens

| Token          | Value     | Web equivalent               |
| -------------- | --------- | ---------------------------- |
| Background     | `#f5f7f9` | `--background` (light)       |
| Foreground     | `#161820` | `--foreground` (light)       |
| Primary (gold) | `#bd8c0f` | `--primary` (light)          |
| Muted          | `#eaecf1` | `--muted` (light)            |
| Muted fg       | `#616a75` | `--muted-foreground` (light) |
| Border         | `#d4d8de` | `--border` (light)           |
| Border radius  | `6px`     | `--radius`                   |

### Structure

Every template uses:

- `VouchaHeader` — centered "Voucha" wordmark in brand gold at the top
- `VouchaFooter` — copyright line with border-top separator (transactional templates)
- `MarketingFooter` — `VouchaFooter`'s copyright line plus a required physical mailing address (commercial/marketing templates; see the CAN-SPAM note above the Templates tables)
- `styles.*` — shared base styles (section padding, heading, paragraph, button, etc.)

Template-specific styles (e.g. progress bars, announcement banners) stay in their own files but import `colors` and `borderRadius` from `styles.mts` for consistency.

Recommendation-style templates (`follow-topics`, `follow-news-sources`, `post-referral-link`) share one layout: each maps its props and copy family to `RecommendationEmailLayout` (`recommendation-email-layout.tsx`) through `createRecommendationEmail` (`recommendation-email.tsx`), which supplies the render implementation, the plain-text body, and the subject. Build new recommendation-style emails on it.

The `login-token` email includes both a primary CTA button and the full `/login?emailAddress=...&otp=...` URL as visible fallback text so mail clients can still complete the sign-in flow when button rendering is degraded.

## Adding a template

1. Create `your-template.tsx` with a default component and `PreviewProps` for the preview server
2. Attach the private render implementation to the component with `Object.assign` (recommendation-style templates get the component and its render implementation from `createRecommendationEmail`)
3. Export `renderYourTemplateEmail(props)` from `your-template-renderer.mts`
4. Add the renderer to `index.mts` exports
5. Create `your-template.test.tsx` with snapshot + content assertions

## Testing

```bash
# Run all email template tests
pnpm run test:email-templates

# Update snapshots after styling changes
pnpm run test:email-templates -- --update

# Preview templates in browser
pnpm --dir email-templates preview
```

Tests include:

- **Snapshot tests** (`*.test.tsx`) — each template has HTML + text snapshots
- **Content tests** — verify key data (tokens, URLs, user names) appear in output
- **Brand consistency** (`styles.test.mts`) — all templates must use brand gold, current-year copyright, Voucha header, and updated spacing

## Build

Templates are bundled with esbuild for use by the backend:

```bash
pnpm --dir email-templates build
```

Output: minified `dist/index.mjs` — imported by `@email-templates/core` consumers.

## Agent rules

Read [CLAUDE.md](CLAUDE.md) before implementation for runtime dependency, inventory, recommendation,
and brand-copy invariants.
