# Landing Pages Strategy

## Value Proposition

Every user becomes a distribution channel. Landing pages turn individual users into acquisition funnels — a shareable @username page where users curate their referral links, reviews, and recommendations.

The key insight: **users are incentivized to share their landing page** because it contains their referral links. Every share brings traffic to Voucha. The product grows through its users.

## Growth Loop

```
User creates @username page
        ↓
User shares link on social media, forums, email signatures
        ↓
Visitors arrive on Voucha via the landing page
        ↓
Visitors discover content, sign up
        ↓
New users create their own @username pages
        ↓
Cycle repeats
```

Each iteration of the loop adds both content (the new user's reviews and data points) and distribution (the new user's social reach).

## Optimization Priorities

### Dynamic OG Images

Each landing page generates a dynamic Open Graph image containing:

- Username and avatar
- Top referral categories (e.g., "Credit Cards, Hardware, AI Tools")
- Data point count or review count
- Visual branding consistent with Voucha

Dynamic OG images ensure that shares on Twitter/X, Facebook, LinkedIn, and messaging apps display a rich, branded preview rather than a generic link.

### UTM Tracking

All outbound links from landing pages include UTM parameters for attribution:

- `utm_source`: Platform where the link was shared (auto-detected where possible)
- `utm_medium`: "referral"
- `utm_campaign`: Username of the landing page owner
- `utm_content`: Specific link identifier

### Click Analytics

Landing page owners see analytics for their page:

- **Clicks per link**: Which referral links get the most engagement
- **Conversion over time**: Click trends (daily/weekly/monthly)
- **Source attribution**: Where visitors are coming from (direct, Twitter, Reddit, etc.)
- **Visitor count**: Total and unique page views

### Mobile-First Design

Landing pages are designed mobile-first. The majority of social media traffic arrives on mobile devices. The layout prioritizes:

- Single-column layout with large tap targets
- Fast loading (minimal JavaScript, optimized images)
- Clear visual hierarchy: avatar → title → subtitle → referral links
- Sticky CTA for sign-up

### Quick Setup

Landing page creation takes less than 60 seconds:

1. Set title and subtitle
2. Select items from candidates (profile links, reviews, referral links, topic groups)
3. Reorder items via drag-and-drop
4. Publish

## Social Sharing Integration

### Twitter/X Cards

- `twitter:card` = "summary_large_image"
- Dynamic OG image as the card image
- Username and subtitle as description
- Link directly to @username page

### Instagram Bio Link

Landing pages serve as the user's "link in bio" — a single URL that contains all their product recommendations with referral links. Competes directly with Linktree but with structured data and community trust.

### LinkedIn Sharing

Professional audience for credit card and AI tool verticals. OG tags optimized for LinkedIn's preview renderer.

### Facebook OG

Full Open Graph protocol support:

- `og:title` = "@username on Voucha"
- `og:description` = User's subtitle or auto-generated summary
- `og:image` = Dynamic OG image
- `og:url` = Canonical landing page URL

## Referral Integration

Landing pages are deeply integrated with the referral link system:

- **Social graph prioritization**: When a logged-in user visits a topic page, referral links from people they follow rank higher. A friend's link ranks above a stranger's link.
- **Decay ranking**: Referral links are ranked using a time-decay algorithm (30-day half-life on vote scores). Active, highly-rated links surface above stale ones.
- **Click attribution**: Clicks on referral links are attributed to the landing page owner for analytics purposes. Fire-and-forget tracking ensures zero latency impact on the user's click-through.

See [Referral Links](../requirements/users/REFERRAL-LINKS.md) for full referral system specification.

## Onboarding Integration

Landing page creation is Step 4 of the post-signup onboarding flow:

1. Create account (email or OAuth)
2. Choose username
3. Select interests (topics to follow)
4. **Create your landing page** — prompted to add at least one referral link
5. Explore the feed

By placing landing page creation early in onboarding, users are primed to share their page immediately. The prompt to add a referral link gives users a concrete reason to return and share.

## Missing Feedback (Growth Blockers)

The landing page growth loop has basic visit/click analytics, but users still get insufficient feedback on what's working:

- **Full-funnel attribution**: The app already exposes landing page visits, clicks, CTR, and daily stats, but doesn't yet surface an end-to-end funnel (visits -> clicks -> signups) or clearly attribute signups back to specific pages/links using `session_referral_attributions` (formerly filed as jonathanong/filaments#1420).
- **Sharing nudges**: No prompts when pages hit traction milestones (first 5 visits, first click-through, first referred signup).
- **Referral revenue**: No estimated earnings from referral link clicks (formerly filed as jonathanong/filaments#1426).
- **Referral signup notifications**: Referrer isn't notified when someone they referred signs up (formerly filed as jonathanong/filaments#1422).

See [Feedback Loops](feedback-loops.md) for the full gap analysis.

## Future Enhancements

- **Custom themes**: Let users customize colors and layout of their landing page
- **Embedded widgets**: Allow users to embed their landing page or specific referral links on external sites
- **QR codes**: Auto-generated QR codes for in-person sharing (conference talks, meetups)
- **A/B testing**: Let users test different link orderings and see which converts better

## Related

- [Landing Page Management](../requirements/users/LANDING-PAGES.md) — item selection, drafts, saves, refreshes, and client parity
- [Referral Links](../requirements/users/REFERRAL-LINKS.md) — referral submission, ranking, and attribution
- [Landing Page Analytics](../requirements/admin/LANDING-PAGE-ANALYTICS.md) — owner-facing analytics requirements
- [Feedback loops](feedback-loops.md) — growth feedback loop inventory
- [Web rules](../../web/CLAUDE.md) — landing page UI and routing conventions
- [Backend rules](../../backend/CLAUDE.md) — attribution and service conventions
