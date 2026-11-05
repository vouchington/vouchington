import { LANDING_PAGE_SCENARIO_IDS } from './landing-page-scenario-ids.mts'

export const USER_PROFILE_SCENARIO_IDS = [
  ...LANDING_PAGE_SCENARIO_IDS,
  'individual-card-create',
  'data-request-create',
  'financial-profile-upsert',
  'individual-representative-read',
  'landing-page-create',
  'profile-link-reorder',
  'profile-links',
  'post-and-creator-bookmarks',
] as const
