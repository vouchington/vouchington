import type { BackgroundHandler } from '@queues/background/types'
import { openAiModerationHandlers } from '@workers/openai-moderation/workers'
import { sesInboundHandlers } from '@workers/ses-inbound/workers'

/** Every handler of every domain. The registry coverage test keeps this in step with the jobs. */
export const BACKGROUND_HANDLERS: readonly BackgroundHandler[] = [
  ...sesInboundHandlers,
  ...openAiModerationHandlers,
]
