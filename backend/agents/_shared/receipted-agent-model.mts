import { createHash } from 'node:crypto'
import { unrecoverable } from '@vouchington/queue-errors'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import { type ModelCallResult, isModelProviderError } from '@vouchington/ai/providers'
import {
  completeAgentCallReceipt,
  getAgentCallReceipt,
  releaseUnbilledAgentCallReceipt,
  reserveAgentCallReceipt,
  type ReportReceiptTarget,
} from '@services/ai-usage/agent-call-receipts'
import { callAgentModel, type AgentModelCaller } from './call-agent-model.mts'
import { UnbilledRetrySpendCapBreachError } from './openai-response-attempt-hooks.mts'

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
  reportTarget?: ReportReceiptTarget
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

  let result: ModelCallResult<Output>
  try {
    result = await callAgentModel({
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
            params.reportTarget,
            agentSlug === 'story-post' ? (params.postId ?? undefined) : undefined,
          ))
        ) {
          unrecoverable(new Error(`Paid ${agentSlug} call ${key} is already reserved`))
        }
      },
    })
  } catch (err) {
    // These two provider codes are only constructed by request validation and missing provider
    // credentials, before an SDK call. A post-dispatch 4xx can lack billed flags too, so never
    // infer an unbilled attempt from those flags alone.
    const rejectedBeforeDispatch =
      isModelProviderError(err) &&
      (err.code === 'unsupported-parameter' || err.code === 'client-unavailable') &&
      !err.ambiguousBilled &&
      !err.billedResponse
    if (err instanceof UnbilledRetrySpendCapBreachError || rejectedBeforeDispatch) {
      await releaseUnbilledAgentCallReceipt(key, requestSha256)
    }
    throw err
  }
  const ciphertext = encryptSecret(JSON.stringify(result), purpose)
  await completeAgentCallReceipt(key, ciphertext)
  return result
}
