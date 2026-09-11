# TypeScript Standards reference

[Back to TypeScript Standards](typescript-standards.md)

## Encoding Invariants Structurally

**Encode invariants in code, not comments. A comment is a weak guardian.**

A comment can be deleted without breaking anything — so agents, bots, and reviewers delete
it, then "fix" the code it was protecting. The resulting fix→revert oscillation costs a push
and a full CI run per cycle. The durable fix is a guardian that _breaks when violated_:

| Guardian             | How it enforces the invariant                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**             | A self-describing name makes intent clear at the call site without requiring readers to trace through a comment.                                                                          |
| **Type / signature** | Change the signature so the bad state is _unrepresentable_. If the parameter type excludes the bad input, the function literally cannot be misused.                                       |
| **Test**             | A regression test that exercises the counter-intuitive case turns a silent mis-"fix" into a red CI. The test breaks the moment someone adds the "obvious" filter that shouldn't be there. |

Reserve `//` comments for _why_ that genuinely cannot be encoded structurally: external
constraints, non-obvious tradeoffs, issue links.

### Worked examples from this codebase

**Signature change — `isPublicHostname(hostname: string)` (was `isPublicHttpUrlHostname(url: URL)`)**

Bots kept adding port-based filtering because the old signature accepted a full `URL`, making
the port accessible. The fix: accept only the `hostname` string. The port is now physically
absent — the function _cannot_ inspect it, so the invariant is structurally guaranteed without
any comment.

**Regression test — `findExistingFeed*` spans all topic lifecycle states**

`findExistingFeedByUrlId` and `findExistingFeedByUrl` deliberately omit the active-topic
filter (`deleted_at IS NULL AND merged_into_topic_id IS NULL`) because dedup lookups must
find feeds whose topic was later merged or soft-deleted. Bots pattern-match the bare JOIN and
add the filter — silently causing false-negative dedup and unique violations. The guardian is a
regression test that creates a feed, soft-deletes / merges its topic, and asserts the lookup
still returns the feed. That test fails the moment the "fix" is applied, turning silent
oscillation into a red CI.

## Related

- Backend rules: [../../../backend/CLAUDE.md](../../../backend/CLAUDE.md)
- Web rules: [../../../web/CLAUDE.md](../../../web/CLAUDE.md)
- Shared types: [../../../backend/types/README.md](../../../backend/types/README.md)
- API types: [../../../backend/api/CLAUDE.md](../../../backend/api/CLAUDE.md)
- ts-shared rules: [../../../ts-shared/CLAUDE.md](../../../ts-shared/CLAUDE.md)
