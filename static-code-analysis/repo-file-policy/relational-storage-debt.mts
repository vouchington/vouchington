// Shrink-only prelaunch debt. The acceptance check rejects any key that is not already on
// origin/main. Remove a key only after that column no longer has the defect. Do not add keys.
//
// JSON documents are not debt. Structured documents, data points, and change history stay JSON.
// An entity id inside a document still needs its own foreign-key column; this inventory cannot
// see inside JSON. What remains: UUID arrays (#820), the two admission ids (#823), and the
// membership user-id columns. Token, cursor, protocol, and audit snapshot ids are reviewed in the
// catalog instead; see the schema rules.
export const EXISTING_RELATIONAL_STORAGE_DEBT = {
  json: new Set<string>(),
  uuidArray: new Set([
    // #820
    'post_category_finalizations.actor_user_ids',
    'post_category_finalizations.admission_response_topic_ids',
    'review_successions.topic_ids',
  ]),
  missingForeignKey: new Set([
    'membership_administrator_refund_operation_requests.issued_by_id',
    'membership_changes.changed_by_id',
    'membership_changes.user_id',
    'membership_grants.granted_by_id',
    'membership_grants.revoked_by_id',
    'membership_refunds.issued_by_id',
    'membership_refunds.user_id',
    'membership_sources.user_id',
    // #823
    'post_admission_quota_consumptions.reservation_id',
    'post_admission_reservations.committed_post_id',
  ]),
  encodedReference: new Set<string>(),
}
