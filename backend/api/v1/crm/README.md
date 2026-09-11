# CRM Public API

Public, unauthenticated endpoints for CRM contacts. Distinct from the staff-only CRM management
endpoints under [`../admin/crm/README.md`](../admin/crm/README.md).

## Endpoints

### `POST /api/v1/crm/unsubscribe`

**Auth**: none (public one-click unsubscribe, RFC 8058)

Decrypts the `token` (body or query param), resolves the contact email, and opts the contact out
of CRM outreach emails. Silently no-ops for an unknown or already-opted-out email so the response
never leaks contact existence. Returns `{ ok: true }` on any well-formed token; returns 400 for a
missing, invalid, or tampered token.

Linked from `List-Unsubscribe` / `List-Unsubscribe-Post` headers set by
[`createCrmListUnsubscribeHeaders`](../../../services/crm-contacts/unsubscribe.mts) and from the
landing page at `web/app/crm/unsubscribe`.

## Performance

| Endpoint                     | Round Trips | Caching | Notes                                            |
| ---------------------------- | ----------- | ------- | ------------------------------------------------ |
| POST /api/v1/crm/unsubscribe | 1           | None    | Single conditional CTE update, no-op if no match |

## Related

- CRM contacts service: [../../../services/crm-contacts/README.md](../../../services/crm-contacts/README.md)
- Staff CRM API: [../admin/crm/README.md](../admin/crm/README.md)
