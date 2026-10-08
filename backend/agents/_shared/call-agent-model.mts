import { getOpenAITransport } from '@services/ai-usage'
import type {
  ModelCallResult,
  ModelSelection,
  OpenAITransport,
} from '@modules/model-providers/types'
import {
  callRecordingModelUsage,
  type CallRecordingModelUsageParams,
} from './call-recording-model-usage.mts'

/**
 * What an agent's model caller receives besides its prompt. `openaiTransport` is the global
 * OpenAI transport setting, resolved once per call so the spend, background-mode and request
 * decisions all agree; it is never part of an agent entry point's options.
 */
export type AgentModelCall = {
  selection: ModelSelection
  openaiTransport: OpenAITransport
}

/** The seam every migrated agent exposes so tests can replace the real provider call. */
export type AgentModelCaller<Output> = (
  input: string,
  safetyIdentifier: string,
  call: AgentModelCall,
) => Promise<ModelCallResult<Output>>

/**
 * Calls an agent's model on the provider its caller selected and settles the usage ledger for the
 * result, or for a billed answer that failed validation. The agent entry point passes the
 * `{ provider, model }` its service setting holds; the agent has no hidden default.
 */
export function callAgentModel<Output>(
  params: Omit<CallRecordingModelUsageParams, 'openaiTransport'> & {
    input: string
    safetyIdentifier: string
    callModel: AgentModelCaller<Output>
  },
): Promise<ModelCallResult<Output>> {
  const { input, safetyIdentifier, callModel, ...recording } = params
  const openaiTransport = getOpenAITransport()
  return callRecordingModelUsage(
    () => callModel(input, safetyIdentifier, { selection: params.selection, openaiTransport }),
    { ...recording, openaiTransport },
  )
}
