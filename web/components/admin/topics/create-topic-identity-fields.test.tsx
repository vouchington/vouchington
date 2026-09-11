import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CreateTopicIdentityFields } from './create-topic-identity-fields'
import type { useAvailabilityCheck } from '@/hooks/use-availability-check'

type Availability = ReturnType<typeof useAvailabilityCheck>

function stubAvailability(): Availability & { onBlurCalls: string[] } {
  const onBlurCalls: string[] = []
  return {
    state: { status: 'idle', conflict: null },
    onBlur: (value: string) => {
      onBlurCalls.push(value)
    },
    reset: () => {},
    onBlurCalls,
  }
}

describe('CreateTopicIdentityFields', () => {
  it('renders both inputs with their data-pw attributes', () => {
    render(
      <CreateTopicIdentityFields
        name='My Topic'
        slug='my-topic'
        onNameChange={() => {}}
        onSlugChange={() => {}}
        nameAvailability={stubAvailability()}
        slugAvailability={stubAvailability()}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue('My Topic')
    expect(screen.getByLabelText('Slug')).toHaveValue('my-topic')
    expect(document.querySelector('[data-pw="create-topic-name-input"]')).not.toBeNull()
    expect(document.querySelector('[data-pw="create-topic-slug-input"]')).not.toBeNull()
  })

  it('wires onChange handlers through', () => {
    const nameChanges: string[] = []
    const slugChanges: string[] = []
    render(
      <CreateTopicIdentityFields
        name=''
        slug=''
        onNameChange={e => nameChanges.push(e.target.value)}
        onSlugChange={e => slugChanges.push(e.target.value)}
        nameAvailability={stubAvailability()}
        slugAvailability={stubAvailability()}
      />,
    )
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'new-slug' } })
    expect(nameChanges).toContain('New Name')
    expect(slugChanges).toContain('new-slug')
  })

  it('triggers availability onBlur with the current value', () => {
    const nameAvailability = stubAvailability()
    const slugAvailability = stubAvailability()
    render(
      <CreateTopicIdentityFields
        name='My Topic'
        slug='my-topic'
        onNameChange={() => {}}
        onSlugChange={() => {}}
        nameAvailability={nameAvailability}
        slugAvailability={slugAvailability}
      />,
    )
    fireEvent.blur(screen.getByLabelText('Name'))
    fireEvent.blur(screen.getByLabelText('Slug'))
    expect(nameAvailability.onBlurCalls).toEqual(['My Topic'])
    expect(slugAvailability.onBlurCalls).toEqual(['my-topic'])
  })
})
