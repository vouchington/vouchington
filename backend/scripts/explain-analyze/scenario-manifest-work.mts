import { COPYRIGHT_DELIVERY_SCENARIO_IDS } from './copyright-delivery-scenario-ids.mts'

export const BOUNDED_WORK_SCENARIOS = [
  'publication-native-slug-page',
  'publication-feed-item-page',
  'publication-sparse-feed-page',
  'publication-typed-receipt-page',
  'publication-cleanup-header-page',
  'publication-cleanup-lock-page',
  ...COPYRIGHT_DELIVERY_SCENARIO_IDS,
  'dispatch-hostname-url-selectivity',
  'dispatch-tier1-url-selectivity',
  'dispatch-tier2-url-selectivity',
  'dispatch-referral-crawl-due-selectivity',
  'dispatch-referral-unfurl-due-selectivity',
  'bloom-repair-window',
  'bloom-repair-capped',
  'bloom-repair-resumed',
  'crawl-hostname-threshold-seek',
  'crawl-hostnames-due',
  'crawl-hostnames-due-capped',
] as const
