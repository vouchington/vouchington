---
title: 'How Moderation Works on Voucha'
slug: how-moderation-works
post_type: article
topics:
  - voucha
  - trust
---

# How Moderation Works on Voucha

Moderation is one of those things that's easy to get wrong in two opposite directions: too little and the community degrades; too much and it feels like a surveillance state. Voucha uses layered moderation so that automated screening, community tools, user reports, and human review reinforce each other — without giving any single system unchecked power.

Here's how the layers work.

## Automated Clearance

Every post starts in a clearance pipeline before it can appear anywhere on the platform.

Spam detection looks for excessive links, spam keywords, duplicate content, referral-link abuse, embedding similarity, and low-quality text. OpenAI moderation uses `omni-moderation-latest` to evaluate both the text and any attached images.

A post stays pending until both checks finish. If either flags the post, it's rejected. If both pass, the post is approved and can enter feeds. Flagged images are removed automatically.

## AI Moderation Agents

After a post clears the initial pipeline, specialized agents review it for a second layer of issues: self-promotion, marketplace content, AI-generated writing, partisan political content, clickbait, vague posts, and low-effort posts.

A subset of these agents are designated as global baseline moderators. They run on every post regardless of whether the post belongs to a community or whether any community has opted into AI moderation — because some violations are platform-wide, not community-specific.

Some agents move flagged posts into a review queue rather than removing them outright. Their results are deduplicated by content hash, so unchanged content doesn't repeatedly trigger the same model call.

## Community Moderation Tools

Community owners and moderators have their own set of tools for managing their space without escalating every issue to platform staff. They can:

- Review pending posts before they appear in the community
- Reject or unpublish posts from community feeds
- Ban users from the community and lift bans later
- Activate raid-mode restrictions during coordinated abuse
- Issue warnings
- Keep private moderator notes
- Use modmail to discuss moderation issues with users
- Create custom automod prompts and simulate them before use

Community tools are intentionally scoped to the community. Platform admins retain global enforcement tools for site-wide issues.

## Reports and AI Judgements

Signed-in users can report posts, comments, user profiles, RSS feed items, and domains for spam, harassment, misinformation, illegal content, or other concerns.

Reports do not automatically hide content. They create moderation queue items for staff or community moderators to review. Voucha also runs an AI report-judgement agent that can recommend `no_action`, `warn`, `remove`, or `escalate`. Escalation is advisory — a human still makes the final call.

## Ban Evasion and Report Integrity

Ban-evasion detection compares new community activity against banned users using content hashes, embedding similarity, and referral-link overlap. When the detector flags a likely match, it creates a system-generated report for community moderators to confirm or dismiss.

Report integrity checks look for mass-report campaigns and bad-faith reporting. Confirmed abuse can lower a user's trust tier; revoked penalties can be re-applied after later offenses.

## The Modlog

Every moderation action is recorded in a unified modlog. Human actions show the moderator or admin who acted. Automated moderation uses system users such as `automod`; ban-evasion reports use the `ban-evasion` system user so system-generated reports can be correctly identified and redacted when appropriate.

## Disputes and Appeals

Verified representatives of a topic — a brand or issuer, for example — can file review disputes on legal or factual grounds. Those disputes are reviewed by a human before any response is sent.

Members can also file formal appeals against moderation decisions, including community bans, user warnings, and post removals. Appeals are reviewed by staff within 72 hours. You'll receive a notification when you receive a warning, a community ban, or a platform-moderated post removal. You can navigate to `/my/warnings` to appeal warnings, `/my/bans` to appeal community bans, and `/my/removed-posts` to view and appeal community post removals. The `/my/appeals` page tracks the status of all your filed appeals.

One firm rule: any response text sent to an appellant must be approved by a human moderator before it's delivered. AI-drafted summaries are advisory only and are never sent without explicit human approval.

## Who Can See What

Signed-out visitors cannot access moderation queues. Signed-in users can see limited, redacted report information. Community moderators see reports and moderation context for their communities. Platform moderators and administrators see the global queue, AI judgements, and enforcement controls appropriate to their roles.
