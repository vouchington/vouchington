import type { ToolTurnOutput } from '@vouchington/ai/providers'
import type { ModelCallResult } from './types.mts'

export type ToolTurnResult = ModelCallResult<ToolTurnOutput>
