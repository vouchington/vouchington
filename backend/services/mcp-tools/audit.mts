import { randomUUID } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'
import { encryptSecret } from '@modules/token-secrets'
import { v7 as uuidv7 } from 'uuid'
import type { McpCallAuditOutcome } from '@voucha/types/mcp-call-audit-outcome'
import type { McpServerConfig } from './config.mts'

export type { McpCallAuditOutcome } from '@voucha/types/mcp-call-audit-outcome'

// Only validated copyright decision calls may carry a rationale; arbitrary arguments and results
// remain absent from this event.
export type McpCallAuditEvent = {
  jsonrpcMethod: string | null
  toolName: string | null
  option?: string
  outcome: McpCallAuditOutcome
  copyrightRationale?: string
  copyrightTarget?: {
    kind:
      | 'notice'
      | 'form_intake'
      | 'email_intake'
      | 'submission'
      | 'hold_assessment'
      | 'repeat_incident'
      | 'repeat_review'
      | 'account_user'
    id: string
  }
}

// The verified credential a call was made with. Its `credential` tag matches the MCP authentication
// result, so that result can be passed straight in; the context copies out only the identifier.
export type McpCallAuditCredential =
  // The public OAuth client_id string, not the internal row id.
  | { credential: 'oauth'; oauthClientId: string }
  // The api_keys row id, which is also the key's retained identity id.
  | { credential: 'api_key'; apiKeyId: string }

export type McpCallAuditContext = {
  audience: McpServerConfig['audience']
  correlationId: string
  actorUserId: string
  credential: McpCallAuditCredential
  resource: string
}

export function createMcpCallAuditContext(
  config: McpServerConfig,
  actorUserId: string,
  credential: McpCallAuditCredential,
): McpCallAuditContext {
  return {
    audience: config.audience,
    correlationId: randomUUID(),
    actorUserId,
    credential:
      credential.credential === 'oauth'
        ? { credential: 'oauth', oauthClientId: credential.oauthClientId }
        : { credential: 'api_key', apiKeyId: credential.apiKeyId },
    resource: getOAuthResourceUrl(config.audience),
  }
}

// One batched insert per request. It throws unless every event was stored, including when the OAuth
// client row no longer exists or the API key has no retained identity (the foreign key rejects it),
// so a caller can refuse to run a call it could not record.
export async function recordMcpCallAudit(
  context: McpCallAuditContext,
  events: readonly McpCallAuditEvent[],
): Promise<void> {
  if (events.length === 0) return
  const { credential } = context
  const eventIds = events.map(() => uuidv7())
  await using query = await beginTransaction()
  const result = await query(
    `/* recordMcpCallAudit */
    INSERT INTO mcp_call_audit_events
      (id, audience, correlation_id, actor_user_id, oauth_client_id, api_key_id, resource,
       jsonrpc_method, tool_name, tool_option, outcome)
    SELECT event.id, $1, $2::uuid, $3::uuid, subject.oauth_client_id, subject.api_key_id, $4,
      event.jsonrpc_method, event.tool_name, event.tool_option, event.outcome
    FROM (
      SELECT client.id AS oauth_client_id, NULL::uuid AS api_key_id
      FROM oauth_clients AS client
      WHERE client.client_id = $5::text
      UNION ALL
      SELECT NULL::uuid, $6::uuid WHERE $6::uuid IS NOT NULL
    ) AS subject
    CROSS JOIN unnest($7::uuid[], $8::text[], $9::text[], $10::mcp_call_audit_event_outcomes[], $11::text[])
      WITH ORDINALITY AS event(id, jsonrpc_method, tool_name, outcome, tool_option, ordinal)
    ORDER BY event.ordinal`,
    [
      context.audience,
      context.correlationId,
      context.actorUserId,
      context.resource,
      credential.credential === 'oauth' ? credential.oauthClientId : null,
      credential.credential === 'api_key' ? credential.apiKeyId : null,
      eventIds,
      events.map(event => event.jsonrpcMethod),
      events.map(event => event.toolName),
      events.map(event => event.outcome),
      events.map(event => event.option ?? null),
    ],
  )
  if (result.rowCount !== events.length) throw new Error('MCP call audit was not recorded')
  const rationales = events.flatMap(event => {
    if (event.copyrightRationale === undefined || !event.copyrightTarget) return []
    const id = uuidv7()
    return [
      {
        id,
        kind: event.copyrightTarget.kind,
        targetId: event.copyrightTarget.id,
        toolName: event.toolName,
        ciphertext: encryptSecret(event.copyrightRationale, `copyright-decision-rationale:${id}`),
      },
    ]
  })
  if (rationales.length > 0) {
    await query(
      `/* recordMcpCallAudit:legalRationales */
       INSERT INTO copyright_decision_rationales
         (id, copyright_notice_id, copyright_notice_email_intake_id,
          copyright_repeat_infringer_review_id, account_user_id, recorded_by_id,
          tool_name, rationale_ciphertext)
       SELECT event.id,
         COALESCE(notice.id, form_intake.copyright_notice_id, submission.copyright_notice_id,
           hold_assessment.copyright_notice_id, repeat_incident.copyright_notice_id),
         email_intake.id, repeat_review.id, account_user.id, $1::uuid,
         event.tool_name, event.ciphertext
       FROM unnest($2::uuid[], $3::text[], $4::uuid[], $5::text[], $6::text[])
         AS event(id, kind, target_id, tool_name, ciphertext)
       LEFT JOIN copyright_notices notice ON event.kind = 'notice' AND notice.id = event.target_id
       LEFT JOIN copyright_notice_form_intakes form_intake
         ON event.kind = 'form_intake' AND form_intake.id = event.target_id
       LEFT JOIN copyright_notice_submissions submission
         ON event.kind = 'submission' AND submission.id = event.target_id
       LEFT JOIN copyright_notice_legal_hold_assessments hold_assessment
         ON event.kind = 'hold_assessment' AND hold_assessment.id = event.target_id
       LEFT JOIN copyright_repeat_infringer_incidents repeat_incident
         ON event.kind = 'repeat_incident' AND repeat_incident.id = event.target_id
       LEFT JOIN copyright_notice_email_intakes email_intake
         ON event.kind = 'email_intake' AND email_intake.id = event.target_id
       LEFT JOIN copyright_repeat_infringer_reviews repeat_review
         ON event.kind = 'repeat_review' AND repeat_review.id = event.target_id
       LEFT JOIN retained_user_identities account_user
         ON event.kind = 'account_user' AND account_user.id = event.target_id
       WHERE num_nonnulls(
         COALESCE(notice.id, form_intake.copyright_notice_id, submission.copyright_notice_id,
           hold_assessment.copyright_notice_id, repeat_incident.copyright_notice_id),
         email_intake.id, repeat_review.id, account_user.id
       ) = 1`,
      [
        context.actorUserId,
        rationales.map(row => row.id),
        rationales.map(row => row.kind),
        rationales.map(row => row.targetId),
        rationales.map(row => row.toolName),
        rationales.map(row => row.ciphertext),
      ],
    )
  }
  await query.commit()
}
