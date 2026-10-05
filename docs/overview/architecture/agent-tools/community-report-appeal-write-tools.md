# Community, Report, Dispute and Appeal Tools

Eleven MCP-only tools let a credential owner create a community, join, leave or apply to one, report
user content, dispute a review, appeal a moderation decision and read the outcome of their own
disputes and appeals. Every write requires Plus or Pro; the four own-case reads stay free. Scopes:
`communities:read` + `communities:write`, `reports:write`, `disputes:read` + `disputes:write` and
`appeals:read` + `appeals:write`. `reports:write` has no read prerequisite because the
tool returns only the report it just filed. `mcp.user:write` covers every write scope here and
`mcp.user:read` the read scopes, as for the other user tools.

## Route-to-tool inventory

| REST route                                                                                                                                                                                   | Tool                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /api/v1/reports`                                                                                                                                                                       | `create_content_report`                                                                                            |
| `POST /api/v1/communities`                                                                                                                                                                   | `create_community`                                                                                                 |
| `POST /api/v1/communities/:idOrSlug/members`                                                                                                                                                 | `join_community`                                                                                                   |
| `DELETE /api/v1/communities/:idOrSlug/members`                                                                                                                                               | `leave_community`                                                                                                  |
| `POST /api/v1/communities/:idOrSlug/applications`                                                                                                                                            | `apply_to_community`                                                                                               |
| `POST /api/v1/disputes`                                                                                                                                                                      | `create_review_dispute`                                                                                            |
| `GET /api/v1/disputes`                                                                                                                                                                       | `list_my_review_disputes` (the caller's own disputes only)                                                         |
| `GET /api/v1/disputes/:id`                                                                                                                                                                   | `get_my_review_dispute` (own dispute only)                                                                         |
| `POST /api/v1/appeals`                                                                                                                                                                       | `create_moderation_appeal` (warning, community ban and post removal targets)                                       |
| `GET /api/v1/appeals`                                                                                                                                                                        | `list_my_moderation_appeals` (the caller's own appeals only)                                                       |
| `GET /api/v1/appeals/:id`                                                                                                                                                                    | `get_my_moderation_appeal` (own appeal only)                                                                       |
| `PATCH /api/v1/disputes/:id`, `PATCH /api/v1/appeals/:id`                                                                                                                                    | No tool, because they are staff-only draft edits. REST has no owner PATCH to map.                                  |
| Dispute and appeal `approval`, `delivery`, `resolution`, `resolution-drafts`                                                                                                                 | No tool, because they are the staff decision lifecycle, outside this scope.                                        |
| `DELETE /api/v1/disputes/:id/annotation`                                                                                                                                                     | No tool, because it is a staff action.                                                                             |
| `GET /api/v1/reports`, `PATCH /api/v1/reports/:id`, `POST .../judgements`                                                                                                                    | No tool, because they are staff report review. Copyright reports belong to the copyright process.                  |
| `PATCH` or `DELETE /api/v1/communities/:idOrSlug`, ownership transfer                                                                                                                        | No tool, because owner administration is out of scope.                                                             |
| Community members, bans, restrictions, warnings, modmail, reports, moderation queue, automod, agent prompts, saved replies, list items, pinned posts, post-type settings, moderator vacation | No tool, because community moderator and owner writes are out of scope.                                            |
| `PATCH /api/v1/communities/:idOrSlug/applications/:id`, `GET .../applications`                                                                                                               | No tool, because deciding and listing applications are moderator actions.                                          |
| `POST /api/v1/communities/invite-redemptions`, invite routes                                                                                                                                 | No tool, because invitations are not in scope; `join_community` covers public communities.                         |
| `GET` and `PUT /api/v1/communities/:idOrSlug/application-questions`                                                                                                                          | No tool. Reading the questions is a follow-up gap: a caller needs the question ids to answer `apply_to_community`. |
| `GET` community, member, post and news routes                                                                                                                                                | Existing [community read tools](community-list-membership-read-tools.md).                                          |

Community creation leaves out `list_type`, `profile_image_id` and `banner_image_id`; images are set
on the web.

## Creation and idempotency

`create_content_report`, `create_community`, `apply_to_community`, `create_review_dispute` and
`create_moderation_appeal` require a UUID `idempotency_key`. The
[delegated contribution admission policy](../../../requirements/platform/agent-access.md#delegated-contribution-admission)
replaces the captcha with the credential, and the same suspensions and quotas apply.

These entities have no post to bind admission to, so `admitDelegatedContribution` does not fit.
`runDelegatedCreate` instead records each attempt in `user_mcp_create_attempts`, unique per credential
owner and key, with a SHA-256 of the tool name and arguments:

- The same key and arguments replay the stored result without writing again or spending quota.
- A changed request fails with `IDEMPOTENCY_KEY_REUSED`.
- A live claim fails with `CONTRIBUTION_ADMISSION_IN_PROGRESS` and a retry delay.
- Argument parsing and ownership checks run before the claim, so a refused request never claims a key.
  Domain guards and quotas run inside the claimed execution, and a failure releases the claim.
- The ledger is retained so a late retry keeps returning the first result; it is classified as
  unbounded growth and the response is an allowed opaque JSON column.
- If storing the response fails after the create succeeded, the claim is released and a retry
  executes again. Reports, disputes and appeals are upserts that absorb this; a community creation
  could duplicate.

Existing-open-case creation is an upsert, as in REST: reporting, disputing or appealing something
with an open case from the same user updates it and returns `is_duplicate: true`, with a new key too.

## Guards

Each tool calls the same domain policy as its REST route, so a refusal matches REST. MCP adds no
restriction and relaxes none.

| Tool                       | REST-equivalent refusals                                                                                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_community`         | Username required, community creation quotas (`CONTRIBUTION_QUOTA_EXCEEDED`), name and slug rules, taken slug `CONFLICT`.                                                    |
| `join_community`           | Already a member `CONFLICT`; private, archived, banned or member-limited community `FORBIDDEN`. No idempotency key: a repeated join is `CONFLICT`.                           |
| `leave_community`          | Not a member `NOT_FOUND`; owner `INVALID_INPUT`; archived community `FORBIDDEN`. `DELETE` is idempotent.                                                                     |
| `apply_to_community`       | Banned `FORBIDDEN`; archived or already pending or a member `CONFLICT`; public community or answers the questions reject `INVALID_INPUT`.                                    |
| `create_review_dispute`    | Unknown post `NOT_FOUND`; not a review, no rating for the topic, or over 4000 characters `INVALID_INPUT`; removed post `INVALID_INPUT`; no verified topic claim `FORBIDDEN`. |
| `create_moderation_appeal` | Missing or revoked warning or lifted ban `NOT_FOUND`; not the caller's `FORBIDDEN`; post not removed or reason over 4000 characters `INVALID_INPUT`.                         |

