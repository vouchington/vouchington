import type { McpCallAuditEvent } from './audit.mts'
import { validate as isUuid } from 'uuid'
import { getUsersByReferenceBatch } from '@services/users/resolve-references'

/**
 * Resolve admitted reinstatement usernames before the audit and the tool dispatch. The same
 * canonical UUID is substituted into the dispatched arguments, so a rename or reassignment
 * between admission and execution cannot attach the rationale to a different account.
 */
export async function resolveCopyrightUserTargetsForAudit(
  parsedBody: unknown,
  events: readonly McpCallAuditEvent[],
): Promise<void> {
  const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody]
  const pending: Array<{
    args: Record<string, unknown>
    event: McpCallAuditEvent
    reference: string
  }> = []
  for (const [index, message] of messages.entries()) {
    const event = events[index]
    if (
      event?.toolName !== 'reinstate_copyright_repeat_infringer' ||
      event.outcome !== 'accepted' ||
      event.copyrightRationale === undefined ||
      event.copyrightTarget !== undefined ||
      typeof message !== 'object' ||
      message === null
    )
      continue
    const params = (message as { params?: unknown }).params
    if (typeof params !== 'object' || params === null) continue
    const args = (params as { arguments?: unknown }).arguments
    if (typeof args !== 'object' || args === null || Array.isArray(args)) continue
    const reference = (args as Record<string, unknown>)['accountUserId']
    if (typeof reference !== 'string' || isUuid(reference)) continue
    pending.push({ args: args as Record<string, unknown>, event, reference })
  }
  if (pending.length === 0) return
  // One batched lookup for the bounded JSON-RPC request. Missing names retain the original
  // arguments, allowing the existing handler to produce its usual not-found response.
  const resolved = await getUsersByReferenceBatch(pending.map(item => item.reference))
  for (const [index, user] of resolved.entries()) {
    if (!user) continue
    const { args, event } = pending[index]!
    args['accountUserId'] = user.id
    event.copyrightTarget = { kind: 'account_user', id: user.id }
  }
}

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
