export const subtypeReferences = [
  { table: 'topics', columns: ['referral_program_topic_id', 'rewards_program_topic_id'] },
  { table: 'hostname_crawler_configurations', columns: ['referral_program_topic_id'] },
  { table: 'individual_rewards_program_statuses', columns: ['rewards_program_status_topic_id'] },
  { table: 'spending_entries', columns: ['spending_category_topic_id'] },
  { table: 'retailer_countries', columns: ['retailer_topic_id'] },
  {
    table: 'referral_program_topic_link_validation_rule_sets',
    columns: ['referral_program_topic_id'],
  },
  { table: 'user_referral_program_links', columns: ['referral_program_topic_id'] },
  { table: 'individual_rewards_program_point_valuations', columns: ['rewards_program_topic_id'] },
] as const
