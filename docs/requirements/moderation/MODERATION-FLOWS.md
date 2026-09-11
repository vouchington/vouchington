# Moderation Flows

## Contents

- <a id="overview-and-subsystem-map"></a>[Overview and Subsystem Map](reference-moderation-flows-overview.md)
- <a id="native-client-capability-boundary-pipeline-diagram-and-post-clearance-gate"></a>[Native Client Capability Boundary, Pipeline Diagram, and Post Clearance Gate](reference-moderation-flows-native-client-capability-boundary.md)
- <a id="spam-detection-and-openai-omni-moderation"></a>[Spam Detection and OpenAI Omni Moderation](reference-moderation-flows-2-spam-detection.md)
- <a id="4-llm-agent-moderation"></a>[4. LLM Agent Moderation](reference-moderation-flows-4-llm-agent-moderation.md)
- <a id="5-community-moderation"></a>[5. Community Moderation](reference-moderation-flows-5-community-moderation.md)
- <a id="user-reports-vote-integrity-user-suspension-domain-and-hostname-blocking-moderator-operations-and-related-documentation"></a>[User Reports, Vote Integrity, User Suspension, Domain and Hostname Blocking, Moderator Operations, and Related Documentation](reference-moderation-flows-6-user-reports.md)
- <a id="public-documentation"></a>[Public Documentation](reference-moderation-flows-public-documentation.md)

## Paid Transparency Projection

The paid transparency API is an aggregate release, not a moderation queue or a community record
feed. It applies the shared 48-hour delay, cohort-of-20 suppression, and nearest-five rounding
before data leaves `@services/moderation-analytics`; see [Moderation Analytics](./MODERATION-ANALYTICS.md).
