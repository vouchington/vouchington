# User Warnings

User warnings let moderators record a formal warning without removing the user or content.

## Scope

- Table: `user_warnings`
- Services: `backend/services/user-warnings/`
- Audit: `moderator_actions` action type `warn`

## Behavior

- Warnings can be global or tied to a community/report where the service supports that context.
- A warning may include a public message visible to the warned user.
- Report linkage keeps the warning connected to the moderation queue item that prompted it.
- Member warning responses expose revocation state through `revoked_at`, but the revoking staff
  identity remains internal and is available only through staff warning responses.

## Roles

| Role                      | Can warn                       |
| ------------------------- | ------------------------------ |
| Community owner/moderator | Users in their community scope |
| Moderator                 | Global report scope            |
| Administrator             | Global scope                   |

Warnings do not automatically change trust tier, vote weight, or account status.

See also: [Reporting](./REPORTING.md), [Modlog](./MODLOG.md).
