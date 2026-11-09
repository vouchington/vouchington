import { listAcceptedCopyrightNotices } from '@services/copyright-notices/read-models'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS,
  COPYRIGHT_ACCEPTED_PAGE_NOTICE_COUNT,
  COPYRIGHT_ACCEPTED_PAGE_TARGETS_PER_NOTICE,
  COPYRIGHT_ACCEPTED_PAGE_TIMESTAMP,
  cleanupCopyrightAcceptedPages,
  seedCopyrightAcceptedPages,
} from '../seed-data/copyright-accepted-pages.mts'

const LIMIT = 5
const SELECTED_ROWS = LIMIT + 1
// The development seed contributes two cases/targets before this independent fixture.
const NOTICE_ROWS = COPYRIGHT_ACCEPTED_PAGE_NOTICE_COUNT + 2
const TARGET_ROWS =
  COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS.length * COPYRIGHT_ACCEPTED_PAGE_TARGETS_PER_NOTICE + 2

export async function runCopyrightAcceptedPageScenarios(): Promise<void> {
  await seedCopyrightAcceptedPages()
  try {
    await captureCopyrightAcceptedPages()
  } finally {
    await cleanupCopyrightAcceptedPages()
  }
}

async function captureCopyrightAcceptedPages(): Promise<void> {
  registerPage('copyright-accepted-notices-first')
  let after: { timestamp: string; id: string } | undefined
  await runAndCapture('copyright-accepted-notices-first', async () => {
    const page = await listAcceptedCopyrightNotices({ limit: LIMIT })
    assertPage(page, COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS.slice(0, LIMIT))
    const last = page.notices.at(-1)!
    after = { timestamp: last.cursor_accepted_at, id: last.id }
  })
  if (!after) throw new Error('Accepted notice first page did not supply a continuation')

  registerPage('copyright-accepted-notices-after')
  await runAndCapture('copyright-accepted-notices-after', async () => {
    const page = await listAcceptedCopyrightNotices({ limit: LIMIT, after })
    assertPage(page, COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS.slice(LIMIT, LIMIT * 2))
  })

  registerScenarioContract('copyright-accepted-notices-empty', {
    allowEmptyResult: true,
    expectations: [
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: NOTICE_ROWS },
      { kind: 'maxProcessedRows', relation: 'copyright_notice_targets', max: 0 },
    ],
  })
  await runAndCapture('copyright-accepted-notices-empty', async () => {
    const page = await listAcceptedCopyrightNotices({
      limit: LIMIT,
      after: {
        timestamp: '0001-01-01T00:00:00.000000Z',
        id: COPYRIGHT_ACCEPTED_PAGE_ELIGIBLE_IDS[0]!,
      },
    })
    if (page.notices.length !== 0 || page.hasNextPage)
      throw new Error('Accepted notice empty cursor returned another page')
  })
}

function registerPage(id: string): void {
  registerScenarioContract(id, {
    expectations: [
      // Without an acceptance-order index, selection may walk the complete case fixture.
      { kind: 'maxProcessedRows', relation: 'copyright_notices', max: NOTICE_ROWS },
      // The planner may hash target existence once; only page cases get full target counts.
      {
        kind: 'maxProcessedRows',
        relation: 'copyright_notice_targets',
        max: TARGET_ROWS + SELECTED_ROWS * COPYRIGHT_ACCEPTED_PAGE_TARGETS_PER_NOTICE,
      },
    ],
  })
}

function assertPage(
  page: Awaited<ReturnType<typeof listAcceptedCopyrightNotices>>,
  expectedIds: readonly string[],
): void {
  if (
    !page.hasNextPage ||
    page.notices.length !== LIMIT ||
    page.notices.some(
      (notice, index) =>
        notice.id !== expectedIds[index] ||
        notice.target_count !== COPYRIGHT_ACCEPTED_PAGE_TARGETS_PER_NOTICE ||
        notice.cursor_accepted_at !== COPYRIGHT_ACCEPTED_PAGE_TIMESTAMP,
    )
  )
    throw new Error('Accepted notice page changed count, tie order, or empty-target eligibility')
}
