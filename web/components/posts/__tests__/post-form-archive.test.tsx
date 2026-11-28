import { mockDiscussion } from '@/test-helpers/components/posts/post-form.mock-support'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PostForm } from '../post-form'

describe('PostForm archive controls', () => {
  it('does not render archive controls in create mode', () => {
    render(<PostForm postType='discussion' />)

    fireEvent.click(screen.getByText('Advanced'))

    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Unarchive' })).toBeNull()
  })

  it('renders archive controls inside Advanced in edit mode', () => {
    render(
      <PostForm
        postType='discussion'
        post={mockDiscussion}
      />,
    )

    fireEvent.click(screen.getByText('Advanced'))

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument()
  })
})
