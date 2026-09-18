import { describe, expect, it } from 'vitest'

import type { ClosingIssueReference } from '../closing-refs.mts'
import type { IssueAuditKeepOpenDecision } from '../issue-audit-marker.mts'
import type { PackageJsonReader } from '../removed-scripts.mts'
import {
  buildSupersessionSearchArgs,
  createSupersessionAuditor,
  findSupersessionHits,
  parseAuditDecisions,
  runAdvisorySupersessionSearch,
  validateAuditHits,
  type SupersessionDecision,
  type SupersessionHit,
} from '../supersession.mts'

const REPO = 'vouchington/vouchington'

// None of these fixtures touch a `package.json`, so `parseChangedPackageJsonPaths` always returns
// `[]` and this reader is never actually invoked — it exists only to satisfy the required parameter.
const NO_PACKAGE_JSON: PackageJsonReader = () => Promise.resolve(undefined)

// A minimal unified diff deleting `backend/modules/aws/sns-verification.mts`, mirroring the real
// #8335 patch closely enough that `parseRemovedSurfaces` emits the quoted path as a search term.
const SNS_VERIFICATION_DELETION_PATCH = [
  'diff --git a/backend/modules/aws/sns-verification.mts b/backend/modules/aws/sns-verification.mts',
  'deleted file mode 100644',
  'index 1111111..0000000',
  '--- a/backend/modules/aws/sns-verification.mts',
  '+++ /dev/null',
  '@@ -1,3 +0,0 @@',
  '-export const verify = () => {}',
].join('\n')
const SNS_VERIFICATION_TERM = '"backend/modules/aws/sns-verification.mts"'

// Real data from PR #8335, which removed `backend/modules/aws/sns-verification.mts` and the
// `replayProtection` import path. Both issues surfaced only after merge; they are closed today,
// but were open at #8335's merge time — the shape this fixture pins.
const SNS_VERIFICATION_HIT = {
  number: 7995,
  title: 'Move SES-inbound SNS certificate fetch/verification to a worker (flag-gated)',
  url: 'https://github.com/vouchington/vouchington/issues/7995',
}
const REPLAY_PROTECTION_HIT = {
  number: 8300,
  title: 'Convert SES inbound webhook replay-protection mock to real Valkey integration',
  url: 'https://github.com/vouchington/vouchington/issues/8300',
}

function fakeRunGh(responses: Record<string, Array<typeof SNS_VERIFICATION_HIT>>) {
  return (args: string[]) => {
    const term = args[args.indexOf('--search') + 1]
    return Promise.resolve(JSON.stringify(term !== undefined ? (responses[term] ?? []) : []))
  }
}

function keepOpen(overrides: Partial<IssueAuditKeepOpenDecision>): SupersessionDecision {
  return {
    classification: 'unrelated',
    decision: 'keep-open',
    number: 0,
    reason: '',
    repo: undefined,
    ...overrides,
  }
}

describe('buildSupersessionSearchArgs', () => {
  it('builds one open-state query per term, no in:title', () => {
    expect(buildSupersessionSearchArgs(REPO, 'sns-verification')).toEqual([
      'issue',
      'list',
      '--repo',
      REPO,
      '--search',
      'sns-verification',
      '--state',
      'open',
      '--json',
      'number,title,url',
      '--limit',
      '10',
    ])
  })
})

