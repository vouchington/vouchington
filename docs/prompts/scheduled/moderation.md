Review moderation behavior. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

- Check [Moderation Flows](../../../docs/requirements/moderation/MODERATION-FLOWS.md) and the related moderation requirement docs against one implementation surface.
- Prioritize post clearance, spam/OpenAI moderation, reports, community moderation, modlog attribution, appeals, ban evasion, penalties, and automated system users.
- Ensure moderation changes preserve audit trails, authorization boundaries, user privacy, and queue idempotency.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected moderation behavior.
