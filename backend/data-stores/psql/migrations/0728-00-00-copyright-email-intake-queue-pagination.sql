-- migration-mode: online

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_copyright_notice_email_intakes__received_id
  ON copyright_notice_email_intakes (received_at, id);
