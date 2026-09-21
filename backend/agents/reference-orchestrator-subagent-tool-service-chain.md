# Orchestrator → Subagent → Tool → Service Chain

[Back to Agents Architecture](README.md#orchestrator--subagent--tool--service-chain)

```
User message
    │
    ▼
chat (orchestrator)          5 tools, max 5 iterations
    ├── run_research_agent   ← "tell me about X" (13 tools, max 10 iter)
    ├── run_profile_agent    ← "update my wallet" (7 tools, max 8 iter)
    ├── run_discovery_agent  ← "what's trending?" (5 tools, max 6 iter)
    ├── search_topics        ← quick topic lookup (direct)
    └── get_my_profile       ← quick profile check (direct)

Each subagent calls tools, which call services:
    run_research_agent → search_posts → services/posts/search
    run_discovery_agent → get_trending_topics → services/trending-topics/get-trending-topics
    run_profile_agent → get_my_cards / manage_my_cards → services/my-cards
```
