/**
 * Factory for creating subagent tools — tools whose executors internally run a full
 * runToolLoop rather than calling a service directly.
 *
 * Use createSubagentTool() instead of hand-rolling subagent tools. The factory enforces:
 * - Child agentic run creation (with parent_agentic_run_id for observability)
 * - Real-time progress events via an async generator executor (yields SubagentStepEvent)
 * - AbortSignal propagation to the inner runToolLoop
 * - Consistent error handling and run status updates
 *
 * By convention, all tools created by this factory have schema names starting with `run_`.
 * Tools with a `run_*` name must use this factory; automated replacement coverage for
 * that inverse check is tracked in the static-analysis migration milestone.
 */

import { runToolLoopStreaming } from './run-tool-loop-streaming.mts'
import { DEFAULT_AGENT_MODEL } from './models.mts'
import { buildAgentTools } from './build-agent-tools.mts'
import {
  createConversationMessageAgenticRun,
  updateConversationMessageAgenticRunOutput,
  updateConversationMessageAgenticRunError,
  createRunEventWriter,
} from '@services/conversations-messages'
import type { ConversationMessageAgenticRunTerminationReason } from '@services/conversations-messages/types'
import type { BasicUser } from '@services/users/types'
import onError from '@modules/on-error'
import type { SubagentStepEvent } from './subagent-types.mts'
import type {
  SubagentResult,
  SubagentToolConfig,
  SubagentToolCurryArgs,
  SubagentTool,
} from './subagent-tool-types.mts'

export type { SubagentStepEvent }
export type { SubagentResult, SubagentToolConfig, SubagentToolCurryArgs, SubagentTool }

/** Creates a subagent tool that delegates to a full runToolLoop internally. */
export function createSubagentTool<TArgs>(config: SubagentToolConfig<TArgs>): SubagentTool<TArgs> {
  const {
    name,
    description,
    parameters,
    agentName,
    systemPrompt,
    maxIterations,
    toolEntries,
    getInput,
    serviceTier,
    maxRetries,
  } = config

  return {
    schema: {
      name,
      type: 'function',
      description,
      parameters,
      strict: null,
    },
    function: (
      currentUser: BasicUser,
      conversationId: string,
      conversationMessageId: string,
      parentAgenticRunId: string,
      signal: AbortSignal | undefined,
    ) =>
      async function* (args: TArgs): AsyncGenerator<SubagentStepEvent, SubagentResult> {
        const input = await getInput(args)
        const { agentTools: tools } = buildAgentTools(currentUser, toolEntries)

        const childRun = await createConversationMessageAgenticRun({
          conversationId,
          conversationMessageId,
          modelName: DEFAULT_AGENT_MODEL,
          modelProvider: 'openai',
          input: { agent: agentName, task: input },
          parentAgenticRunId,
        })

        const writeRunEvent = createRunEventWriter(childRun.id)
        let stepCount = 0

        try {
          const gen = runToolLoopStreaming({
            model: DEFAULT_AGENT_MODEL,
            instructions: systemPrompt,
            tools,
            input,
            maxIterations,
            safetyIdentifier: currentUser.id,
            // Prefixed to avoid colliding with the ledger slug of a top-level agent of the same
            // conceptual name invoked outside a subagent tool (e.g. research-agent/respond.mts).
            agentSlug: `subagent-${agentName}`,
            signal,
            maxRetries,
            writeRunEvent,
            extraParams: serviceTier != null ? { service_tier: serviceTier } : {},
          })

          let step = await gen.next()
          while (!step.done) {
            if (step.value.type === 'tool_call') {
              stepCount++
              yield { type: 'subagent_step', agent_name: agentName, tool_name: step.value.name }
            } else if (step.value.type === 'text') {
              yield { type: 'subagent_text', agent_name: agentName, content: step.value.content }
            }
            step = await gen.next()
          }

          const { text, iterations, terminationReason } = step.value

          await updateConversationMessageAgenticRunOutput(
            childRun.id,
            { response: text, iterations },
            terminationReason as Exclude<ConversationMessageAgenticRunTerminationReason, 'error'>,
          )

          return { summary: text, steps: stepCount }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))

          // Treat user-initiated aborts as a clean stall rather than a failed run.
          if (err.name === 'AbortError' || err.name === 'APIUserAbortError') {
            await updateConversationMessageAgenticRunOutput(
              childRun.id,
              { response: null, iterations: 0 },
              'stalled',
            )
            return { summary: null, steps: stepCount }
          }

          onError(err)
          await updateConversationMessageAgenticRunError(childRun.id, { error: err.message })
          return { summary: null, steps: stepCount }
        }
      },
  }
}