describe('findSupersessionHits', () => {
  it('finds a superseded issue by its removed-surface term', async () => {
    const runGh = fakeRunGh({ 'sns-verification': [SNS_VERIFICATION_HIT] })
    await expect(findSupersessionHits(runGh, REPO, ['sns-verification'])).resolves.toEqual([
      { matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT },
    ])
  })

  it('finds a second superseded issue by a different removed-surface term', async () => {
    const runGh = fakeRunGh({ replayProtection: [REPLAY_PROTECTION_HIT] })
    await expect(findSupersessionHits(runGh, REPO, ['replayProtection'])).resolves.toEqual([
      { matchedTerm: 'replayProtection', ...REPLAY_PROTECTION_HIT },
    ])
  })

  it('issues zero calls for a PR with no deletions', async () => {
    let calls = 0
    const runGh = (_args: string[]) => {
      calls += 1
      return Promise.resolve('[]')
    }
    await expect(findSupersessionHits(runGh, REPO, [])).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  it('dedupes a hit matched by more than one term, keeping the first matching term', async () => {
    const runGh = fakeRunGh({
      'aws/sns-verification.mts': [SNS_VERIFICATION_HIT],
      'sns-verification': [SNS_VERIFICATION_HIT],
    })
    const hits = await findSupersessionHits(runGh, REPO, [
      'sns-verification',
      'aws/sns-verification.mts',
    ])
    expect(hits).toEqual([{ matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT }])
  })

  it('never surfaces an already-closed originating issue (--state open excludes it)', async () => {
    // Simulates the live behavior verified against the API: once #7995/#8300 were closed, the
    // same `--state open` query that found them pre-merge returns nothing post-merge.
    const runGh = fakeRunGh({ 'sns-verification': [] })
    await expect(findSupersessionHits(runGh, REPO, ['sns-verification'])).resolves.toEqual([])
  })
})

describe('parseAuditDecisions', () => {
  it('combines an existing Closes reference with a keep-open marker', () => {
    const body = [
      'Closes #7995',
      '',
      '<!-- issue-audit: keep-open #8301 because unrelated: keyword match only, no supersession -->',
    ].join('\n')
    expect(parseAuditDecisions(body)).toEqual([
      { decision: 'close', number: 7995 },
      {
        classification: 'unrelated',
        decision: 'keep-open',
        number: 8301,
        reason: 'keyword match only, no supersession',
      },
    ])
  })
})

describe('validateAuditHits', () => {
  it('produces no error when a hit is closed by this PR', () => {
    const hits: SupersessionHit[] = [{ matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT }]
    const closingRefs: ClosingIssueReference[] = [
      { key: '#7995', number: 7995, owner: undefined, repo: undefined },
    ]
    expect(
      validateAuditHits(REPO, hits, [{ decision: 'close', number: 7995 }], closingRefs),
    ).toEqual([])
  })

  it('produces no error for a partial-implementation keep-open (evidence-gated)', () => {
    const hits: SupersessionHit[] = [{ matchedTerm: 'replayProtection', ...REPLAY_PROTECTION_HIT }]
    const decisions = [
      keepOpen({
        classification: 'evidence-gated',
        number: 8300,
        reason: 'only the mock path was removed; the Valkey-backed path still needs this ticket',
      }),
    ]
    expect(validateAuditHits(REPO, hits, decisions, [])).toEqual([])
  })

  it('produces no error for an unrelated keyword hit kept open', () => {
    const hits: SupersessionHit[] = [{ matchedTerm: 'utils', number: 42, title: 'x', url: 'y' }]
    const decisions = [keepOpen({ number: 42, reason: 'coincidental keyword match' })]
    expect(validateAuditHits(REPO, hits, decisions, [])).toEqual([])
  })

  it('reports an undispositioned hit with an actionable hint', () => {
    const hits: SupersessionHit[] = [{ matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT }]
    expect(validateAuditHits(REPO, hits, [], [])).toEqual([
      '#7995 ("Move SES-inbound SNS certificate fetch/verification to a worker (flag-gated)") ' +
        'matches removed surface "sns-verification" and may be superseded by this PR. Add ' +
        '"Closes #7995" if this PR resolves it, or ' +
        '<!-- issue-audit: keep-open #7995 because <classification>: <reason> --> if it should stay open.',
    ])
  })

  it('does not let a cross-repo closing ref with a coincidental number clear a same-repo hit', () => {
    // #7995 is closed by this ref, but in a different repo — the number match is coincidental and
    // must not suppress the hit against THIS repo's #7995 (finding #2's regression).
    const hits: SupersessionHit[] = [{ matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT }]
    const closingRefs: ClosingIssueReference[] = [
      { key: 'other/repo#7995', number: 7995, owner: 'other', repo: 'repo' },
    ]
    const errors = validateAuditHits(REPO, hits, [{ decision: 'close', number: 7995 }], closingRefs)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7995')
  })

  it('lets an explicit same-repo cross-repo-shaped ref clear a hit', () => {
    const hits: SupersessionHit[] = [{ matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT }]
    const closingRefs: ClosingIssueReference[] = [
      { key: `${REPO}#7995`, number: 7995, owner: 'vouchington', repo: 'vouchington' },
    ]
    expect(validateAuditHits(REPO, hits, [], closingRefs)).toEqual([])
  })

  // `keep-open other/repo#7995` names a foreign issue; must not clear a LOCAL hit #7995 — the same
  // coincidental-number guard `closesAuditedRepo` already applies to `Closes`.
  it('does not let a foreign keep-open marker clear a same-numbered local hit', () => {
    const hits: SupersessionHit[] = [{ matchedTerm: 'sns-verification', ...SNS_VERIFICATION_HIT }]
    const decisions = [
      keepOpen({ number: 7995, reason: 'different issue, another repo', repo: 'other/repo' }),
    ]
    const errors = validateAuditHits(REPO, hits, decisions, [])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7995')
  })
})

describe('createSupersessionAuditor', () => {
  it('issues zero gh calls when the patch removes nothing', async () => {
    let calls = 0
    const runGh = (_args: string[]) => {
      calls += 1
      return Promise.resolve('[]')
    }
    const auditor = createSupersessionAuditor(
      runGh,
      REPO,
      'diff --git a/x.mts b/x.mts\n',
      NO_PACKAGE_JSON,
    )
    await expect(auditor('', [])).resolves.toEqual([])
    expect(calls).toBe(0)
  })

  it('reports an undispositioned hit derived from a deleted-file term', async () => {
    const runGh = fakeRunGh({ [SNS_VERIFICATION_TERM]: [SNS_VERIFICATION_HIT] })
    const auditor = createSupersessionAuditor(
      runGh,
      REPO,
      SNS_VERIFICATION_DELETION_PATCH,
      NO_PACKAGE_JSON,
    )
    const errors = await auditor('', [])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('#7995')
    expect(errors[0]).toContain(SNS_VERIFICATION_TERM)
  })

  it('produces no error once the hit is closed by this PR', async () => {
    const runGh = fakeRunGh({ [SNS_VERIFICATION_TERM]: [SNS_VERIFICATION_HIT] })
    const auditor = createSupersessionAuditor(
      runGh,
      REPO,
      SNS_VERIFICATION_DELETION_PATCH,
      NO_PACKAGE_JSON,
    )
    const closingRefs: ClosingIssueReference[] = [
      { key: '#7995', number: 7995, owner: undefined, repo: undefined },
    ]
    await expect(auditor('Closes #7995', closingRefs)).resolves.toEqual([])
  })
})

describe('runAdvisorySupersessionSearch', () => {
  it('issues zero gh calls and returns empty for a patch with no removals', async () => {
    let calls = 0
    const runGh = (_args: string[]) => {
      calls += 1
      return Promise.resolve('[]')
    }
    await expect(
      runAdvisorySupersessionSearch(runGh, REPO, 'diff --git a/x.mts b/x.mts\n', NO_PACKAGE_JSON),
    ).resolves.toBe('')
    expect(calls).toBe(0)
  })

  it('formats a hint for a removed-surface term that matches an open issue', async () => {
    const runGh = fakeRunGh({ [SNS_VERIFICATION_TERM]: [SNS_VERIFICATION_HIT] })
    const hints = await runAdvisorySupersessionSearch(
      runGh,
      REPO,
      SNS_VERIFICATION_DELETION_PATCH,
      NO_PACKAGE_JSON,
    )
    expect(hints).toContain('#7995')
  })

  it('swallows a search failure and returns empty rather than throwing', async () => {
    const runGh = () => Promise.reject(new Error('gh unavailable'))
    await expect(
      runAdvisorySupersessionSearch(runGh, REPO, SNS_VERIFICATION_DELETION_PATCH, NO_PACKAGE_JSON),
    ).resolves.toBe('')
  })
})
