Review notifications. Pick at most one concrete, bounded improvement that is safe to ship in one PR.

- Check [Notifications](../../requirements/navigation/NOTIFICATIONS.md) against one inbox, subscription, reconciliation, manual-send, or browser-push path.
- Prioritize dedupe, read/delete behavior, invalid entity cleanup, moderation privacy, fanout chunking, and unsubscribe semantics.
- Keep user-visible notification copy and privacy expectations aligned with the requirements docs.
- Skip findings already covered by open issues or open PRs.
- Add or tighten tests for the selected notification behavior.
