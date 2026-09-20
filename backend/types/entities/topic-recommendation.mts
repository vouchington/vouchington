// Relocated from @services/topic-recommendations/types.mts (pure type, no
// service dependencies) so that backend/queues/ai-agents can reference it directly
// without importing @services/topic-recommendations, which would otherwise
// create an ai-agents -> topic-recommendations workspace cycle. Re-exported
// from the original location for call-site stability.
export type SourceEntityType = 'post'
