# Referral Links API

Manage referral links and their validation rules.

## Endpoints

### Referral Links

| Method | Route                                           | Authentication             | Description                                          |
| ------ | ----------------------------------------------- | -------------------------- | ---------------------------------------------------- |
| GET    | `/api/v1/referral-links`                        | Required                   | List referral links                                  |
| POST   | `/api/v1/referral-links`                        | Required                   | Create a referral link                               |
| PATCH  | `/api/v1/referral-links/:linkId`                | Required (owner)           | Update a referral link                               |
| DELETE | `/api/v1/referral-links/:linkId`                | Required (owner)           | Delete a referral link                               |
| POST   | `/api/v1/referral-links/:linkId/activations`    | Required (owner)           | Activate a referral link                             |
| DELETE | `/api/v1/referral-links/:linkId/activations`    | Required (owner)           | Deactivate a referral link                           |
| POST   | `/api/v1/referral-links/:linkId/unfurls`        | Required (owner, Plus/Pro) | Unfurl an Amex all-cards link into per-card children |
| GET    | `/api/v1/topics/:id/prioritized-referral-links` | Optional                   | Get prioritized links                                |

### Referral Link Validations

| Method | Route                                         | Authentication   | Description               |
| ------ | --------------------------------------------- | ---------------- | ------------------------- |
| GET    | `/api/v1/referral-link-validations`           | None             | List validations (public) |
| POST   | `/api/v1/referral-link-validations`           | Required (admin) | Create a validation       |
| GET    | `/api/v1/referral-link-validations/:idOrSlug` | None             | Get a validation (public) |
| PATCH  | `/api/v1/referral-link-validations/:idOrSlug` | Required (admin) | Update a validation       |
| DELETE | `/api/v1/referral-link-validations/:idOrSlug` | Required (admin) | Delete a validation       |

### Validation Rules

| Method | Route                                                           | Authentication   | Description                 |
| ------ | --------------------------------------------------------------- | ---------------- | --------------------------- |
| GET    | `/api/v1/referral-link-validations/:validationId/rules`         | None             | List rules for a validation |
| POST   | `/api/v1/referral-link-validations/:validationId/rules`         | Required (admin) | Create a rule               |
| PATCH  | `/api/v1/referral-link-validations/:validationId/rules/:ruleId` | Required (admin) | Update a rule               |
| DELETE | `/api/v1/referral-link-validations/:validationId/rules/:ruleId` | Required (admin) | Delete a rule               |

## POST /api/v1/referral-links

**Request:**

```json
{
  "referral_program_id": "<uuid>",
  "url": "https://example.com/ref/abc123",
  "user_id": "<uuid>",
  "label": "Optional label or null"
}
```

`user_id` is optional: omitted, `null`, and an empty string select the authenticated caller.
`label` and validation `user_help_text` accept `null` to clear their values. Authorization and
resource preflights occur before detailed request validation; see [Route Helpers](../../README.md#route-helpers).

## POST /api/v1/referral-link-validations/:validationId/rules

**Request:**

```json
{
  "hostname": "example.com",
  "pathname": "/ref/*",
  "is_referral_link_url": true,
  "is_invalid_referral_link_url": false,
  "user_error_text": null,
  "example_urls": ["https://example.com/ref/abc"]
}
```

## Performance

| Endpoint                                                             | Round Trips | Caching          | Notes                                                                                                             |
| -------------------------------------------------------------------- | ----------- | ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET /api/v1/referral-links                                           | 1           | None             | Auth + service query                                                                                              |
| POST /api/v1/referral-links                                          | 1           | None             | Write                                                                                                             |
| PATCH /api/v1/referral-links/:linkId                                 | 1           | None             | Write                                                                                                             |
| DELETE /api/v1/referral-links/:linkId                                | 1           | None             | Write                                                                                                             |
| POST /api/v1/referral-links/:linkId/activations                      | 1           | None             | Write                                                                                                             |
| DELETE /api/v1/referral-links/:linkId/activations                    | 1           | None             | Write                                                                                                             |
| POST /api/v1/referral-links/:linkId/unfurls                          | 2           | None             | Ownership + membership read, then a write; enqueues the async unfurl job                                          |
| GET /api/v1/topics/:id/prioritized-referral-links                    | 2           | HTTP: short anon | Service query with user profile hydration; authenticated requests remain uncached because ranking is personalized |
| GET /api/v1/referral-link-validations                                | 1           | None             | Public list                                                                                                       |
| POST /api/v1/referral-link-validations                               | 1           | None             | Admin write                                                                                                       |
| GET /api/v1/referral-link-validations/:idOrSlug                      | 1           | None             | Public read                                                                                                       |
| PATCH /api/v1/referral-link-validations/:idOrSlug                    | 1           | None             | Admin write                                                                                                       |
| DELETE /api/v1/referral-link-validations/:idOrSlug                   | 1           | None             | Admin write                                                                                                       |
| GET /api/v1/referral-link-validations/:validationId/rules            | 1           | None             | Public list                                                                                                       |
| POST /api/v1/referral-link-validations/:validationId/rules           | 1           | None             | Admin write                                                                                                       |
| PATCH /api/v1/referral-link-validations/:validationId/rules/:ruleId  | 1           | None             | Admin write                                                                                                       |
| DELETE /api/v1/referral-link-validations/:validationId/rules/:ruleId | 1           | None             | Admin write                                                                                                       |

## Related

- Service: [../../../services/user-referral-program-links/](../../../services/user-referral-program-links/README.md)
- Service: [../../../services/prioritized-referral-links/](../../../services/prioritized-referral-links/README.md)
- Service: [../../../services/attribution/](../../../services/attribution/README.md)
- Service: [../../../services/referral-link-unfurl/](../../../services/referral-link-unfurl/README.md)
- Parent: [../CLAUDE.md](../../CLAUDE.md)
