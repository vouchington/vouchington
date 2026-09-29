# Dispute Resolution Agent

Source entrypoint: [backend/agents/dispute-resolution/README.md](../../../../../backend/agents/dispute-resolution/README.md)

AI agent that drafts resolution recommendations for review disputes through OpenRouter's
OpenResponses-compatible structured-output API. All outputs require human moderator approval before
delivery. OpenRouter responses settle usage directly from terminal provider metadata rather than
using the direct OpenAI background-response reconciler.
