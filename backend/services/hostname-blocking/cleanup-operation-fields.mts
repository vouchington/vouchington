import sql, { type SQLStatement } from 'sql-template-strings'

export function cleanupOperationFields(hostname: SQLStatement): SQLStatement {
  return sql`block.id AS "blockId", block.url_hostname_id AS "hostnameId",
      `.append(hostname).append(sql` AS hostname, block.blocked_by_id AS "blockedById",
      block.blocked_source AS "blockedSource",
      block.should_penalize_relation_creators AS "penalizeCreators",
      block.relation_cleanup_progress AS progress,
      block.relation_cleanup_stage AS stage,
      block.relation_cleanup_resume_after AS "resumeAfter",
      block.relation_cleanup_blocked_hostname_count AS "blockedHostnameCount",
      block.relation_cleanup_soft_deleted_relation_count AS "softDeletedRelationCount",
      block.relation_cleanup_penalized_user_count AS "penalizedUserCount",
      block.relation_cleanup_completed_at AS "completedAt"`)
}
