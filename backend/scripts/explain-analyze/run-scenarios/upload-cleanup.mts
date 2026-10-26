import { beginTransaction } from '@data-stores/psql'
import {
  captureUploadCleanupUpper,
  readUploadCleanupPage,
} from '@services/images/cleanup-upload-queries'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  uploadCleanupSeedId,
  uploadCleanupMarkerId,
  UPLOAD_CLEANUP_CUTOFF,
  UPLOAD_CLEANUP_MARKER_TIME,
  UPLOAD_CLEANUP_ELIGIBLE_TIME,
  UPLOAD_CLEANUP_TOTAL_ROWS,
  UPLOAD_CLEANUP_NOISE_ROWS,
  UPLOAD_CLEANUP_ELIGIBLE_ROWS,
  UPLOAD_CLEANUP_PAGE_SIZE,
} from '../seed-data/upload-cleanup-cohort.mts'
import { assertUploadCleanupPopulation } from '../seed-data/upload-cleanup.mts'

const PHASES = ['staged', 'recovery', 'abandonment'] as const
const INDEXES = {
  staged: 'idx_images__staged_source_cleanup',
  recovery: 'idx_images__recoverable_uploads',
  abandonment: 'idx_images__abandoned_uploads',
}

/** Only the production SELECT builders run: no cleanup effects, admissions or cursor writes. */
export async function runUploadCleanupScenarios(): Promise<void> {
  await assertUploadCleanupPopulation()
  for (const phase of PHASES) {
    const upper =
      phase === 'abandonment'
        ? {
            id: uploadCleanupSeedId(UPLOAD_CLEANUP_NOISE_ROWS - 1),
            stagedAt: '2026-07-01T04:00:00.000000Z',
          }
        : {
            id: uploadCleanupSeedId(UPLOAD_CLEANUP_TOTAL_ROWS - 4),
            stagedAt: UPLOAD_CLEANUP_ELIGIBLE_TIME,
          }
    const after = { id: uploadCleanupMarkerId(phase), stagedAt: UPLOAD_CLEANUP_MARKER_TIME }
    for (const kind of ['upper', 'first', 'forward'] as const) {
      const scenario = `upload-cleanup-${phase}-${kind}`
      registerScenarioContract(scenario, {
        seededRows: { images: UPLOAD_CLEANUP_TOTAL_ROWS },
        expectations: [
          { kind: 'usesIndexes', indexes: [INDEXES[phase]], noSort: true },
          {
            kind: 'maxProcessedRows',
            relation: 'images',
            max: kind === 'upper' ? 2 : 2 * (UPLOAD_CLEANUP_PAGE_SIZE + 1),
          },
        ],
      })
      // no-mistakes-disable-next-line query-reached-per-item: fixed phase and cursor shapes require independent production query captures and plan gates
      await runAndCapture(
        scenario,
        async () => {
          await using transaction = await beginTransaction()
          if (kind === 'upper') {
            const captured = await captureUploadCleanupUpper(
              transaction,
              phase,
              UPLOAD_CLEANUP_CUTOFF,
            )
            if (captured?.id !== upper.id || captured.stagedAt !== upper.stagedAt)
              throw new Error(`Unexpected ${phase} upper tuple; representative seed has drifted`)
          } else {
            const rows = await readUploadCleanupPage(
              transaction,
              phase,
              UPLOAD_CLEANUP_CUTOFF,
              { upper, ...(kind === 'forward' ? { after } : {}), done: false },
              UPLOAD_CLEANUP_PAGE_SIZE,
            )
            const first =
              phase === 'abandonment'
                ? 0
                : UPLOAD_CLEANUP_NOISE_ROWS +
                  (phase === 'recovery' ? UPLOAD_CLEANUP_ELIGIBLE_ROWS : 0)
            const markers =
              kind === 'forward'
                ? []
                : phase === 'staged'
                  ? [UPLOAD_CLEANUP_TOTAL_ROWS - 3, UPLOAD_CLEANUP_TOTAL_ROWS - 2]
                  : [UPLOAD_CLEANUP_TOTAL_ROWS - (phase === 'recovery' ? 2 : 1)]
            const expected = [
              ...markers.map(uploadCleanupSeedId),
              ...Array.from({ length: UPLOAD_CLEANUP_PAGE_SIZE + 1 - markers.length }, (_, index) =>
                uploadCleanupSeedId(first + index),
              ),
            ]
            if (JSON.stringify(rows.map(row => row.id)) !== JSON.stringify(expected))
              throw new Error(`Unexpected ${phase} B+1 page; representative seed has drifted`)
          }
          await transaction.rollback()
        },
        undefined,
        kind === 'upper' ? 'captureUploadCleanupUpper' : 'readUploadCleanupPage',
      )
    }
  }
}
