const providerLookups = [
  ['stripe_event_types', 'Stripe event types'],
  ['amazon_ses_bounce_subtypes', 'SES bounce subtypes'],
  ['openai_service_tiers', 'OpenAI service tiers'],
  ['identity_document_types', 'Identity provider document types'],
] as const

export const PROVIDER_LOOKUP_BOUNDS = new Map<string, string>(
  providerLookups.map(([table, vocabulary]) => [
    table,
    `Distinct ${vocabulary} names, bounded by the upstream vocabulary rather than event traffic.`,
  ]),
)

export const PROVIDER_LOOKUP_ID_POLICIES = new Map(
  providerLookups.map(([table, vocabulary]) => [
    table,
    {
      policy: 'natural-or-provider' as const,
      rationale: `The provider owns this exact ${vocabulary} lookup key.`,
    },
  ]),
)
