# @services/moderation-cases

Unified moderation case ledger. A **moderation case** groups all stages of a single moderation
incident for one entity — report(s), AI judgement(s), enforcement action(s), and appeal(s) —
via a shared `case_id`.

## Data model

`moderation_cases` — one row per incident per entity. At most one **open** case (`resolved_at IS NULL`)
per entity at a time, enforced by per-entity-type partial unique indexes. A case opens at the first
moderation signal (report or proactive judgement); it closes once all pending reports and pending
appeals for the entity are resolved.

Five tables carry a `case_id FK → moderation_cases(id)`:

| Table                          | Role             |
| ------------------------------ | ---------------- |
| `moderation_reports`           | Trigger signal   |
| `moderation_report_judgements` | AI analysis      |
| `user_warnings`                | Enforcement      |
| `community_bans`               | Enforcement      |
| `moderation_appeals`           | Appellant review |

## Usage

```typescript
import {
  openOrGetOpenCase,
  findOpenCaseForEntity,
  resolveCase,
  maybeResolveCase,
  getCaseById,
  getCaseTrace,
} from '@services/moderation-cases'

// Open or join an existing open case for an entity
const caseId = await openOrGetOpenCase({ entityType: 'user', entityId: userId })

// Get the full trace: case + reports + judgements + enforcement + appeals
const trace = await getCaseTrace(caseId)

// Close a case when all pending work is done
await maybeResolveCase(caseId, staffUserId)
```

See also: `@services/moderation-appeals` which exports `getAppealCaseTrace(appealId)` — the
restored appeal → originating-report hop.
