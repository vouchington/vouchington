import { buildFollowedSourceCTE } from './followed-source-cte.mts'

export function buildFollowedRssFeedsCTE(options: Parameters<typeof buildFollowedSourceCTE>[1]) {
  return buildFollowedSourceCTE('feed', options)
}