Over MCP, HTTP 422 and 410 report as `INVALID_INPUT`, and `IDENTITY_REQUIRED` and `COMMUNITY_BANNED`
report as `FORBIDDEN`, because the MCP error mapping has no more specific code for them.

MCP authentication already rejects a suspended credential owner before any tool runs, so nothing is
written. A suspended user therefore cannot appeal over MCP, and `create_moderation_appeal` omits the
account-suspension target: suspension appeals go through the web. Reading an appeal filed against a
suspension on the web still works.

## Own-case reads

REST lets any member list every dispute and appeal in a redacted view and fetch one by id. The MCP
reads are narrower: `list_my_*` lists only the caller's own cases, newest first, and `get_my_*`
refuses another user's case with `FORBIDDEN` (an unknown id is `NOT_FOUND`), staff included. Their
paging follows the shared MCP convention (`limit` 1 to 100, default 25, opaque `after` cursor,
`status` of `pending`, `resolved` or `dismissed`), so unlike REST, which settles an unreadable limit
or unknown status to a default, an out-of-range `limit` or an unknown `status` is an invalid argument.

## Output

Results are facts: ids, slugs, codes, statuses, flags and timestamps. The reported case text
(`claim_text`, `post_content`, `appeal_reason` and `target_context`) is never echoed, and clients
compose their own copy. The only free text is the moderators' `public_response`, which appears once it was
sent and is fenced as external content. Each tool declares an `outputSchema` and returns validated
`structuredContent`. Created rows carry MCP and OAuth-client provenance.

Metadata hints follow the shared rule: a keyed create is `idempotentHint: true` and not destructive,
`join_community` (a `POST` without a key) is not idempotent, and `leave_community` is destructive and
idempotent. The registry and catalog checks validate them.

Reports are user content reports only; copyright claims stay with the copyright process.
