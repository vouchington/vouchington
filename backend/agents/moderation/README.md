# Moderation (agents)

This agent handles OpenAI API interactions for LLM-based moderation and content generation.

## Moderator (Agents)

- `self-promotion`: checks if the post is about a user promoting their own company, project, etc. If so, tags the post as `self-promotion` and moves it to the review queue.
  - Does not need to re-run if the post was already tagged as `self-promotion`, even after an edit is made to the post.
- `marketplace`: checks if the post is asking to trade, buy, or sell something or a service (e.g. buy rewards points, sell a service) and moves it to the review queue.
  - Tags:
    - `buying` - if the post is about buying something
    - `selling` - if the post is about selling something
    - `trade` - if the post is about trading something
    - `for-hire` - if the post is about getting hired
    - `hiring` - if the post is about hiring someone
  - Does not need to re-run if the post was already tagged with a topic above
- `ai-generated`: checks whether post text is likely AI-generated.
  - Current implementation uses the local `is-it-slop` detector, not an LLM call.
  - If flagged, tags the post as `ai-generated` and moves it to the review queue.
  - Store the detector confidence score and threshold in `agent_moderations.results`.
- `politics-averse`: checks for partisan political opinion, campaign-style advocacy, or unsupported political claims.
  - Allows factual news/event discussion.
  - Allows thoughtful political analysis only when claims are grounded in reputable sources.
  - Uses the `get_domain_ratings` tool to inspect linked domains and RSS-source topic metrics when source credibility matters.
  - If flagged, tags the post as `political` and moves it to the review queue.
- `click-bait`: checks whether a title or image is intentionally misleading for clicks.
  - If flagged, tags the post as `click-bait`.
- `vague-post`: checks whether a post lacks enough context to be useful.
  - If flagged, tags the post as `vague-post`.
- `shit-post`: checks whether a post is low-effort noise without useful substance.
  - If flagged, tags the post as `shit-post`.

## Acceptance Criteria

### LLM Moderation

- Run custom LLM-based moderation on posts using configured moderators
- Support multiple moderation prompts and moderators
- Store moderation results and metadata in database, including an election-backed `election_id`
- Check if moderation already exists before running (avoid duplicate work)
- Support configurable moderation options
- Restrict moderation review and moderation quality voting to administrators
- Persist moderation results in `agent_moderations` so they appear in the existing admin moderation UI/API

### Moderation Process

1. Check if moderation already exists for the post
2. Run configured moderator on post content
3. Insert moderation results with metadata and attached moderation election
4. Support admin-only good/bad voting on stored moderation results
5. Support upsert operations for moderation updates

Moderator agents must not write public post votes. Flagged content is handled through tags,
clearance status, and review queues so official/system accounts do not influence community scores.

## Related

- System: [../../queues/ai-agents/](../../queues/ai-agents/) - AI agents job queue
- Posts Service: [../../services/posts/CLAUDE.md](../../services/posts/CLAUDE.md)
- OpenAI Moderation: [../../services/openai-moderation/README.md](../../services/openai-moderation/README.md)
- Parent: [../../CLAUDE.md](../../CLAUDE.md)
