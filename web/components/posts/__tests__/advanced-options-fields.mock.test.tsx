import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  AudienceField,
  PostLanguageField,
  VisibilityField,
} from '../post-form/advanced-options-fields'
import type { PostBroadcast, PostPrivacy } from '@/types/posts'

vi.mock(
  import('@/components/ui/select'),
  () =>
    ({
      Select: ({
        onValueChange,
        value,
      }: {
        onValueChange: (value: string) => void
        value: string
      }) => (
        <select
          aria-label='mock select'
          value={value}
          onChange={event => onValueChange(event.target.value)}
        >
          <option value='everyone'>Everyone</option>
          <option value='users'>Users</option>
          <option value='followers'>Followers</option>
          <option value='mutual_followers'>Mutual Followers</option>
          <option value='public'>Public</option>
          <option value='private'>Private</option>
          <option value='auto-detect'>Auto-detect</option>
          <option value='es'>Spanish</option>
        </select>
      ),
      SelectContent: () => null,
      SelectGroup: () => null,
      SelectItem: () => null,
      SelectLabel: () => null,
      SelectTrigger: () => null,
      SelectValue: () => null,
    }) as unknown as typeof import('@/components/ui/select'),
)

describe('advanced post option fields', () => {
  it('sets public privacy when audience changes to everyone', () => {
    const setBroadcast = vi.fn<(broadcast: PostBroadcast) => void>()
    const setPrivacy = vi.fn<(privacy: PostPrivacy) => void>()
    render(
      <AudienceField
        broadcast='users'
        isCommunityPost={false}
        isPrivateCommunityPost={false}
        setBroadcast={setBroadcast}
        setPrivacy={setPrivacy}
      />,
    )

    fireEvent.change(screen.getByLabelText('mock select'), { target: { value: 'everyone' } })

    expect(setBroadcast).toHaveBeenCalledWith('everyone')
    expect(setPrivacy).toHaveBeenCalledWith('public')
  })

  it('sets private privacy when community audience changes to users', () => {
    const setPrivacy = vi.fn<(privacy: 'public' | 'private') => void>()
    render(
      <AudienceField
        broadcast='everyone'
        isCommunityPost
        isPrivateCommunityPost={false}
        setBroadcast={vi.fn<(broadcast: PostBroadcast) => void>()}
        setPrivacy={setPrivacy}
      />,
    )

    fireEvent.change(screen.getByLabelText('mock select'), { target: { value: 'users' } })

    expect(setPrivacy).toHaveBeenCalledWith('private')
  })

  it('passes visibility changes through', () => {
    const setPrivacy = vi.fn<(privacy: PostPrivacy) => void>()
    render(
      <VisibilityField
        isCommunityPost={false}
        privacy='public'
        setPrivacy={setPrivacy}
      />,
    )

    fireEvent.change(screen.getByLabelText('mock select'), { target: { value: 'private' } })

    expect(setPrivacy).toHaveBeenCalledWith('private')
  })

  it('passes content language changes through', () => {
    const setLanguage = vi.fn<(language: string | null) => void>()
    render(
      <PostLanguageField
        language={null}
        setLanguage={setLanguage}
      />,
    )

    fireEvent.change(screen.getByLabelText('mock select'), { target: { value: 'es' } })

    expect(setLanguage).toHaveBeenCalledWith('es')
  })

  it('maps auto-detect language changes to null', () => {
    const setLanguage = vi.fn<(language: string | null) => void>()
    render(
      <PostLanguageField
        language='es'
        setLanguage={setLanguage}
      />,
    )

    fireEvent.change(screen.getByLabelText('mock select'), { target: { value: 'auto-detect' } })

    expect(setLanguage).toHaveBeenCalledWith(null)
  })
})
