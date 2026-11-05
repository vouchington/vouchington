import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImportProgressBar } from '../import-progress-bar'

describe('ImportProgressBar', () => {
  it('explains completed follow-limit skips separately from failures', () => {
    render(
      <ImportProgressBar
        progress={{
          batchId: 'import-1',
          completed: 1,
          failed: 1,
          skipped: 2,
          total: 4,
          done: true,
        }}
      />,
    )
    expect(
      screen.getByText(
        'Done. 1 imported, 1 failed, 2 skipped. 2 skipped because the follow limit was reached.',
      ),
    ).toBeVisible()
  })
})
