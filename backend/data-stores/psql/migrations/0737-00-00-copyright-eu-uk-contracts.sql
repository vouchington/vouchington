-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- EU and UK copyright contracts. EU (DSA) and UK share one set of territorial tables keyed by a
-- jurisdiction column, and a composite foreign key keeps every child row on a notice of its own
-- jurisdiction. Only the EU supervised complaint and transparency report tables stay EU-only. These
-- tables store receipt, routing, decision, redress, escalation, and reporting facts. They do not
-- store US restoration clocks, placement keys, or lifecycle metadata. No policy row is seeded: the
-- contracts stay unavailable until a separate approval exists.

CREATE TABLE IF NOT EXISTS copyright_jurisdiction_policy_approvals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction text NOT NULL,
  policy_version text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_jurisdiction_policy_approvals__version UNIQUE (jurisdiction, policy_version),
  CONSTRAINT uq_copyright_jurisdiction_policy_approvals__id_jurisdiction UNIQUE (id, jurisdiction),
  CONSTRAINT chk_copyright_jurisdiction_policy_approvals__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_jurisdiction_policy_approvals__version CHECK (
    policy_version ~ '^[a-z0-9][a-z0-9._-]{0,63}$'
  )
);

CREATE TABLE IF NOT EXISTS copyright_jurisdiction_policy_withdrawals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_jurisdiction_policy_approval_id uuid NOT NULL UNIQUE
    REFERENCES copyright_jurisdiction_policy_approvals (id) ON DELETE RESTRICT,
  withdrawn_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_by_id uuid,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS copyright_territorial_notice_receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction text NOT NULL,
  copyright_jurisdiction_policy_approval_id uuid NOT NULL,
  requester_user_id uuid,
  idempotency_key text NOT NULL,
  request_sha256 bytea NOT NULL,
  hosted_use_url text NOT NULL,
  grounds_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_territorial_notice_receipts__notice UNIQUE (copyright_notice_id, jurisdiction),
  CONSTRAINT uq_copyright_territorial_notice_receipts__idempotency UNIQUE (
    requester_user_id, jurisdiction, idempotency_key
  ),
  CONSTRAINT fk_copyright_territorial_notice_receipts__approval
    FOREIGN KEY (copyright_jurisdiction_policy_approval_id, jurisdiction)
    REFERENCES copyright_jurisdiction_policy_approvals (id, jurisdiction) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_territorial_notice_receipts__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_notice_receipts__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_territorial_notice_receipts__sha CHECK (octet_length(request_sha256) = 32),
  CONSTRAINT chk_copyright_territorial_notice_receipts__url CHECK (char_length(hosted_use_url) BETWEEN 1 AND 2048),
  CONSTRAINT chk_copyright_territorial_notice_receipts__grounds CHECK (
    char_length(grounds_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_territorial_notice_routings (
  copyright_territorial_notice_receipt_id uuid PRIMARY KEY
    REFERENCES copyright_territorial_notice_receipts (id) ON DELETE RESTRICT,
  destination text NOT NULL,
  routed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_territorial_notice_routings__destination CHECK (destination = 'staff_queue')
);

CREATE TABLE IF NOT EXISTS copyright_territorial_notice_acknowledgments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_territorial_notice_receipt_id uuid NOT NULL UNIQUE
    REFERENCES copyright_territorial_notice_receipts (id) ON DELETE RESTRICT,
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  acknowledged_at timestamptz,
  exhausted_at timestamptz,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__attempts CHECK (attempt_count BETWEEN 0 AND 5),
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__attempt_time CHECK (
    (attempt_count = 0) = (last_attempt_at IS NULL)
  ),
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__terminal CHECK (
    acknowledged_at IS NULL OR exhausted_at IS NULL
  ),
  CONSTRAINT chk_copyright_territorial_notice_acknowledgments__exhaustion CHECK (
    exhausted_at IS NULL OR attempt_count = 5
  )
);

CREATE TABLE IF NOT EXISTS copyright_territorial_decisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  outcome text NOT NULL,
  copyright_notice_submission_assessment_id uuid,
  supersedes_decision_id uuid UNIQUE,
  automation_disclosure text NOT NULL,
  rationale_ciphertext text NOT NULL,
  public_explanation_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_territorial_decisions__notice_id UNIQUE (copyright_notice_id, id),
  CONSTRAINT chk_copyright_territorial_decisions__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_decisions__outcome CHECK (outcome IN ('restrict', 'no_action')),
  CONSTRAINT chk_copyright_territorial_decisions__assessment CHECK ((outcome = 'restrict') = (copyright_notice_submission_assessment_id IS NOT NULL)),
  CONSTRAINT chk_copyright_territorial_decisions__successor CHECK (supersedes_decision_id IS NULL OR outcome = 'restrict'),
  CONSTRAINT chk_copyright_territorial_decisions__human CHECK (automation_disclosure = 'human'),
  CONSTRAINT chk_copyright_territorial_decisions__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  ),
  CONSTRAINT chk_copyright_territorial_decisions__public_explanation CHECK (
    char_length(public_explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);
CREATE UNIQUE INDEX uq_copyright_territorial_decisions__original
  ON copyright_territorial_decisions (copyright_notice_id, jurisdiction)
  WHERE supersedes_decision_id IS NULL;

CREATE TABLE IF NOT EXISTS copyright_territorial_redress_requests (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction text NOT NULL,
  copyright_territorial_decision_id uuid NOT NULL,
  submitted_by_user_id uuid,
  idempotency_key text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_territorial_redress_requests__notice UNIQUE (copyright_notice_id, jurisdiction),
  CONSTRAINT uq_copyright_territorial_redress_requests__idempotency UNIQUE (
    submitted_by_user_id, jurisdiction, idempotency_key
  ),
  CONSTRAINT fk_copyright_territorial_redress_requests__decision
    FOREIGN KEY (copyright_notice_id, copyright_territorial_decision_id)
    REFERENCES copyright_territorial_decisions (copyright_notice_id, id) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_territorial_redress_requests__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_redress_requests__idempotency CHECK (char_length(idempotency_key) = 36),
  CONSTRAINT chk_copyright_territorial_redress_requests__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_territorial_redress_decisions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_territorial_redress_request_id uuid NOT NULL UNIQUE
    REFERENCES copyright_territorial_redress_requests (id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_by_id uuid,
  staff_disposition text NOT NULL,
  rationale_ciphertext text NOT NULL,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_territorial_redress_decisions__disposition CHECK (
    staff_disposition IN ('maintain', 'revoke')
  ),
  CONSTRAINT chk_copyright_territorial_redress_decisions__rationale CHECK (
    char_length(rationale_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_supervised_complaints (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction text NOT NULL,
  recorded_by_id uuid,
  authority_reference text NOT NULL,
  explanation_ciphertext text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_copyright_eu_supervised_complaints__reference UNIQUE (
    copyright_notice_id, jurisdiction, authority_reference
  ),
  CONSTRAINT chk_copyright_eu_supervised_complaints__jurisdiction CHECK (jurisdiction = 'eu_dsa'),
  CONSTRAINT chk_copyright_eu_supervised_complaints__reference CHECK (
    char_length(authority_reference) BETWEEN 1 AND 200
  ),
  CONSTRAINT chk_copyright_eu_supervised_complaints__explanation CHECK (
    char_length(explanation_ciphertext) BETWEEN 1 AND 1048576
  )
);

CREATE TABLE IF NOT EXISTS copyright_territorial_escalations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id uuid NOT NULL,
  jurisdiction text NOT NULL,
  copyright_territorial_notice_acknowledgment_id uuid UNIQUE
    REFERENCES copyright_territorial_notice_acknowledgments (id) ON DELETE RESTRICT,
  copyright_eu_supervised_complaint_id uuid UNIQUE
    REFERENCES copyright_eu_supervised_complaints (id) ON DELETE RESTRICT,
  escalated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_copyright_territorial_escalations__jurisdiction CHECK (jurisdiction IN ('eu_dsa', 'uk')),
  CONSTRAINT chk_copyright_territorial_escalations__source CHECK (
    num_nonnulls(
      copyright_territorial_notice_acknowledgment_id,
      copyright_eu_supervised_complaint_id
    ) = 1
  )
);

CREATE TABLE IF NOT EXISTS copyright_eu_transparency_reports (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  jurisdiction text NOT NULL,
  copyright_jurisdiction_policy_approval_id uuid NOT NULL,
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
  CONSTRAINT fk_copyright_eu_transparency_reports__approval
    FOREIGN KEY (copyright_jurisdiction_policy_approval_id, jurisdiction)
    REFERENCES copyright_jurisdiction_policy_approvals (id, jurisdiction) ON DELETE RESTRICT,
  CONSTRAINT chk_copyright_eu_transparency_reports__jurisdiction CHECK (jurisdiction = 'eu_dsa'),
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

COMMENT ON TABLE copyright_jurisdiction_policy_approvals IS
  'Operator approval that makes one EU or UK copyright contract applicable. Absence or withdrawal fails closed.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.jurisdiction IS
  'Contract family this approval activates: eu_dsa or uk.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.policy_version IS
  'Identifier of the approved contract text. Unique per jurisdiction.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.approved_at IS
  'When an operator approved this policy version.';
COMMENT ON COLUMN copyright_jurisdiction_policy_approvals.approved_by_id IS
  'Operator who approved this policy version. Null after that account is deleted.';

COMMENT ON TABLE copyright_jurisdiction_policy_withdrawals IS
  'Withdrawal of one jurisdiction policy approval. A withdrawn approval fails closed.';
COMMENT ON COLUMN copyright_jurisdiction_policy_withdrawals.copyright_jurisdiction_policy_approval_id IS
  'Approval this withdrawal retires. One withdrawal per approval.';
COMMENT ON COLUMN copyright_jurisdiction_policy_withdrawals.withdrawn_at IS
  'When an operator withdrew the approval.';
COMMENT ON COLUMN copyright_jurisdiction_policy_withdrawals.withdrawn_by_id IS
  'Operator who withdrew the approval. Null after that account is deleted.';

COMMENT ON TABLE copyright_territorial_notice_receipts IS
  'EU or UK notice receipt. Administrative facts only; no US restoration clock and no merits decision.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.copyright_notice_id IS
  'Copyright notice this receipt records. One receipt per notice.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.jurisdiction IS
  'Jurisdiction of the notice and of the policy approval: eu_dsa or uk. Both foreign keys must agree.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.copyright_jurisdiction_policy_approval_id IS
  'Unwithdrawn policy approval of the same jurisdiction that made this receipt acceptable.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.requester_user_id IS
  'Signed-in requester. Null for a guest or after account deletion.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.idempotency_key IS
  'Caller idempotency key, unique together with requester_user_id and jurisdiction.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.request_sha256 IS
  'SHA-256 digest of the received request.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.hosted_use_url IS
  'URL of the hosted use identified in the notice.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.grounds_ciphertext IS
  'Encrypted grounds supplied with the notice. The system does not decide merits.';
COMMENT ON COLUMN copyright_territorial_notice_receipts.received_at IS
  'When Voucha stored this notice receipt.';

COMMENT ON TABLE copyright_territorial_notice_routings IS
  'Staff-queue routing for one EU or UK notice receipt. Routing is administrative, not a merits decision.';
COMMENT ON COLUMN copyright_territorial_notice_routings.copyright_territorial_notice_receipt_id IS
  'Receipt this routing belongs to. One routing per receipt.';
COMMENT ON COLUMN copyright_territorial_notice_routings.destination IS
  'Queue that received the notice. Constrained to staff_queue.';
COMMENT ON COLUMN copyright_territorial_notice_routings.routed_at IS
  'When the receipt was routed to the staff queue.';

COMMENT ON TABLE copyright_territorial_notice_acknowledgments IS
  'Acknowledgment attempts for one EU or UK notice receipt. There is no statutory due time.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.copyright_territorial_notice_receipt_id IS
  'Receipt this acknowledgment obligation belongs to. One row per receipt.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.attempt_count IS
  'How many acknowledgment attempts have been recorded, from 0 through 5.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.last_attempt_at IS
  'When the latest acknowledgment attempt was recorded. Null when attempt_count is 0.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.acknowledged_at IS
  'When acknowledgment succeeded. Mutually exclusive with exhausted_at.';
COMMENT ON COLUMN copyright_territorial_notice_acknowledgments.exhausted_at IS
  'When the fifth attempt failed and the obligation was exhausted.';

COMMENT ON TABLE copyright_territorial_decisions IS
  'Human decision on an EU or UK notice. A revoked no_action can be superseded once by a restrict decision; the live decision is the row without a successor.';
COMMENT ON COLUMN copyright_territorial_decisions.copyright_notice_id IS
  'Notice this decision explains. At most one original and one permitted successor per notice.';
COMMENT ON COLUMN copyright_territorial_decisions.jurisdiction IS
  'Jurisdiction of the notice: eu_dsa or uk. Must equal the notice jurisdiction.';
COMMENT ON COLUMN copyright_territorial_decisions.decided_at IS
  'When staff recorded the decision (the statement of reasons for eu_dsa).';
COMMENT ON COLUMN copyright_territorial_decisions.decided_by_id IS
  'Staff user who recorded the decision. Null after that account is deleted.';
COMMENT ON COLUMN copyright_territorial_decisions.automation_disclosure IS
  'How the decision was produced. Constrained to human.';
COMMENT ON COLUMN copyright_territorial_decisions.outcome IS
  'Human decision: restrict the named targets or take no action.';
COMMENT ON COLUMN copyright_territorial_decisions.copyright_notice_submission_assessment_id IS
  'Required compliant human assessment for a restrict decision; absent for no_action.';
COMMENT ON COLUMN copyright_territorial_decisions.supersedes_decision_id IS
  'Prior no_action decision reopened by a complaint revoke on the same notice.';
COMMENT ON COLUMN copyright_territorial_decisions.rationale_ciphertext IS
  'Encrypted staff-only rationale; never included in participant notices.';
COMMENT ON COLUMN copyright_territorial_decisions.public_explanation_ciphertext IS
  'Encrypted staff-written public explanation for poster and notifier statements; must contain no personal data.';

COMMENT ON TABLE copyright_territorial_redress_requests IS
  'Participant redress against one EU or UK decision. One request per notice.';
COMMENT ON COLUMN copyright_territorial_redress_requests.copyright_notice_id IS
  'Notice this redress request challenges. The composite foreign key requires the cited decision to be on this notice.';
COMMENT ON COLUMN copyright_territorial_redress_requests.jurisdiction IS
  'Jurisdiction of the notice: eu_dsa or uk. Must equal the notice jurisdiction.';
COMMENT ON COLUMN copyright_territorial_redress_requests.copyright_territorial_decision_id IS
  'Decision this redress request cites, on the same notice.';
COMMENT ON COLUMN copyright_territorial_redress_requests.submitted_by_user_id IS
  'Participant who submitted the redress request. Null after account deletion.';
COMMENT ON COLUMN copyright_territorial_redress_requests.idempotency_key IS
  'Caller idempotency key, unique together with submitted_by_user_id and jurisdiction.';
COMMENT ON COLUMN copyright_territorial_redress_requests.explanation_ciphertext IS
  'Encrypted explanation supplied by the participant.';
COMMENT ON COLUMN copyright_territorial_redress_requests.received_at IS
  'When Voucha stored this redress request.';

COMMENT ON TABLE copyright_territorial_redress_decisions IS
  'Staff disposition of one EU or UK redress request. The system does not choose the rationale.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.copyright_territorial_redress_request_id IS
  'Redress request this decision closes. One decision per request.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.decided_at IS
  'When staff recorded the redress decision.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.decided_by_id IS
  'Staff user who recorded the decision. Null after that account is deleted.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.staff_disposition IS
  'Staff outcome: maintain or revoke. The system does not choose it.';
COMMENT ON COLUMN copyright_territorial_redress_decisions.rationale_ciphertext IS
  'Encrypted staff-supplied rationale for the disposition.';

COMMENT ON TABLE copyright_eu_supervised_complaints IS
  'Supervised complaint recorded against an EU notice. EU only. Recording it can escalate the notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.copyright_notice_id IS
  'EU notice this supervised complaint concerns.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.jurisdiction IS
  'Always eu_dsa. The composite foreign key requires the notice to be an eu_dsa notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.recorded_by_id IS
  'Staff user who recorded the complaint. Null after that account is deleted.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.authority_reference IS
  'Authority reference for this complaint. Unique per notice.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.explanation_ciphertext IS
  'Encrypted explanation of the supervised complaint.';
COMMENT ON COLUMN copyright_eu_supervised_complaints.received_at IS
  'When Voucha stored this supervised complaint.';

COMMENT ON TABLE copyright_territorial_escalations IS
  'Escalation of one EU or UK notice from either an exhausted acknowledgment or, for EU only, a supervised complaint.';
COMMENT ON COLUMN copyright_territorial_escalations.copyright_notice_id IS
  'Notice this escalation belongs to. The source row must belong to the same notice.';
COMMENT ON COLUMN copyright_territorial_escalations.jurisdiction IS
  'Jurisdiction of the notice: eu_dsa or uk. Must equal the notice jurisdiction.';
COMMENT ON COLUMN copyright_territorial_escalations.copyright_territorial_notice_acknowledgment_id IS
  'Exhausted acknowledgment that caused this escalation. Exactly one source is set.';
COMMENT ON COLUMN copyright_territorial_escalations.copyright_eu_supervised_complaint_id IS
  'EU supervised complaint that caused this escalation. Exactly one source is set.';
COMMENT ON COLUMN copyright_territorial_escalations.escalated_at IS
  'When the escalation was recorded.';

COMMENT ON TABLE copyright_eu_transparency_reports IS
  'Counts of stored EU copyright facts for a caller-supplied period. EU only. The period is not a statutory clock.';
COMMENT ON COLUMN copyright_eu_transparency_reports.jurisdiction IS
  'Always eu_dsa. The composite foreign key requires an eu_dsa policy approval.';
COMMENT ON COLUMN copyright_eu_transparency_reports.copyright_jurisdiction_policy_approval_id IS
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

ALTER TABLE copyright_jurisdiction_policy_approvals
  ADD CONSTRAINT fk_copyright_jurisdiction_policy_approvals__approved_by
  FOREIGN KEY (approved_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_jurisdiction_policy_approvals
  VALIDATE CONSTRAINT fk_copyright_jurisdiction_policy_approvals__approved_by;

ALTER TABLE copyright_jurisdiction_policy_withdrawals
  ADD CONSTRAINT fk_copyright_jurisdiction_policy_withdrawals__withdrawn_by
  FOREIGN KEY (withdrawn_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_jurisdiction_policy_withdrawals
  VALIDATE CONSTRAINT fk_copyright_jurisdiction_policy_withdrawals__withdrawn_by;

ALTER TABLE copyright_territorial_notice_receipts
  ADD CONSTRAINT fk_copyright_territorial_notice_receipts__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_territorial_notice_receipts__notice;
ALTER TABLE copyright_territorial_notice_receipts
  ADD CONSTRAINT fk_copyright_territorial_notice_receipts__requester
  FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_territorial_notice_receipts
  VALIDATE CONSTRAINT fk_copyright_territorial_notice_receipts__requester;

ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__notice;
ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__decided_by;
ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__assessment
  FOREIGN KEY (copyright_notice_submission_assessment_id)
  REFERENCES copyright_notice_submission_assessments (id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__assessment;
ALTER TABLE copyright_territorial_decisions
  ADD CONSTRAINT fk_copyright_territorial_decisions__predecessor
  FOREIGN KEY (copyright_notice_id, supersedes_decision_id)
  REFERENCES copyright_territorial_decisions (copyright_notice_id, id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_decisions__predecessor;

ALTER TABLE copyright_territorial_redress_requests
  ADD CONSTRAINT fk_copyright_territorial_redress_requests__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_redress_requests
  VALIDATE CONSTRAINT fk_copyright_territorial_redress_requests__notice;
ALTER TABLE copyright_territorial_redress_requests
  ADD CONSTRAINT fk_copyright_territorial_redress_requests__submitter
  FOREIGN KEY (submitted_by_user_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_territorial_redress_requests
  VALIDATE CONSTRAINT fk_copyright_territorial_redress_requests__submitter;

ALTER TABLE copyright_territorial_redress_decisions
  ADD CONSTRAINT fk_copyright_territorial_redress_decisions__decided_by
  FOREIGN KEY (decided_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_territorial_redress_decisions
  VALIDATE CONSTRAINT fk_copyright_territorial_redress_decisions__decided_by;

ALTER TABLE copyright_eu_supervised_complaints
  ADD CONSTRAINT fk_copyright_eu_supervised_complaints__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_eu_supervised_complaints
  VALIDATE CONSTRAINT fk_copyright_eu_supervised_complaints__notice;
ALTER TABLE copyright_eu_supervised_complaints
  ADD CONSTRAINT fk_copyright_eu_supervised_complaints__recorded_by
  FOREIGN KEY (recorded_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_supervised_complaints
  VALIDATE CONSTRAINT fk_copyright_eu_supervised_complaints__recorded_by;

ALTER TABLE copyright_territorial_escalations
  ADD CONSTRAINT fk_copyright_territorial_escalations__notice
  FOREIGN KEY (copyright_notice_id, jurisdiction)
  REFERENCES copyright_notices (id, jurisdiction) ON DELETE RESTRICT NOT VALID;
ALTER TABLE copyright_territorial_escalations
  VALIDATE CONSTRAINT fk_copyright_territorial_escalations__notice;

ALTER TABLE copyright_eu_transparency_reports
  ADD CONSTRAINT fk_copyright_eu_transparency_reports__reported_by
  FOREIGN KEY (reported_by_id) REFERENCES users (id) ON DELETE SET NULL NOT VALID;
ALTER TABLE copyright_eu_transparency_reports
  VALIDATE CONSTRAINT fk_copyright_eu_transparency_reports__reported_by;

CREATE INDEX IF NOT EXISTS idx_copyright_jurisdiction_policy_approvals__approved_by
  ON copyright_jurisdiction_policy_approvals (approved_by_id) WHERE approved_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_jurisdiction_policy_withdrawals__withdrawn_by
  ON copyright_jurisdiction_policy_withdrawals (withdrawn_by_id) WHERE withdrawn_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_notice_receipts__policy
  ON copyright_territorial_notice_receipts (copyright_jurisdiction_policy_approval_id, jurisdiction);
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_notice_receipts__requester
  ON copyright_territorial_notice_receipts (requester_user_id) WHERE requester_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_decisions__decided_by
  ON copyright_territorial_decisions (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX idx_copyright_territorial_decisions__assessment
  ON copyright_territorial_decisions (copyright_notice_submission_assessment_id)
  WHERE copyright_notice_submission_assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_requests__decision
  ON copyright_territorial_redress_requests (copyright_notice_id, copyright_territorial_decision_id);
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_requests__submitter
  ON copyright_territorial_redress_requests (submitted_by_user_id) WHERE submitted_by_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_redress_decisions__decided_by
  ON copyright_territorial_redress_decisions (decided_by_id) WHERE decided_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_eu_supervised_complaints__recorded_by
  ON copyright_eu_supervised_complaints (recorded_by_id) WHERE recorded_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_territorial_escalations__notice
  ON copyright_territorial_escalations (copyright_notice_id, jurisdiction);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_transparency_reports__policy
  ON copyright_eu_transparency_reports (copyright_jurisdiction_policy_approval_id, jurisdiction);
CREATE INDEX IF NOT EXISTS idx_copyright_eu_transparency_reports__reported_by
  ON copyright_eu_transparency_reports (reported_by_id) WHERE reported_by_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_reject_copyright_territorial_escalation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (
    NEW.copyright_territorial_notice_acknowledgment_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM copyright_territorial_notice_acknowledgments acknowledgment
      JOIN copyright_territorial_notice_receipts receipt
        ON receipt.id = acknowledgment.copyright_territorial_notice_receipt_id
      WHERE acknowledgment.id = NEW.copyright_territorial_notice_acknowledgment_id
        AND receipt.copyright_notice_id = NEW.copyright_notice_id
    )
  ) OR (
    NEW.copyright_eu_supervised_complaint_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM copyright_eu_supervised_complaints complaint
      WHERE complaint.id = NEW.copyright_eu_supervised_complaint_id
        AND complaint.copyright_notice_id = NEW.copyright_notice_id
    )
  ) THEN
    RAISE EXCEPTION 'territorial escalation source belongs to another notice'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_reject_copyright_territorial_acknowledgment_attempt()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'copyright acknowledgment obligations are retained' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.copyright_territorial_notice_receipt_id IS DISTINCT FROM OLD.copyright_territorial_notice_receipt_id
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.attempt_count < OLD.attempt_count
    OR (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
    OR OLD.exhausted_at IS NOT NULL THEN
    RAISE EXCEPTION 'copyright acknowledgment history cannot be rewritten' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_guard_copyright_territorial_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.outcome = 'restrict' AND NOT EXISTS (
    SELECT 1 FROM copyright_notice_submission_assessments assessment
    JOIN copyright_notice_submissions submission
      ON submission.id = assessment.copyright_notice_submission_id
    WHERE assessment.id = NEW.copyright_notice_submission_assessment_id
      AND submission.copyright_notice_id = NEW.copyright_notice_id
      AND submission.kind = 'notice'
      AND assessment.substantially_compliant
      AND assessment.assessed_by_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM copyright_notice_submission_assessments newer
        WHERE newer.supersedes_assessment_id = assessment.id
      )
  ) THEN
    RAISE EXCEPTION 'territorial restriction requires a current compliant human notice assessment in the same case'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes_decision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM copyright_territorial_decisions predecessor
    JOIN copyright_territorial_redress_requests request
      ON request.copyright_territorial_decision_id = predecessor.id
    JOIN copyright_territorial_redress_decisions redress
      ON redress.copyright_territorial_redress_request_id = request.id
    WHERE predecessor.id = NEW.supersedes_decision_id
      AND predecessor.copyright_notice_id = NEW.copyright_notice_id
      AND predecessor.jurisdiction = NEW.jurisdiction
      AND predecessor.outcome = 'no_action'
      AND redress.staff_disposition = 'revoke'
  ) THEN
    RAISE EXCEPTION 'territorial successor requires a revoked no_action decision'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_copyright_jurisdiction_policy_approvals_immutable
  BEFORE UPDATE OR DELETE ON copyright_jurisdiction_policy_approvals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_jurisdiction_policy_withdrawals_immutable
  BEFORE UPDATE OR DELETE ON copyright_jurisdiction_policy_withdrawals
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_notice_receipts_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_notice_receipts
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_notice_routings_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_notice_routings
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_notice_acknowledgments_attempt
  BEFORE UPDATE OR DELETE ON copyright_territorial_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_acknowledgment_attempt();
CREATE TRIGGER trigger_copyright_territorial_decisions_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_decisions_scope
  BEFORE INSERT ON copyright_territorial_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_guard_copyright_territorial_decision();
CREATE TRIGGER trigger_copyright_territorial_redress_requests_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_redress_requests
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_redress_decisions_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_redress_decisions
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_eu_supervised_complaints_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_supervised_complaints
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_territorial_escalations_source
  BEFORE INSERT ON copyright_territorial_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_territorial_escalation();
CREATE TRIGGER trigger_copyright_territorial_escalations_immutable
  BEFORE UPDATE OR DELETE ON copyright_territorial_escalations
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();
CREATE TRIGGER trigger_copyright_eu_transparency_reports_immutable
  BEFORE UPDATE OR DELETE ON copyright_eu_transparency_reports
  FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

CREATE TRIGGER trigger_copyright_jurisdiction_policy_approvals_updated_at
  BEFORE UPDATE ON copyright_jurisdiction_policy_approvals
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trigger_copyright_territorial_notice_acknowledgments_updated_at
  BEFORE UPDATE ON copyright_territorial_notice_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
