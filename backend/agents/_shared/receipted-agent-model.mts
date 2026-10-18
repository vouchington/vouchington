import { createHash } from 'node:crypto'
import { unrecoverable } from '@vouchington/queue-errors'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import type { ModelCallResult } from '@modules/model-providers/types'
import {
  completeAgentCallReceipt,
  getAgentCallReceipt,
  reserveAgentCallReceipt,
} from '@services/ai-usage/agent-call-receipts'
import { callAgentModel, type AgentModelCaller } from './call-agent-model.mts'

type ReceiptedCall<Output> = {
  agentSlug: string
  operationId: string
  promptVersion: string
  selection: Parameters<typeof callAgentModel>[0]['selection']
  input: string
  safetyIdentifier: string
  callModel: AgentModelCaller<Output>
  communityId?: string | null
  postId?: string | null
  copyrightNoticeSubmissionId?: string
}

export function agentCallOperationKey(agentSlug: string, operationId: string): string {
  return createHash('sha256')
    .update(JSON.stringify([agentSlug, operationId]))
    .digest('hex')
}

/** A missing result means dispatch might have been billed. Never automatically send it again. */
export async function callReceiptedAgentModel<Output>(
  params: ReceiptedCall<Output>,
): Promise<ModelCallResult<Output>> {
  const { agentSlug, operationId, promptVersion, selection, input, safetyIdentifier, callModel } =
    params
  const key = agentCallOperationKey(agentSlug, operationId)
  const requestSha256 = createHash('sha256')
    .update(JSON.stringify([selection, promptVersion, input]))
    .digest('hex')
  const purpose = `ai-agent-call-receipt:${key}`
  const existing = await getAgentCallReceipt(key)
  if (existing) {
    if (existing.request_sha256 !== requestSha256) {
      unrecoverable(new Error(`Paid ${agentSlug} call ${key} request changed after reservation`))
    }
    if (!existing.result_ciphertext) {
      unrecoverable(new Error(`Paid ${agentSlug} call ${key} has an uncertain receipt`))
    }
    if (existing.result_ciphertext === 'erased') {
      unrecoverable(new Error(`Paid ${agentSlug} call ${key} was erased by retention`))
    }
    return JSON.parse(decryptSecret(existing.result_ciphertext, purpose)) as ModelCallResult<Output>
  }

  const result = await callAgentModel({
    agentSlug,
    selection,
    input,
    safetyIdentifier,
    callModel,
    communityId: params.communityId,
    postId: params.postId,
    // The spend-cap check runs first, so a rejected admission does not consume this receipt.
    beforeDispatch: async () => {
      if (
        !(await reserveAgentCallReceipt(
          key,
          agentSlug,
          requestSha256,
          params.copyrightNoticeSubmissionId,
        ))
      ) {
        unrecoverable(new Error(`Paid ${agentSlug} call ${key} is already reserved`))
      }
    },
  })
  const ciphertext = encryptSecret(JSON.stringify(result), purpose)
  await completeAgentCallReceipt(key, ciphertext)
  return result
}
