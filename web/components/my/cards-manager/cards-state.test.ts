import { describe, expect, it } from 'vitest'
import { getAuthorizedUserParentOptions, mergeCardPages } from './cards-state'
import type { IndividualCard } from '@/types/my'

function makeCard(id: string, overrides: Partial<IndividualCard> = {}): IndividualCard {
  return {
    id,
    card_id: `topic-${id}`,
    opened_on: null,
    closed_on: null,
    received_sign_up_bonus_on: null,
    credit_limit: null,
    is_authorized_user: false,
    authorized_user_of_id: null,
    note: null,
    card: { id: `topic-${id}`, name: `Card ${id}`, slug: `card-${id}` },
    authorized_user_of_card: null,
    ...overrides,
  }
}

const terminalPageInfo = {
  has_next_page: false,
  start_cursor: null,
  end_cursor: null,
}

describe('payment card list state', () => {
  it('flattens pages in ID order and deduplicates repeated cards', () => {
    const original = makeCard('b', { note: 'original' })
    const repeated = makeCard('b', { note: 'newer page' })
    const cards = mergeCardPages(
      [
        { results: [original], page_info: terminalPageInfo },
        { results: [makeCard('c'), makeCard('a'), repeated], page_info: terminalPageInfo },
      ],
      { upserts: new Map(), deletedIds: new Set() },
    )

    expect(cards.map(card => card.id)).toEqual(['a', 'b', 'c'])
    expect(cards[1]?.note).toBe('newer page')
  })

  it('applies successful upserts and delete tombstones over paginated results', () => {
    const cards = mergeCardPages(
      [{ results: [makeCard('a'), makeCard('b')], page_info: terminalPageInfo }],
      {
        upserts: new Map([
          ['b', makeCard('b', { note: 'updated' })],
          ['c', makeCard('c')],
        ]),
        deletedIds: new Set(['a']),
      },
    )

    expect(cards.map(card => [card.id, card.note])).toEqual([
      ['b', 'updated'],
      ['c', null],
    ])
  })

  it('clears child parent references after the parent is deleted', () => {
    const parent = makeCard('parent')
    const child = makeCard('child', {
      is_authorized_user: true,
      authorized_user_of_id: parent.id,
      authorized_user_of_card: {
        id: parent.id,
        opened_on: null,
        closed_on: null,
        card: parent.card,
      },
    })
    const cards = mergeCardPages([{ results: [parent, child], page_info: terminalPageInfo }], {
      upserts: new Map(),
      deletedIds: new Set([parent.id]),
    })

    expect(cards).toEqual([
      expect.objectContaining({
        id: child.id,
        is_authorized_user: true,
        authorized_user_of_id: null,
        authorized_user_of_card: null,
      }),
    ])
  })

  it('retains the hydrated current parent when it is closed or outside loaded pages', () => {
    const child = makeCard('child', {
      authorized_user_of_id: 'parent',
      authorized_user_of_card: {
        id: 'parent',
        opened_on: '2020-01-01',
        closed_on: '2024-01-01',
        card: { id: 'topic-parent', name: 'Named parent', slug: 'named-parent' },
      },
    })

    expect(getAuthorizedUserParentOptions(child, [child], 'parent')).toEqual([
      child.authorized_user_of_card,
    ])
  })

  it('excludes the edited card and other closed cards from parent choices', () => {
    const child = makeCard('child')
    const currentClosed = makeCard('current', { closed_on: '2024-01-01' })
    const otherClosed = makeCard('other', { closed_on: '2024-02-01' })
    const open = makeCard('open')

    expect(
      getAuthorizedUserParentOptions(
        child,
        [child, currentClosed, otherClosed, open],
        'current',
      ).map(option => option.id),
    ).toEqual(['current', 'open'])
  })
})
