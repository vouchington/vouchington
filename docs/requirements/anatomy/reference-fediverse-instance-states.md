# Fediverse Instance Anatomy reference

[Back to Fediverse Instance Anatomy](fediverse-instance.md)

## States

| State    | Condition                         | Behavior                                                             |
| -------- | --------------------------------- | -------------------------------------------------------------------- |
| Pending  | `integration_status = 'pending'`  | Default state for a newly classified instance; awaiting admin review |
| Approved | `integration_status = 'approved'` | Admin has allowlisted this instance for integration                  |
| Blocked  | `integration_status = 'blocked'`  | Admin has rejected this instance                                     |

`integration_status` is advisory in Phase B — it does not gate any outbound federation behavior
until Phase C's outbound integration exists.

Fediverse instances also inherit topic lifecycle states (Active / Merged / Soft-deleted); see
[topic.md](./topic.md#states).
