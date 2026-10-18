import { defineQueryContract, queryEnum } from '@vouchington/pagination'

export const userProfileQueryContract = defineQueryContract({
  include_bio: queryEnum(['0', '1'] as const),
})
