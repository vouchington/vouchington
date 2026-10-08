import { generateToolTurn } from '@modules/model-providers/tool-turn'
import type { ToolTurnRequest, ToolTurnResult } from '@modules/model-providers/tool-turn-types'
import { getOpenAITransport } from '@services/ai-usage'
import type { AgentModelCall } from './call-agent-model.mts'
import {
  callRecordingModelUsage,
  type CallRecordingModelUsageParams,
} from './call-recording-model-usage.mts'

/** The seam a tool-using agent exposes so tests can replace the real provider call. */
export type AgentToolTurnCaller = (
  request: ToolTurnRequest,
  call: AgentModelCall,
) => Promise<ToolTurnResult>

/** The real provider turn: whichever provider the caller selected, on the global transport. */
export const callProviderToolTurn: AgentToolTurnCaller = (request, call) =>
  generateToolTurn(call.selection, request, { openaiTransport: call.openaiTransport })

/**
 * Runs one turn of a tool-using agent and settles its ledger row like any other agent call: the
 * daily spend cap is checked immediately before dispatch (every turn), a billed turn is recorded
 * against the classifier run that owns it, and a billed turn that is unusable (a refusal, a cut-off
 * or malformed tool call) is recorded too.
 */
export function callAgentToolTurn(
  params: Omit<CallRecordingModelUsageParams, 'openaiTransport'> & {
    request: ToolTurnRequest
    callTurn?: AgentToolTurnCaller
  },
): Promise<ToolTurnResult> {
  const { request, callTurn = callProviderToolTurn, ...recording } = params
  const openaiTransport = getOpenAITransport()
  return callRecordingModelUsage(
    () => callTurn(request, { selection: params.selection, openaiTransport }),
    { ...recording, openaiTransport },
  )
}
