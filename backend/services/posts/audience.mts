import assert from 'http-assert'
import type { PostBroadcast, PostPrivacy } from './types.mts'

export function assertValidPostAudience(broadcast: PostBroadcast, privacy: PostPrivacy) {
  assert(
    !(broadcast === 'everyone' && privacy === 'private'),
    422,
    'Posts for everyone must be public',
  )
}
