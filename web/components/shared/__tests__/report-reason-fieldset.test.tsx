import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReportReasonFieldset } from '../report-reason-fieldset'

describe('ReportReasonFieldset', () => {
  it('calls onSelect for every post report reason', () => {
    const onSelect = vi.fn<VitestLooseMock>()

    render(
      <ReportReasonFieldset
        entityType='post'
        reason={null}
        onSelect={onSelect}
      />,
    )

    for (const [label, value] of [
      ['Spam', 'spam'],
      ['Harassment', 'harassment'],
      ['Misinformation', 'misinformation'],
      ['Illegal content', 'illegal_content'],
      ['Vote manipulation', 'vote_manipulation'],
      ['Other', 'other'],
    ] as const) {
      fireEvent.click(screen.getByRole('radio', { name: label }))
      expect(onSelect).toHaveBeenLastCalledWith(value)
    }
  })

  it('hides vote manipulation for non-post reports', () => {
    render(
      <ReportReasonFieldset
        entityType='user'
        reason='spam'
        onSelect={vi.fn<VitestLooseMock>()}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Spam' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'Vote manipulation' })).toBeNull()
  })
})
