# Topic Recommendations Service

Source entrypoint: [backend/services/topic-recommendations/README.md](../../../../../backend/services/topic-recommendations/README.md)

Services for the topic recommendation queue.

## What It Does

- stores user/admin-created topic recommendations as `topic_recommendation` posts plus `post_topic_recommendations`
- exposes approval, rejection, search, update, and withdraw workflows for the logged-in recommendation queue

## Data Model

- base post: rationale title/markdown, shared elections, shared caches, shared metrics
- extension row: proposed topic title/slug/markdown, aliases, primary hostname, additional hostnames, `topic_type`, `example_referral_url_id`, review status, reviewer metadata, created topic ID, and last approval error message
- ordered landing-page destinations: `post_topic_recommendation_landing_page_urls` rows reference `urls` and retain submitted order
- create and update flows share the same normalization/materialization path for hostnames, aliases, and embedding content so partial edits do not drift from create-time behavior

### Typed Topics

`topic_type` controls the kind of topic created on approval:

| `topic_type`       | Required field           | Description                                                   |
| ------------------ | ------------------------ | ------------------------------------------------------------- |
| `topic` (default)  | —                        | Generic topic; no additional extension row                    |
| `referral_program` | `example_referral_link`  | Creates `topics__referral_programs` extension row on approval |
| `card`             | `landing_page_urls` (≥1) | Creates `topics__cards` extension row on approval             |

Submitted URLs pass normalization, Web Risk and blocked-hostname checks during materialization. URL registration commits before recommendation references are written; reference replacement is transactional. Referral examples suppress URL-created crawl events. The API continues exposing `example_referral_link` and `landing_page_urls` as resolved URL strings.

Pending recommendation reads retain submitted URL strings for review and editing if a hostname is blocked later. These posts are excluded from generic public discovery; approval checks URL safety again before publishing the topic.

Conditional-required validation is enforced in `normalizeTopicRecommendationValues` before any DB write. Type-specific landing-page URL relations are created during approval in the same transaction as the topic.

## Discovery Rules

- generic `/api/posts` does not expose `topic_recommendation`
- generic `/api/posts/:idOrSlug` routes do not expose `topic_recommendation`
- generic tools like `search_posts` do not expose `topic_recommendation`
- generic semantic post search does not expose `topic_recommendation`
- the dedicated `/api/topic-recommendations` route and service search do expose them

## Authorization

- service-layer authorization lives in [authorization.mts](../../../../../backend/services/topic-recommendations/authorization.mts)
- creator or admin can edit pending recommendations
- creator or admin can withdraw pending recommendations
- only admins can approve or reject
- `asTopicRecommendationPost` decides whether a loaded post is a topic recommendation. The
  `/api/v1/topic-recommendations/:id` routes and the `update_topic_recommendation` and
  `withdraw_topic_recommendation` MCP tools share it, so a post that is missing or is not a
  recommendation is "not found" in both, and the commands above stay the only permission rules

## Approval Behavior

- approval creates a new topic with `created_by_id` set to the approving admin
- approval reuses topic-domain update and alias services instead of mutating topics with recommendation-local SQL wrappers
- proposed aliases are insert-only; if any alias already exists on another topic, approval fails and the admin must edit the recommendation before retrying
- failed approvals persist the last human-readable error message on the recommendation so admins can see slug, title, alias, or hostname conflicts from the queue

## Related

- API: [../../api/v1/topic-recommendations/README.md](../../../../requirements/api/v1/topic-recommendations/README.md)
- Posts: [../posts/AGENTS.md](../../../../../backend/services/posts/AGENTS.md)
