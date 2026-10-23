import type { McpCallAuditEvent } from './audit.mts'
import { validate as isUuid } from 'uuid'

export function readCopyrightTarget(
  toolName: string,
  source: unknown,
): McpCallAuditEvent['copyrightTarget'] | undefined {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return undefined
  const args = source as Record<string, unknown>
  const spec: Record<
    string,
    { kind: NonNullable<McpCallAuditEvent['copyrightTarget']>['kind']; field: string }
  > = {
    review_copyright_form_intake: { kind: 'form_intake', field: 'id' },
    review_copyright_email_intake: { kind: 'email_intake', field: 'intake_id' },
    review_copyright_email_correspondence: { kind: 'email_intake', field: 'intake_id' },
    replay_copyright_email_intake_reply: { kind: 'email_intake', field: 'intake_id' },
    review_copyright_restriction: { kind: 'notice', field: 'id' },
    review_copyright_counter_notice: { kind: 'submission', field: 'id' },
    review_copyright_appeal: { kind: 'submission', field: 'id' },
    assess_copyright_legal_hold: { kind: 'submission', field: 'id' },
    resolve_copyright_legal_hold: { kind: 'hold_assessment', field: 'id' },
    record_copyright_repeat_infringer_disposition: { kind: 'repeat_incident', field: 'id' },
    record_copyright_repeat_infringer_outcome: { kind: 'repeat_review', field: 'id' },
    reinstate_copyright_repeat_infringer: { kind: 'account_user', field: 'accountUserId' },
    replay_copyright_intent: { kind: 'notice', field: 'id' },
    revoke_copyright_guest_capability: { kind: 'notice', field: 'id' },
  }
  const target = spec[toolName]
  if (!target) return undefined
  const id = args[target.field]
  return typeof id === 'string' && isUuid(id) ? { kind: target.kind, id } : undefined
}
