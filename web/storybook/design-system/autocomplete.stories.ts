import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { createElement, type ReactElement } from 'react'
import { EntityAutocomplete } from '@/components/shared/entity-autocomplete'
import { AutocompleteShowcase } from './autocomplete-showcase'

interface StoryItem {
  id: string
  label: string
}

interface EntityAutocompleteStoryProps {
  search: (query: string, signal: AbortSignal) => Promise<StoryItem[]>
  getKey: (item: StoryItem) => string
  renderItem: (item: StoryItem) => string
  onSelect: (item: StoryItem, helpers: { setQuery: (query: string) => void }) => void
  placeholder: string
  ariaLabel: string
  emptyText: string
}

const StoryEntityAutocomplete = EntityAutocomplete as (
  props: EntityAutocompleteStoryProps,
) => ReactElement

const meta = {
  title: 'Design System/Autocomplete',
  component: AutocompleteShowcase,
} satisfies Meta<typeof AutocompleteShowcase>

export default meta
type Story = StoryObj<typeof meta>

export const FixtureBacked: Story = {}

export const EntityAutocompleteExample: Story = {
  render: () =>
    createElement(StoryEntityAutocomplete, {
      search: async (query: string) => [
        { id: 'topic-1', label: `${query} rewards` },
        { id: 'topic-2', label: `${query} travel` },
      ],
      getKey: item => item.id,
      renderItem: item => item.label,
      onSelect: (item, { setQuery }) => setQuery(item.label),
      placeholder: 'Search entities...',
      ariaLabel: 'Search entities',
      emptyText: 'No entities found.',
    }),
}
