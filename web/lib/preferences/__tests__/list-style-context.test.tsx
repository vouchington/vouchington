import { describe, it, expect, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { ListStyleProvider } from '../list-style-context'
import { useListStyle } from '../use-list-style'

function ListStyleConsumer({
  onRender,
}: {
  onRender: (v: ReturnType<typeof useListStyle>) => void
}) {
  const value = useListStyle()
  onRender(value)
  return null
}

describe('ListStyleProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('initializes with default list style when localStorage is empty', () => {
    let captured: ReturnType<typeof useListStyle> | null = null
    render(
      <ListStyleProvider>
        <ListStyleConsumer onRender={v => (captured = v)} />
      </ListStyleProvider>,
    )
    expect(captured!.listStyle).toBe('card')
  })

  it('setListStyle updates state', () => {
    let captured: ReturnType<typeof useListStyle> | null = null
    render(
      <ListStyleProvider>
        <ListStyleConsumer onRender={v => (captured = v)} />
      </ListStyleProvider>,
    )
    act(() => captured!.setListStyle('compact'))
    expect(captured!.listStyle).toBe('compact')
  })

  it('setListStyle writes to localStorage', () => {
    let captured: ReturnType<typeof useListStyle> | null = null
    render(
      <ListStyleProvider>
        <ListStyleConsumer onRender={v => (captured = v)} />
      </ListStyleProvider>,
    )
    act(() => captured!.setListStyle('compact'))
    expect(localStorage.getItem('list-style')).toBe('compact')
  })

  it('syncs state from localStorage on mount', () => {
    localStorage.setItem('list-style', 'compact')
    let captured: ReturnType<typeof useListStyle> | null = null
    render(
      <ListStyleProvider>
        <ListStyleConsumer onRender={v => (captured = v)} />
      </ListStyleProvider>,
    )
    expect(captured!.listStyle).toBe('compact')
  })

  it('uses default when localStorage has invalid value', () => {
    localStorage.setItem('list-style', 'invalid')
    let captured: ReturnType<typeof useListStyle> | null = null
    render(
      <ListStyleProvider>
        <ListStyleConsumer onRender={v => (captured = v)} />
      </ListStyleProvider>,
    )
    expect(captured!.listStyle).toBe('card')
  })
})
