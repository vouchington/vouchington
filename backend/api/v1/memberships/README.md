# Memberships API

Membership feature flags gate frontend visibility only. Backend membership endpoints remain mounted
so web and native clients keep stable API contracts.

## Endpoints

### `GET /api/v1/memberships/plans`

**Auth**: Public

Returns active canonical products, their current deployment-specific provider mappings, and the
versioned benefit catalog. Provider prices are optional because a store may not expose one.

Response: `{ products: MembershipCatalogProduct[], benefit_catalog: MembershipBenefitCatalog }`

### `GET /api/v1/memberships/me`

**Auth**: Required

Returns the provider-neutral effective membership, retained source summaries with renewal and
revocation state, pending grants/switches/verifications/financial operations, and the provider-owned
management destination.

Response: `{ membership, sources, pending, management }`

### `POST /api/v1/membership-purchase-intents`

**Auth**: Required

Creates an idempotent purchase intent for a canonical product and a configured provider mapping.
The `membership-billing` Dynamic Config namespace independently gates each provider. Eligibility is
checked under the user's database lock before a launch payload is produced.

Body: `{ provider, product_id, idempotency_key }`

Response: `201 { purchase_intent: { id, provider, product_id, launch, replayed } }`; exact replay
returns `200`, even after the provider's new-purchase gate is disabled. A competing launch or direct
term returns `409` with `eligible_at` and the current provider-management destination.

### `POST /api/v1/membership-verifications`

**Auth**: Required

Persists bounded encrypted Apple, Google Play, or Microsoft evidence before durable enqueue. A
purchase-intent ID is optional so out-of-flow store purchases use the same verification pipeline.

Body: `{ provider, purchase_intent_id?, idempotency_key, evidence }`

Response: `202 { verification: { id, provider, status, reason_code, created_at } }`; exact replay
returns `200` and re-enqueues pending work.

### `GET /api/v1/membership-verifications/:verificationId`

**Auth**: Required owner

Returns the owner-scoped verification as `pending`, `verified`, `conflict`, or `rejected` with a
stable reason code. Evidence is never returned.

### `POST /api/v1/memberships/apple-app-store/notifications`

**Auth**: Apple-signed server-to-server payload

Verifies the signed notification and its nested signed transaction against the pinned Apple roots,
then stores encrypted evidence under the notification UUID before enqueueing reconciliation for the
immutable Apple transaction lineage. Duplicate notifications return success without a second
evidence record. The route never calls an Apple network API. Authoritative history/status reads and
recipient-specific family projection happen only in the membership worker.

### `POST /api/v1/memberships/billing-portal-sessions`

**Auth**: Required

Creates a Stripe Billing Portal session for managing an existing subscription.

Body: `{ return_url: string }`

Response: `{ portal_session: { url: string } }`

### `POST /api/v1/membership-grants`

**Auth**: Admins only

Grants a membership to a user without Stripe billing.

Body: `{ user_id: string, plan: string, sku_id: string, duration_days: number }`

Response: `201 { membership: { id: string } | null, grant: { id: string }, queued: boolean }`

### `DELETE /api/v1/membership-grants/:grantId`

**Auth**: Admins only

Idempotently revokes a queued or active administrator grant. Active revocation closes the current
activation period and automatically promotes the next eligible FIFO grant.

Body: `{ reason: string }`

Response: `204 No Content`

### `GET /api/v1/memberships/history/:userId`

**Auth**: Admins only

Returns the membership change audit log for a user.

Response: `{ changes: MembershipChange[] }`

### `GET /api/v1/memberships/refundable-charges`

**Auth**: Admins and customer support

Returns the list of refundable Stripe charges for a user's active subscription.

Query: `?user_id=<uuid>`

Response: `{ charges: RefundableCharge[] }` where each charge has `{ charge_id,
payment_intent_id, invoice_id, amount: { amount, currency }, amount_refunded: { amount, currency },
created_at, description }`.

Returns an empty array for members with admin-granted memberships (no Stripe subscription).

### `POST /api/v1/memberships/refunds`

**Auth**: Admins and customer support

Issues a Stripe refund against a membership charge and records it in the financial ledger.

Body: `{ user_id, charge_id?, payment_intent_id?, invoice_id, reason, idempotency_key, cancel?, amount?: { amount, currency }, note? }`

- `reason`: one of `'goodwill'`, `'requested'`, `'dispute'`, `'other'`
- `cancel`: if `true`, immediately cancels the Stripe subscription and revokes access (revoke mode); if `false` or omitted, keeps access active (goodwill mode)
- `amount`: positive partial refund money in the same currency as the charge; omit for the full
  remaining refundable amount
- `idempotency_key`: caller-generated UUID reused for an unchanged request until a response succeeds

Every caller must send `idempotency_key`; missing, null, non-string, and malformed values are
invalid. The OpenAPI request schema marks the field required.

If a refund succeeds but requested cancellation fails, the API still returns the persisted refund
receipt with `cancellation_status: 'pending'`. Retrying the unchanged request with the same key
resumes cancellation without a second refund.

Exact-key retries without a durable receipt are sent to Stripe only while the immutable request
intent is less than 23 hours old. From 23 hours onward, the endpoint returns `409` and requires
reconciliation because the request has reached the conservative provider idempotency horizon.
An active receiptless retry resolves and validates its durable intent before contacting Stripe, then
uses the intent's original membership and subscription even if a newer membership now exists. Only
a request with no durable intent selects the latest membership.

Response: `201 { refund: { id: string }, cancellation_status: 'not_requested' | 'completed' | 'pending' }`

## Performance

| Endpoint                                               | Round Trips | Caching                    | Notes                                                                              |
| ------------------------------------------------------ | ----------- | -------------------------- | ---------------------------------------------------------------------------------- |
| GET /api/v1/memberships/plans                          | 2           | HTTP: Cache-Control (anon) | Auth + deployment-context provider catalog lookup                                  |
| GET /api/v1/memberships/me                             | 6           | None                       | Auth + effective membership, source, and detailed pending-state reads              |
| POST /api/v1/membership-purchase-intents               | 5+          | None                       | Auth + locked mapping/eligibility claim + provider launch                          |
| POST /api/v1/membership-verifications                  | 4+          | None                       | Auth + transactional encrypted evidence/verification persistence + durable enqueue |
| GET /api/v1/membership-verifications/:id               | 2           | None                       | Auth + owner-scoped verification lookup                                            |
| POST /api/v1/memberships/apple-app-store/notifications | 4+          | None                       | Offline JWS verification + transactional evidence persistence + durable enqueue    |
| POST /api/v1/memberships/billing-portal-sessions       | 3           | None                       | Auth + membership lookup + Stripe portal session                                   |
| POST /api/v1/membership-grants                         | 3           | None                       | Auth + SKU lookup + grant                                                          |
| DELETE /api/v1/membership-grants/:grantId              | 3+          | None                       | Auth + grant lookup + revoke + optional queued grant activation                    |
| GET /api/v1/memberships/history/:userId                | 2           | None                       | Auth + history query                                                               |
| GET /api/v1/memberships/refundable-charges             | 3+          | None                       | Auth + membership lookup + Stripe invoice list                                     |
| POST /api/v1/memberships/refunds                       | 5+          | None                       | Auth + membership lookup + Stripe refund + optional Stripe cancel + DB write       |

## Related

- [Currency-aware integer money contract](../../../../docs/overview/architecture/monetary-values.md)

- Service: [../../../services/memberships/](../../../services/memberships/README.md)
- Stripe: [../../../services/stripe/](../../../services/stripe/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
