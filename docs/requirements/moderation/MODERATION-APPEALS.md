# Moderation Appeals

Any signed-in member can formally contest a community ban, warning, post removal, or platform
suspension. A separate, narrower flow covers legal disputes from verified topic claimants; see
[Review Disputes](./REVIEW-DISPUTES.md).

## Why a human always sends

An AI agent drafts a recommendation and a public response, but no automated or AI-generated text
ever reaches a party without a moderator explicitly approving and then triggering delivery.
Resolution (accept, reduce, deny) is only possible after the approved response has been delivered,
so an appeal cannot leave pending before the member has been answered. The service layer enforces
this and it is regression-tested. This is a legal and trust invariant, not a convenience.

## Why members see a redacted view

Members see only their own appeals, and the public response appears only after delivery. Staff
context, AI recommendations, internal drafts, and the original decision's internal reason are never
in a member response. The original decision is snapshotted when the appeal is created, so accepting
an appeal cannot rewrite its history.

## Policy

- Appeals are expected to be answered within a service-level window; staff lists flag overdue ones.
- Which decisions are appealable, and what recommended action they carry, comes from the
  moderation policy registry in `ts-shared/utils/moderation-policy.mts`.
- A suspension appeal can only be accepted by an administrator, not a moderator.
- Community and platform removals of the same post are distinct appeal targets.
- Delivery failure is ambiguous (the notification can succeed before the response is lost), so
  clients refresh from the server rather than assume nothing was sent.
- Web, Swift, and .NET share the executable `moderation-appeal-lifecycle` scenarios in
  [`api-fixtures/v1/lifecycle-scenarios.json`](../../../api-fixtures/v1/lifecycle-scenarios.json).
