'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { TagAutocomplete } from '@/components/tags/tag-autocomplete'
import { UserAutocomplete } from '@/components/users/user-autocomplete'
import { PostAutocomplete } from '@/components/posts/post-autocomplete'
import { createAutocompleteFetch } from './autocomplete-fixtures'

interface AutocompleteFetchFixture {
  fixtureFetch: typeof fetch
  originalFetchKey: symbol
}

const autocompleteFetchFixtures: AutocompleteFetchFixture[] = []

function AutocompleteFixtureProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const fetchOwner = window as unknown as Window & Record<symbol, typeof fetch | undefined>
    const originalFetchKey = Symbol('storybook-original-fetch')
    fetchOwner[originalFetchKey] = window.fetch
    const entry: AutocompleteFetchFixture = {
      fixtureFetch: window.fetch,
      originalFetchKey,
    }
    entry.fixtureFetch = createAutocompleteFetch((input, init) => {
      if (fetchOwner[entry.originalFetchKey] === undefined) {
        throw new Error('Original fetch is unavailable')
      }
      return fetchOwner[entry.originalFetchKey]!(input, init)
    })
    autocompleteFetchFixtures.push(entry)
    window.fetch = entry.fixtureFetch
    return () => {
      const entryIndex = autocompleteFetchFixtures.indexOf(entry)
      if (entryIndex === -1) return

      const originalFetch = fetchOwner[entry.originalFetchKey]
      fetchOwner[entry.originalFetchKey] = undefined
      autocompleteFetchFixtures.splice(entryIndex, 1)
      for (const laterEntry of autocompleteFetchFixtures.slice(entryIndex)) {
        if (fetchOwner[laterEntry.originalFetchKey] === entry.fixtureFetch) {
          fetchOwner[laterEntry.originalFetchKey] = originalFetch
        }
      }

      if (window.fetch === entry.fixtureFetch) {
        window.fetch =
          autocompleteFetchFixtures.at(-1)?.fixtureFetch ?? originalFetch ?? window.fetch
      }
    }
  }, [])

  return children
}

export function AutocompleteShowcase() {
  const [topicId, setTopicId] = useState<string | null>(null)
  const [topicLabel, setTopicLabel] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [userLabel, setUserLabel] = useState('')
  const [postId, setPostId] = useState<string | null>(null)
  const [postLabel, setPostLabel] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])

  return (
    <AutocompleteFixtureProvider>
      <main className='min-h-screen bg-background p-6 text-foreground'>
        <div className='mx-auto flex max-w-5xl flex-col gap-8'>
          <div className='flex flex-col gap-4'>
            <h2 className='text-lg font-semibold'>Topic Autocomplete</h2>
            <div className='max-w-sm'>
              <TopicAutocomplete
                value={topicId}
                label={topicLabel}
                onChange={(id, name) => {
                  setTopicId(id)
                  setTopicLabel(name)
                }}
              />
            </div>
            {topicId && (
              <p className='text-sm text-muted-foreground'>
                Selected: {topicLabel} ({topicId})
              </p>
            )}
          </div>

          <div className='flex flex-col gap-4'>
            <h2 className='text-lg font-semibold'>Tag Autocomplete (Topics)</h2>
            <div className='max-w-sm'>
              <TagAutocomplete
                objectType='topic'
                onSelect={id => setSelectedTagIds(ids => [...ids, id])}
              />
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            <h2 className='text-lg font-semibold'>Tag Autocomplete (Posts)</h2>
            <div className='max-w-sm'>
              <TagAutocomplete
                objectType='post'
                onSelect={id => setSelectedTagIds(ids => [...ids, id])}
              />
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            <h2 className='text-lg font-semibold'>Tag Autocomplete (URLs)</h2>
            <div className='max-w-sm'>
              <TagAutocomplete
                objectType='url'
                onSelect={id => setSelectedTagIds(ids => [...ids, id])}
              />
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            <h2 className='text-lg font-semibold'>User Autocomplete</h2>
            <div className='max-w-sm'>
              <UserAutocomplete
                value={userId}
                label={userLabel}
                onChange={(id, username) => {
                  setUserId(id)
                  setUserLabel(username)
                }}
              />
            </div>
            {userId && (
              <p className='text-sm text-muted-foreground'>
                Selected: {userLabel} ({userId})
              </p>
            )}
          </div>

          <div className='flex flex-col gap-4'>
            <h2 className='text-lg font-semibold'>Post Autocomplete</h2>
            <div className='max-w-sm'>
              <PostAutocomplete
                value={postId}
                label={postLabel}
                onChange={(id, title) => {
                  setPostId(id)
                  setPostLabel(title)
                }}
              />
            </div>
            {postId && (
              <p className='text-sm text-muted-foreground'>
                Selected: {postLabel} ({postId})
              </p>
            )}
          </div>

          {selectedTagIds.length > 0 && (
            <p className='text-sm text-muted-foreground'>
              Selected tags: {selectedTagIds.join(', ')}
            </p>
          )}
        </div>
      </main>
    </AutocompleteFixtureProvider>
  )
}
