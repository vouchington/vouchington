import { buildFollowedSourceCTE } from './followed-source-cte.mts'

export function buildFollowedTopicsCTE(options: Parameters<typeof buildFollowedSourceCTE>[1]) {
  return buildFollowedSourceCTE('topic', options)
}
