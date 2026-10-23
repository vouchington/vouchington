import {
  decodeResult as decode,
  type StructuredDecisionRequest,
  type StructuredDecisionResult,
} from '@vouchington/ai/structured-decisions'
import type { StructuredDecisionTransport } from './types.mts'

export function decodeResult(
  raw: unknown,
  request: StructuredDecisionRequest,
  transport: StructuredDecisionTransport,
  fallbackProvider: string,
): StructuredDecisionResult {
  const modelPattern =
    transport === 'openrouter'
      ? /^typesafe\/jev-1\.13(?:-[A-Za-z0-9.]+)?$/
      : /^(?:typesafe\/)?(?:jev-latest|jev-1\.13(?:\.0)?(?:-[A-Za-z0-9.]+)?)$/
  return decode(raw, request, {
    fallbackProvider,
    isExpectedModel: model => modelPattern.test(model),
    isExpectedProvider: provider => transport !== 'openrouter' || provider === 'TypeSafe',
  })
}
