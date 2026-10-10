import { seedUuid } from './common.mts'

export const MEDIA_REPLAY_RECORD_COUNT = 12_000
export const MEDIA_REPLAY_FAILED_COUNT = 3_000
export const MEDIA_REPLAY_PAGE_SIZE = 1_000
export const MEDIA_REPLAY_ACTOR_ID = seedUuid(0, 'fa')
export const MEDIA_REPLAY_NOTICE_ID = seedUuid(0, 'fb')

export function mediaReplayRecordIds(): string[] {
  const ids: string[] = []
  for (let index = 0; index < MEDIA_REPLAY_RECORD_COUNT; index++) ids.push(seedUuid(index, 'fe'))
  return ids
}

export function mediaReplayFailedIds(): string[] {
  return mediaReplayRecordIds().filter((_, index) => index % 4 === 0)
}
