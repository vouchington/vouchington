-- EU and UK copyright contracts. These tables store receipt, routing, reason,
-- review, redress, escalation, and reporting facts. They do not store US restoration
-- clocks, placement keys, or lifecycle metadata. No policy row is seeded: the
-- contracts stay unavailable until a separate approval exists.

CREATE TABLE IF NOT EXISTS copyright_territorial_policy_approvals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction text NOT NULL,
  policy_version text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_territorial_policy_approvals__version UNIQUE (jurisdiction, policy_version),
  CONSTRAINT chk_copyright_territorial_policy_approvals__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_policy_approvals__version CHECK (
    policy_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  )
);

CREATE TABLE IF NOT EXISTS copyright_territorial_policy_withdrawals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_territorial_policy_approval_id uuid NOT NULL UNIQUE
    REFERENCES copyright_territorial_policy_approvals (id) ON DELETE RESTRICT,
  withdrawn_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS copyright_eu_notice_receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE,
  copyright_territorial_policy_approval_id uuid NOT NULL
    REFERENCES copyright_territorial_policy_approvals (id) ON DELETE RESTRICT,
  requester_user_id uuid,
  idempotency_key text NOT NULL,
  request_sha256 bytea NOT NULL,
  hosted_use_url text NOT NULL,
  grounds_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_eu_notice_receipts__idempotency UNIQUE (requester_user_id, idempotency_key),
  CONSTRAINT chk_copyright_eu_notice_receipts__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_eu_notice_receipts__sha CHECK (octet_length(request_sha256) = 32),
  CONSTRAINT chk_copyright_eu_notice_receipts__url CHECK (char_length(hosted_use_url) BETWEEN 1 AND 2048),
  CONSTRAINT chk_copyright_eu_notice_receipts__grounds CHECK (
    char_length(grounds_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_notice_routings (
  copyright_eu_notice_receipt_id uuid PRIMARY KEY
    REFERENCES copyright_eu_notice_receipts (id) ON DELETE RESTRICT,
  destination text NOT NULL,
  routed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_notice_routings__destination CHECK (destination = 'staff_queue')
);

CREATE TABLE IF NOT EXISTS copyright_eu_notice_acknowledgments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_eu_notice_receipt_id uuid NOT NULL UNIQUE
    REFERENCES copyright_eu_notice_receipts (id) ON DELETE RESTRICT,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  acknowledged_at timestamptz,
  exhausted_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_notice_acknowledgments__attempts CHECK (attempt_count BETWEEN 0 AND 5),
  CONSTRAINT chk_copyright_eu_notice_acknowledgments__attempt_time CHECK (
    (attempt_count = 0) = (last_attempt_at IS NULL)
  ),
  CONSTRAINT chk_copyright_eu_notice_acknowledgments__terminal CHECK (
    acknowledged_at IS NULL OR exhausted_at IS NULL
  ),
  CONSTRAINT chk_copyright_eu_notice_acknowledgments__exhaustion CHECK (
    exhausted_at IS NULL OR attempt_count = 5
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_statements_of_reasons (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  automation_disclosure text NOT NULL,
  statement_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_statements_of_reasons__human CHECK (automation_disclosure = 'human'),
  CONSTRAINT chk_copyright_eu_statements_of_reasons__statement CHECK (
    char_length(statement_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_redress_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE,
  copyright_eu_statement_of_reasons_id uuid NOT NULL
    REFERENCES copyright_eu_statements_of_reasons (id) ON DELETE RESTRICT,
  submitted_by_user_id uuid,
  idempotency_key text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_eu_redress_requests__idempotency UNIQUE (submitted_by_user_id, idempotency_key),
  CONSTRAINT chk_copyright_eu_redress_requests__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_eu_redress_requests__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_redress_decisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_eu_redress_request_id uuid NOT NULL UNIQUE
    REFERENCES copyright_eu_redress_requests (id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  staff_disposition text NOT NULL,
  rationale_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_redress_decisions__disposition CHECK (
    staff_disposition IN ('maintain', 'revoke')
  ),
  CONSTRAINT chk_copyright_eu_redress_decisions__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_supervised_complaints (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  recorded_by_id uuid,
  authority_reference text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_eu_supervised_complaints__reference UNIQUE (copyright_notice_id, authority_reference),
  CONSTRAINT chk_copyright_eu_supervised_complaints__reference CHECK (
    char_length(authority_reference) BETWEEN 1 AND 200
  ),
  CONSTRAINT chk_copyright_eu_supervised_complaints__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_escalations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  copyright_eu_notice_acknowledgment_id uuid UNIQUE
    REFERENCES copyright_eu_notice_acknowledgments (id) ON DELETE RESTRICT,
  copyright_eu_supervised_complaint_id uuid UNIQUE
    REFERENCES copyright_eu_supervised_complaints (id) ON DELETE RESTRICT,
  escalated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_escalations__source CHECK (
    num_nonnulls(
      copyright_eu_notice_acknowledgment_id,
      copyright_eu_supervised_complaint_id
    ) = 1
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_transparency_reports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_territorial_policy_approval_id uuid NOT NULL
    REFERENCES copyright_territorial_policy_approvals (id) ON DELETE RESTRICT,
  period_started_at timestamptz NOT NULL,
  period_ended_at timestamptz NOT NULL,
  receipt_count integer NOT NULL,
  statement_of_reasons_count integer NOT NULL,
  redress_request_count integer NOT NULL,
  redress_decision_count integer NOT NULL,
  supervised_complaint_count integer NOT NULL,
  escalation_count integer NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reported_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_eu_transparency_reports__period CHECK (period_started_at < period_ended_at),
  CONSTRAINT chk_copyright_eu_transparency_reports__counts CHECK (
    receipt_count >= 0
    AND statement_of_reasons_count >= 0
    AND redress_request_count >= 0
    AND redress_decision_count >= 0
    AND supervised_complaint_count >= 0
    AND escalation_count >= 0
  )
);

CREATE TABLE IF NOT EXISTS copyright_uk_notice_receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE,
  copyright_territorial_policy_approval_id uuid NOT NULL
    REFERENCES copyright_territorial_policy_approvals (id) ON DELETE RESTRICT,
  requester_user_id uuid,
  idempotency_key text NOT NULL,
  request_sha256 bytea NOT NULL,
  hosted_use_url text NOT NULL,
  grounds_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_uk_notice_receipts__idempotency UNIQUE (requester_user_id, idempotency_key),
  CONSTRAINT chk_copyright_uk_notice_receipts__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_uk_notice_receipts__sha CHECK (octet_length(request_sha256) = 32),
  CONSTRAINT chk_copyright_uk_notice_receipts__url CHECK (char_length(hosted_use_url) BETWEEN 1 AND 2048),
  CONSTRAINT chk_copyright_uk_notice_receipts__grounds CHECK (
    char_length(grounds_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_uk_notice_routings (
  copyright_uk_notice_receipt_id uuid PRIMARY KEY
    REFERENCES copyright_uk_notice_receipts (id) ON DELETE RESTRICT,
  destination text NOT NULL,
  routed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_uk_notice_routings__destination CHECK (destination = 'staff_queue')
);

CREATE TABLE IF NOT EXISTS copyright_uk_notice_acknowledgments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_uk_notice_receipt_id uuid NOT NULL UNIQUE
    REFERENCES copyright_uk_notice_receipts (id) ON DELETE RESTRICT,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  acknowledged_at timestamptz,
  exhausted_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_uk_notice_acknowledgments__attempts CHECK (attempt_count BETWEEN 0 AND 5),
  CONSTRAINT chk_copyright_uk_notice_acknowledgments__attempt_time CHECK (
    (attempt_count = 0) = (last_attempt_at IS NULL)
  ),
  CONSTRAINT chk_copyright_uk_notice_acknowledgments__terminal CHECK (
    acknowledged_at IS NULL OR exhausted_at IS NULL
  ),
  CONSTRAINT chk_copyright_uk_notice_acknowledgments__exhaustion CHECK (
    exhausted_at IS NULL OR attempt_count = 5
  )
);

CREATE TABLE IF NOT EXISTS copyright_uk_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE,
  reviewed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by_id uuid,
  automation_disclosure text NOT NULL,
  rationale_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_uk_reviews__human CHECK (automation_disclosure = 'human'),
  CONSTRAINT chk_copyright_uk_reviews__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_uk_redress_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL UNIQUE,
  copyright_uk_review_id uuid NOT NULL REFERENCES copyright_uk_reviews (id) ON DELETE RESTRICT,
  submitted_by_user_id uuid,
  idempotency_key text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_uk_redress_requests__idempotency UNIQUE (submitted_by_user_id, idempotency_key),
  CONSTRAINT chk_copyright_uk_redress_requests__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_uk_redress_requests__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_uk_redress_decisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_uk_redress_request_id uuid NOT NULL UNIQUE
    REFERENCES copyright_uk_redress_requests (id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  staff_disposition text NOT NULL,
  rationale_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_uk_redress_decisions__disposition CHECK (
    staff_disposition IN ('maintain', 'revoke')
  ),
  CONSTRAINT chk_copyright_uk_redress_decisions__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_uk_escalations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  copyright_uk_notice_acknowledgment_id uuid NOT NULL UNIQUE
    REFERENCES copyright_uk_notice_acknowledgments (id) ON DELETE RESTRICT,
  escalated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE copyright_territorial_policy_approvals IS
  'Operator approval that makes one EU or UK copyright contract applicable. Absence or withdrawal fails closed.';
COMMENT ON COLUMN copyright_territorial_policy_approvals.jurisdiction IS
  'Contract family this approval activates: eu_dsa or uk.';
COMMENT ON COLUMN copyright_territorial_policy_approvals.policy_version IS
  'Identifier of the approved contract text. Unique per jurisdiction.';
COMMENT ON COLUMN copyright_territorial_policy_approvals.approved_at IS
  'When an operator approved this policy version.';
COMMENT ON COLUMN copyright_territorial_policy_approvals.approved_by_id IS
  'Operator who approved this policy version. Null after that account is deleted.';

COMMENT ON TABLE copyright_territorial_policy_withdrawals IS
  'Withdrawal of one territorial policy approval. A withdrawn approval fails closed.';
COMMENT ON COLUMN copyright_territorial_policy_withdrawals.copyright_territorial_policy_approval_id IS
  'Approval this withdrawal retires. One withdrawal per approval.';
COMMENT ON COLUMN copyright_territorial_policy_withdrawals.withdrawn_at IS
  'When an operator withdrew the approval.';
COMMENT ON COLUMN copyright_territorial_policy_withdrawals.withdrawn_by_id IS
  'Operator who withdrew the approval. Null after that account is deleted.';

COMMENT ON TABLE copyright_eu_notice_receipts IS
  'EU notice receipt. Administrative facts only; no US restoration clock and no merits decision.';
COMMENT ON COLUMN copyright_eu_notice_receipts.copyright_notice_id IS
  'EU copyright notice this receipt records. One receipt per notice.';
COMMENT ON COLUMN copyright_eu_notice_receipts.copyright_territorial_policy_approval_id IS
  'Unwithdrawn eu_dsa policy approval that made this receipt acceptable.';
COMMENT ON COLUMN copyright_eu_notice_receipts.requester_user_id IS
  'Signed-in requester. Null for a guest or after account deletion.';
COMMENT ON COLUMN copyright_eu_notice_receipts.idempotency_key IS
  'Caller idempotency key, unique together with requester_user_id.';
COMMENT ON COLUMN copyright_eu_notice_receipts.request_sha256 IS
  'SHA-256 digest of the received request.';
COMMENT ON COLUMN copyright_eu_notice_receipts.hosted_use_url IS
  'URL of the hosted use identified in the notice.';
COMMENT ON COLUMN copyright_eu_notice_receipts.grounds_ciphertext IS
  'Encrypted grounds supplied with the notice. The system does not decide merits.';
COMMENT ON COLUMN copyright_eu_notice_receipts.received_at IS
  'When Voucha stored this EU notice receipt.';

COMMENT ON TABLE copyright_eu_notice_routings IS
  'Staff-queue routing for one EU notice receipt. Routing is administrative, not a merits decision.';
COMMENT ON COLUMN copyright_eu_notice_routings.copyright_eu_notice_receipt_id IS
  'EU receipt this routing belongs to. One routing per receipt.';
COMMENT ON COLUMN copyright_eu_notice_routings.destination IS
  'Queue that received the notice. Constrained to staff_queue.';
COMMENT ON COLUMN copyright_eu_notice_routings.routed_at IS
  'When the receipt was routed to the staff queue.';

COMMENT ON TABLE copyright_eu_notice_acknowledgments IS
  'Acknowledgment attempts for one EU notice receipt. There is no statutory due time.';
COMMENT ON COLUMN copyright_eu_notice_acknowledgments.copyright_eu_notice_receipt_id IS
  'EU receipt this acknowledgment obligation belongs to. One row per receipt.';
COMMENT ON COLUMN copyright_eu_notice_acknowledgments.attempt_count IS
  'How many acknowledgment attempts have been recorded, from 0 through 5.';
COMMENT ON COLUMN copyright_eu_notice_acknowledgments.last_attempt_at IS
  'When the latest acknowledgment attempt was recorded. Null when attempt_count is 0.';
COMMENT ON COLUMN copyright_eu_notice_acknowledgments.acknowledged_at IS
  'When acknowledgment succeeded. Mutually exclusive with exhausted_at.';
COMMENT ON COLUMN copyright_eu_notice_acknowledgments.exhausted_at IS
  'When the fifth attempt failed and the obligation was exhausted.';

COMMENT ON TABLE copyright_eu_statements_of_reasons IS
  'Staff-supplied EU statement of reasons. automation_disclosure is human because the system does not decide merits.';
COMMENT ON COLUMN copyright_eu_statements_of_reasons.copyright_notice_id IS
  'EU notice this statement explains. One statement per notice.';
COMMENT ON COLUMN copyright_eu_statements_of_reasons.decided_at IS
  'When staff recorded the statement of reasons.';
COMMENT ON COLUMN copyright_eu_statements_of_reasons.decided_by_id IS
  'Staff user who recorded the statement. Null after that account is deleted.';
COMMENT ON COLUMN copyright_eu_statements_of_reasons.automation_disclosure IS
  'How the statement was produced. Constrained to human.';
COMMENT ON COLUMN copyright_eu_statements_of_reasons.statement_ciphertext IS
  'Encrypted staff-supplied statement. The system does not choose the text.';

COMMENT ON TABLE copyright_eu_redress_requests IS
  'Participant redress against one EU statement of reasons. One request per notice.';
COMMENT ON COLUMN copyright_eu_redress_requests.copyright_notice_id IS
  'EU notice this redress request challenges. Must match the cited statement.';
COMMENT ON COLUMN copyright_eu_redress_requests.copyright_eu_statement_of_reasons_id IS
  'Statement of reasons this redress request cites, on the same notice.';
COMMENT ON COLUMN copyright_eu_redress_requests.submitted_by_user_id IS
  'Participant who submitted the redress request. Null after account deletion.';
COMMENT ON COLUMN copyright_eu_redress_requests.idempotency_key IS
  'Caller idempotency key, unique together with submitted_by_user_id.';
COMMENT ON COLUMN copyright_eu_redress_requests.explanation_ciphertext IS
  'Encrypted explanation supplied by the participant.';
COMMENT ON COLUMN copyright_eu_redress_requests.received_at IS
  'When Voucha stored this redress request.';

COMMENT ON TABLE copyright_eu_redress_decisions IS
  'Staff disposition of one EU redress request. The system does not choose the rationale.';
COMMENT ON COLUMN copyright_eu_redress_decisions.copyright_eu_redress_request_id IS
  'Redress request this decision closes. One decision per request.';
COMMENT ON COLUMN copyright_eu_redress_decisions.decided_at IS
  'When staff recorded the redress decision.';
COMMENT ON COLUMN copyright_eu_redress_decisions.decided_by_id IS
  'Staff user who recorded the decision. Null after that account is deleted.';
COMMENT ON COLUMN copyright_eu_redress_decisions.staff_disposition IS
  'Staff outcome: maintain or revoke. The system does not choose it.';
COMMENT ON COLUMN copyright_eu_redress_decisions.rationale_ciphertext IS
  'Encrypted staff-supplied rationale for the disposition.';

COMMENT ON TABLE copyright_eu_supervised_complaints IS
  'Supervised complaint recorded against an EU notice. Recording it can escalate the notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.copyright_notice_id IS
  'EU notice this supervised complaint concerns.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.recorded_by_id IS
  'Staff user who recorded the complaint. Null after that account is deleted.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.authority_reference IS
  'Authority reference for this complaint. Unique per notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.explanation_ciphertext IS
  'Encrypted explanation of the supervised complaint.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.received_at IS
  'When Voucha stored this supervised complaint.';

COMMENT ON TABLE copyright_eu_escalations IS
  'Escalation of one EU notice from either an exhausted acknowledgment or a supervised complaint.';
COMMENT ON COLUMN copyright_eu_escalations.copyright_notice_id IS
  'EU notice this escalation belongs to.';
COMMENT ON COLUMN copyright_eu_escalations.copyright_eu_notice_acknowledgment_id IS
  'Exhausted acknowledgment that caused this escalation. Exactly one source is set.';
COMMENT ON COLUMN copyright_eu_escalations.copyright_eu_supervised_complaint_id IS
  'Supervised complaint that caused this escalation. Exactly one source is set.';
COMMENT ON COLUMN copyright_eu_escalations.escalated_at IS
  'When the escalation was recorded.';

COMMENT ON TABLE copyright_eu_transparency_reports IS
  'Counts of stored EU copyright facts for a caller-supplied period. The period is not a statutory clock.';
COMMENT ON COLUMN copyright_eu_transparency_reports.copyright_territorial_policy_approval_id IS
  'eu_dsa policy approval this report was produced under.';
COMMENT ON COLUMN copyright_eu_transparency_reports.period_started_at IS
  'Start of the caller-supplied reporting period. Not a statutory clock.';
COMMENT ON COLUMN copyright_eu_transparency_reports.period_ended_at IS
  'End of the caller-supplied reporting period. Must be after period_started_at.';
COMMENT ON COLUMN copyright_eu_transparency_reports.receipt_count IS
  'Count of stored EU notice receipts in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.statement_of_reasons_count IS
  'Count of stored EU statements of reasons in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.redress_request_count IS
  'Count of stored EU redress requests in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.redress_decision_count IS
  'Count of stored EU redress decisions in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.supervised_complaint_count IS
  'Count of stored EU supervised complaints in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.escalation_count IS
  'Count of stored EU escalations in the period.';
COMMENT ON COLUMN copyright_eu_transparency_reports.reported_at IS
  'When this transparency report was recorded.';
COMMENT ON COLUMN copyright_eu_transparency_reports.reported_by_id IS
  'User who recorded the report. Null after that account is deleted.';

COMMENT ON TABLE copyright_uk_notice_receipts IS
  'UK notice receipt. Administrative facts only; no US restoration clock and no merits decision.';
COMMENT ON COLUMN copyright_uk_notice_receipts.copyright_notice_id IS
  'UK copyright notice this receipt records. One receipt per notice.';
COMMENT ON COLUMN copyright_uk_notice_receipts.copyright_territorial_policy_approval_id IS
  'Unwithdrawn uk policy approval that made this receipt acceptable.';
COMMENT ON COLUMN copyright_uk_notice_receipts.requester_user_id IS
  'Signed-in requester. Null for a guest or after account deletion.';
COMMENT ON COLUMN copyright_uk_notice_receipts.idempotency_key IS
  'Caller idempotency key, unique together with requester_user_id.';
COMMENT ON COLUMN copyright_uk_notice_receipts.request_sha256 IS
  'SHA-256 digest of the received request.';
COMMENT ON COLUMN copyright_uk_notice_receipts.hosted_use_url IS
  'URL of the hosted use identified in the notice.';
COMMENT ON COLUMN copyright_uk_notice_receipts.grounds_ciphertext IS
  'Encrypted grounds supplied with the notice. The system does not decide merits.';
COMMENT ON COLUMN copyright_uk_notice_receipts.received_at IS
  'When Voucha stored this UK notice receipt.';

COMMENT ON TABLE copyright_uk_notice_routings IS
  'Staff-queue routing for one UK notice receipt. Routing is administrative, not a merits decision.';
COMMENT ON COLUMN copyright_uk_notice_routings.copyright_uk_notice_receipt_id IS
  'UK receipt this routing belongs to. One routing per receipt.';
COMMENT ON COLUMN copyright_uk_notice_routings.destination IS
  'Queue that received the notice. Constrained to staff_queue.';
COMMENT ON COLUMN copyright_uk_notice_routings.routed_at IS
  'When the receipt was routed to the staff queue.';

COMMENT ON TABLE copyright_uk_notice_acknowledgments IS
  'Acknowledgment attempts for one UK notice receipt. There is no statutory due time.';
COMMENT ON COLUMN copyright_uk_notice_acknowledgments.copyright_uk_notice_receipt_id IS
  'UK receipt this acknowledgment obligation belongs to. One row per receipt.';
COMMENT ON COLUMN copyright_uk_notice_acknowledgments.attempt_count IS
  'How many acknowledgment attempts have been recorded, from 0 through 5.';
COMMENT ON COLUMN copyright_uk_notice_acknowledgments.last_attempt_at IS
  'When the latest acknowledgment attempt was recorded. Null when attempt_count is 0.';
COMMENT ON COLUMN copyright_uk_notice_acknowledgments.acknowledged_at IS
  'When acknowledgment succeeded. Mutually exclusive with exhausted_at.';
COMMENT ON COLUMN copyright_uk_notice_acknowledgments.exhausted_at IS
  'When the fifth attempt failed and the obligation was exhausted.';

COMMENT ON TABLE copyright_uk_reviews IS
  'Staff-supplied UK copyright review. The system does not choose the rationale.';
COMMENT ON COLUMN copyright_uk_reviews.copyright_notice_id IS
  'UK notice this review explains. One review per notice.';
COMMENT ON COLUMN copyright_uk_reviews.reviewed_at IS
  'When staff recorded the review.';
COMMENT ON COLUMN copyright_uk_reviews.reviewed_by_id IS
  'Staff user who recorded the review. Null after that account is deleted.';
COMMENT ON COLUMN copyright_uk_reviews.automation_disclosure IS
  'How the review was produced. Constrained to human.';
COMMENT ON COLUMN copyright_uk_reviews.rationale_ciphertext IS
  'Encrypted staff-supplied rationale. The system does not choose the text.';

COMMENT ON TABLE copyright_uk_redress_requests IS
  'Participant redress against one UK review. One request per notice.';
COMMENT ON COLUMN copyright_uk_redress_requests.copyright_notice_id IS
  'UK notice this redress request challenges. Must match the cited review.';
COMMENT ON COLUMN copyright_uk_redress_requests.copyright_uk_review_id IS
  'UK review this redress request cites, on the same notice.';
COMMENT ON COLUMN copyright_uk_redress_requests.submitted_by_user_id IS
  'Participant who submitted the redress request. Null after account deletion.';
COMMENT ON COLUMN copyright_uk_redress_requests.idempotency_key IS
  'Caller idempotency key, unique together with submitted_by_user_id.';
COMMENT ON COLUMN copyright_uk_redress_requests.explanation_ciphertext IS
  'Encrypted explanation supplied by the participant.';
COMMENT ON COLUMN copyright_uk_redress_requests.received_at IS
  'When Voucha stored this redress request.';

COMMENT ON TABLE copyright_uk_redress_decisions IS
  'Staff disposition of one UK redress request. The system does not choose the rationale.';
COMMENT ON COLUMN copyright_uk_redress_decisions.copyright_uk_redress_request_id IS
  'Redress request this decision closes. One decision per request.';
COMMENT ON COLUMN copyright_uk_redress_decisions.decided_at IS
  'When staff recorded the redress decision.';
COMMENT ON COLUMN copyright_uk_redress_decisions.decided_by_id IS
  'Staff user who recorded the decision. Null after that account is deleted.';
COMMENT ON COLUMN copyright_uk_redress_decisions.staff_disposition IS
  'Staff outcome: maintain or revoke. The system does not choose it.';
COMMENT ON COLUMN copyright_uk_redress_decisions.rationale_ciphertext IS
  'Encrypted staff-supplied rationale for the disposition.';

COMMENT ON TABLE copyright_uk_escalations IS
  'Escalation of one UK notice from an exhausted acknowledgment.';
COMMENT ON COLUMN copyright_uk_escalations.copyright_notice_id IS
  'UK notice this escalation belongs to.';
COMMENT ON COLUMN copyright_uk_escalations.copyright_uk_notice_acknowledgment_id IS
  'Exhausted acknowledgment that caused this escalation, on the same notice.';
COMMENT ON COLUMN copyright_uk_escalations.escalated_at IS
  'When the escalation was recorded.';

ALTER TABLE copyright_territorial_policy_approvals
  ADD CONSTRAINT fk_copyright_territorial_policy_approvals__approved_by
  FOREIGN KEY (approved_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_territorial_policy_approvals
  VALIDATE CONSTRAINT fk_copyright_territorial_policy_approvals__approved_by;

ALTER TABLE copyright_territorial_policy_withdrawals
  ADD CONSTRAINT fk_copyright_territorial_policy_withdrawals__withdrawn_by
  FOREIGN KEY (withdrawn_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_territorial_policy_withdrawals
  VALIDATE CONSTRAINT fk_copyright_territorial_policy_withdrawals__withdrawn_by;

ALTER TABLE copyright_eu_notice_receipts
  ADD CONSTRAINT fk_copyright_eu_notice_receipts__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_eu_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_eu_notice_receipts__notice;
ALTER TABLE copyright_eu_notice_receipts
  ADD CONSTRAINT fk_copyright_eu_notice_receipts__requester
  FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_eu_notice_receipts__requester;

ALTER TABLE copyright_eu_statements_of_reasons
  ADD CONSTRAINT fk_copyright_eu_statements_of_reasons__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_eu_statements_of_reasons
  VALIDATE CONSTRAINT fk_copyright_eu_statements_of_reasons__notice;
ALTER TABLE copyright_eu_statements_of_reasons
  ADD CONSTRAINT fk_copyright_eu_statements_of_reasons__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_statements_of_reasons
  VALIDATE CONSTRAINT fk_copyright_eu_statements_of_reasons__decided_by;

ALTER TABLE copyright_eu_redress_requests
  ADD CONSTRAINT fk_copyright_eu_redress_requests__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_eu_redress_requests
  VALIDATE CONSTRAINT fk_copyright_eu_redress_requests__notice;
ALTER TABLE copyright_eu_redress_requests
  ADD CONSTRAINT fk_copyright_eu_redress_requests__submitter
  FOREIGN KEY (submitted_by_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_redress_requests
  VALIDATE CONSTRAINT fk_copyright_eu_redress_requests__submitter;

ALTER TABLE copyright_eu_redress_decisions
  ADD CONSTRAINT fk_copyright_eu_redress_decisions__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_redress_decisions
  VALIDATE CONSTRAINT fk_copyright_eu_redress_decisions__decided_by;

ALTER TABLE copyright_eu_supervised_complaints
  ADD CONSTRAINT fk_copyright_eu_supervised_complaints__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_eu_supervised_complaints
  VALIDATE CONSTRAINT fk_copyright_eu_supervised_complaints__notice;
ALTER TABLE copyright_eu_supervised_complaints
  ADD CONSTRAINT fk_copyright_eu_supervised_complaints__recorded_by
  FOREIGN KEY (recorded_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_supervised_complaints
  VALIDATE CONSTRAINT fk_copyright_eu_supervised_complaints__recorded_by;

ALTER TABLE copyright_eu_escalations
  ADD CONSTRAINT fk_copyright_eu_escalations__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_eu_escalations
  VALIDATE CONSTRAINT fk_copyright_eu_escalations__notice;

ALTER TABLE copyright_eu_transparency_reports
  ADD CONSTRAINT fk_copyright_eu_transparency_reports__reported_by
  FOREIGN KEY (reported_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_transparency_reports
  VALIDATE CONSTRAINT fk_copyright_eu_transparency_reports__reported_by;

ALTER TABLE copyright_uk_notice_receipts
  ADD CONSTRAINT fk_copyright_uk_notice_receipts__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_uk_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_uk_notice_receipts__notice;
ALTER TABLE copyright_uk_notice_receipts
  ADD CONSTRAINT fk_copyright_uk_notice_receipts__requester
  FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_uk_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_uk_notice_receipts__requester;

ALTER TABLE copyright_uk_reviews
  ADD CONSTRAINT fk_copyright_uk_reviews__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_uk_reviews
  VALIDATE CONSTRAINT fk_copyright_uk_reviews__notice;
ALTER TABLE copyright_uk_reviews
  ADD CONSTRAINT fk_copyright_uk_reviews__reviewed_by
  FOREIGN KEY (reviewed_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_uk_reviews
  VALIDATE CONSTRAINT fk_copyright_uk_reviews__reviewed_by;

ALTER TABLE copyright_uk_redress_requests
  ADD CONSTRAINT fk_copyright_uk_redress_requests__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_uk_redress_requests
  VALIDATE CONSTRAINT fk_copyright_uk_redress_requests__notice;
ALTER TABLE copyright_uk_redress_requests
  ADD CONSTRAINT fk_copyright_uk_redress_requests__submitter
  FOREIGN KEY (submitted_by_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_uk_redress_requests
  VALIDATE CONSTRAINT fk_copyright_uk_redress_requests__submitter;

ALTER TABLE copyright_uk_redress_decisions
  ADD CONSTRAINT fk_copyright_uk_redress_decisions__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_uk_redress_decisions
  VALIDATE CONSTRAINT fk_copyright_uk_redress_decisions__decided_by;

ALTER TABLE copyright_uk_escalations
  ADD CONSTRAINT fk_copyright_uk_escalations__notice
  FOREIGN KEY (copyright_notice_id) REFERENCES copyright_notices (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_uk_escalations
  VALIDATE CONSTRAINT fk_copyright_uk_escalations__notice;

CREATE INDEX IF NOT EXISTS idx_copyright_territorial_policy_approvals__approved_by
  ON copyright_territorial_policy_approvals (approved_by_id) WHERE approved_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_policy_withdrawals__withdrawn_by
  ON copyright_territorial_policy_withdrawals (withdrawn_by_id) WHERE withdrawn_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_notice_receipts__policy
  ON copyright_eu_notice_receipts (copyright_territorial_policy_approval_id);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_notice_receipts__requester
  ON copyright_eu_notice_receipts (requester_user_id) WHERE requester_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_statements_of_reasons__decided_by
  ON copyright_eu_statements_of_reasons (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_redress_requests__statement
  ON copyright_eu_redress_requests (copyright_eu_statement_of_reasons_id);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_redress_requests__submitter
  ON copyright_eu_redress_requests (submitted_by_user_id) WHERE submitted_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_redress_decisions__decided_by
  ON copyright_eu_redress_decisions (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_supervised_complaints__recorded_by
  ON copyright_eu_supervised_complaints (recorded_by_id) WHERE recorded_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_escalations__notice
  ON copyright_eu_escalations (copyright_notice_id);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_transparency_reports__policy
  ON copyright_eu_transparency_reports (copyright_territorial_policy_approval_id);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_transparency_reports__reported_by
  ON copyright_eu_transparency_reports (reported_by_id) WHERE reported_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_uk_notice_receipts__policy
  ON copyright_uk_notice_receipts (copyright_territorial_policy_approval_id);
CREATE INDEX IF NOT EXISTS idx_copyright_uk_notice_receipts__requester
  ON copyright_uk_notice_receipts (requester_user_id) WHERE requester_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_uk_reviews__reviewed_by
  ON copyright_uk_reviews (reviewed_by_id) WHERE reviewed_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_uk_redress_requests__review
  ON copyright_uk_redress_requests (copyright_uk_review_id);
CREATE INDEX IF NOT EXISTS idx_copyright_uk_redress_requests__submitter
  ON copyright_uk_redress_requests (submitted_by_user_id) WHERE submitted_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_uk_redress_decisions__decided_by
  ON copyright_uk_redress_decisions (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_uk_escalations__notice
  ON copyright_uk_escalations (copyright_notice_id);

CREATE OR REPLACE FUNCTION fn_reject_copyright_territorial_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'copyright territorial contract rows are immutable'
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_territorial_notice_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  expected text;
  notice_jurisdiction text;
  approval_jurisdiction text;
BEGIN
  IF TG_TABLE_NAME = 'copyright_eu_notice_receipts' THEN
    expected := 'eu_dsa';
  ELSIF TG_TABLE_NAME = 'copyright_uk_notice_receipts' THEN
    expected := 'uk';
  ELSE
    RAISE EXCEPTION 'unexpected territorial receipt table' USING ERRCODE = 'check_violation';
  END IF;
  SELECT jurisdiction INTO notice_jurisdiction FROM copyright_notices WHERE id = NEW.copyright_notice_id;
  SELECT jurisdiction INTO approval_jurisdiction
    FROM copyright_territorial_policy_approvals
    WHERE id = NEW.copyright_territorial_policy_approval_id;
  IF notice_jurisdiction IS DISTINCT FROM expected OR approval_jurisdiction IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'territorial receipt jurisdiction does not match the notice and policy'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_eu_notice_child()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_eu_notice_receipts receipt
    JOIN copyright_notices notice ON notice.id = receipt.copyright_notice_id
    WHERE receipt.copyright_notice_id = NEW.copyright_notice_id AND notice.jurisdiction = 'eu_dsa'
  ) THEN
    RAISE EXCEPTION 'EU copyright contract rows require an EU notice receipt'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_uk_notice_child()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_uk_notice_receipts receipt
    JOIN copyright_notices notice ON notice.id = receipt.copyright_notice_id
    WHERE receipt.copyright_notice_id = NEW.copyright_notice_id AND notice.jurisdiction = 'uk'
  ) THEN
    RAISE EXCEPTION 'UK copyright contract rows require a UK notice receipt'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_eu_redress_request()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM copyright_eu_statements_of_reasons statement
    WHERE statement.id = NEW.copyright_eu_statement_of_reasons_id
      AND statement.copyright_notice_id = NEW.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'EU redress must cite a statement of reasons on the same notice'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_uk_redress_request()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM copyright_uk_reviews review
    WHERE review.id = NEW.copyright_uk_review_id AND review.copyright_notice_id = NEW.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'UK redress must cite a review on the same notice'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_eu_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.copyright_eu_notice_acknowledgment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM copyright_eu_notice_acknowledgments acknowledgment
    JOIN copyright_eu_notice_receipts receipt
      ON receipt.id = acknowledgment.copyright_eu_notice_receipt_id
    WHERE acknowledgment.id = NEW.copyright_eu_notice_acknowledgment_id
      AND receipt.copyright_notice_id = NEW.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'EU escalation acknowledgment belongs to another notice'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_eu_supervised_complaint_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_eu_supervised_complaints complaint
    WHERE complaint.id = NEW.copyright_eu_supervised_complaint_id
      AND complaint.copyright_notice_id = NEW.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'EU escalation complaint belongs to another notice'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_uk_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM copyright_uk_notice_acknowledgments acknowledgment
    JOIN copyright_uk_notice_receipts receipt
      ON receipt.id = acknowledgment.copyright_uk_notice_receipt_id
    WHERE acknowledgment.id = NEW.copyright_uk_notice_acknowledgment_id
      AND receipt.copyright_notice_id = NEW.copyright_notice_id
  ) THEN
    RAISE EXCEPTION 'UK escalation acknowledgment belongs to another notice'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_eu_acknowledgment_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright acknowledgment obligations are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_eu_notice_receipt_id IS DISTINCT FROM OLD.copyright_eu_notice_receipt_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
    OR OLD.exhausted_at IS NOT NULL THEN
    RAISE EXCEPTION 'copyright acknowledgment history cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_uk_acknowledgment_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright acknowledgment obligations are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_uk_notice_receipt_id IS DISTINCT FROM OLD.copyright_uk_notice_receipt_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
    OR OLD.exhausted_at IS NOT NULL THEN
    RAISE EXCEPTION 'copyright acknowledgment history cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_territorial_policy_approvals_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_policy_approvals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_territorial_policy_withdrawals_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_policy_withdrawals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_notice_receipts_jurisdiction
  BEFORE INSERT ON copyright_eu_notice_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_territorial_notice_receipt();
CREATE TRIGGER trigger_copyright_eu_notice_receipts_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_notice_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_notice_routings_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_notice_routings
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_notice_acknowledgments_attempt
  BEFORE UPDATE OR DELETE ON copyright_eu_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_acknowledgment_attempt();
CREATE TRIGGER trigger_copyright_eu_statements_child
  BEFORE INSERT ON copyright_eu_statements_of_reasons
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_notice_child();
CREATE TRIGGER trigger_copyright_eu_statements_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_statements_of_reasons
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_redress_child
  BEFORE INSERT ON copyright_eu_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_notice_child();
CREATE TRIGGER trigger_copyright_eu_redress_same_notice
  BEFORE INSERT ON copyright_eu_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_redress_request();
CREATE TRIGGER trigger_copyright_eu_redress_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_redress_decisions_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_redress_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_supervised_child
  BEFORE INSERT ON copyright_eu_supervised_complaints
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_notice_child();
CREATE TRIGGER trigger_copyright_eu_supervised_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_supervised_complaints
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_escalations_source
  BEFORE INSERT ON copyright_eu_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_escalation();
CREATE TRIGGER trigger_copyright_eu_escalations_child
  BEFORE INSERT ON copyright_eu_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_eu_notice_child();
CREATE TRIGGER trigger_copyright_eu_escalations_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_eu_transparency_reports_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_transparency_reports
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_uk_notice_receipts_jurisdiction
  BEFORE INSERT ON copyright_uk_notice_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_territorial_notice_receipt();
CREATE TRIGGER trigger_copyright_uk_notice_receipts_immutable
  BEFORE UPDATE OR DELETE ON copyright_uk_notice_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_uk_notice_routings_immutable
  BEFORE UPDATE OR DELETE ON copyright_uk_notice_routings
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_uk_notice_acknowledgments_attempt
  BEFORE UPDATE OR DELETE ON copyright_uk_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_uk_acknowledgment_attempt();
CREATE TRIGGER trigger_copyright_uk_reviews_child
  BEFORE INSERT ON copyright_uk_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_uk_notice_child();
CREATE TRIGGER trigger_copyright_uk_reviews_immutable
  BEFORE UPDATE OR DELETE ON copyright_uk_reviews
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_uk_redress_child
  BEFORE INSERT ON copyright_uk_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_uk_notice_child();
CREATE TRIGGER trigger_copyright_uk_redress_same_notice
  BEFORE INSERT ON copyright_uk_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_uk_redress_request();
CREATE TRIGGER trigger_copyright_uk_redress_immutable
  BEFORE UPDATE OR DELETE ON copyright_uk_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_uk_redress_decisions_immutable
  BEFORE UPDATE OR DELETE ON copyright_uk_redress_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();
CREATE TRIGGER trigger_copyright_uk_escalations_source
  BEFORE INSERT ON copyright_uk_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_uk_escalation();
CREATE TRIGGER trigger_copyright_uk_escalations_child
  BEFORE INSERT ON copyright_uk_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_uk_notice_child();
CREATE TRIGGER trigger_copyright_uk_escalations_immutable
  BEFORE UPDATE OR DELETE ON copyright_uk_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_mutation();

CREATE TRIGGER trigger_copyright_territorial_policy_approvals_updated_at
  BEFORE UPDATE ON copyright_territorial_policy_approvals
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trigger_copyright_eu_notice_acknowledgments_updated_at
  BEFORE UPDATE ON copyright_eu_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trigger_copyright_uk_notice_acknowledgments_updated_at
  BEFORE UPDATE ON copyright_uk_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
