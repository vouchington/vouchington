import { describe, it, expect } from 'vitest'
import {
  KEYBOARD_SHORTCUTS,
  MODERATION_QUEUE_SHORTCUTS,
  isInputTarget,
  formatShortcut,
} from '@/lib/keyboard-shortcuts'

describe('KEYBOARD_SHORTCUTS', () => {
  it('contains entries for search, sidebar, settings, aside, and shortcuts-help', () => {
    const ids = KEYBOARD_SHORTCUTS.map(s => s.id)
    expect(ids).toContain('search')
    expect(ids).toContain('sidebar')
    expect(ids).toContain('settings')
    expect(ids).toContain('aside')
    expect(ids).toContain('shortcuts-help')
    expect(ids).toContain('moderation-select')
  })

  it('contains scoped moderation queue shortcuts', () => {
    expect(MODERATION_QUEUE_SHORTCUTS.map(s => s.id)).toEqual([
      'moderation-next',
      'moderation-previous',
      'moderation-approve',
      'moderation-remove-review',
      'moderation-dismiss',
      'moderation-select-active',
      'moderation-help',
    ])
  })

  it('search uses key k with meta modifier', () => {
    const shortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'search')!
    expect(shortcut.key).toBe('k')
    expect(shortcut.modifier).toBe('meta')
  })

  it('sidebar uses key / with meta modifier', () => {
    const shortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'sidebar')!
    expect(shortcut.key).toBe('/')
    expect(shortcut.modifier).toBe('meta')
  })

  it('settings uses key . with meta modifier', () => {
    const shortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'settings')!
    expect(shortcut.key).toBe('.')
    expect(shortcut.modifier).toBe('meta')
  })

  it('shortcuts-help uses ? key with no modifier', () => {
    const shortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'shortcuts-help')!
    expect(shortcut.key).toBe('?')
    expect(shortcut.modifier).toBe('none')
  })

  it(String.raw`aside uses key \ with meta modifier`, () => {
    const shortcut = KEYBOARD_SHORTCUTS.find(s => s.id === 'aside')!
    expect(shortcut.key).toBe('\\')
    expect(shortcut.modifier).toBe('meta')
  })
})

describe('isInputTarget', () => {
  function makeEvent(target: HTMLElement | null): KeyboardEvent {
    const event = new KeyboardEvent('keydown')
    Object.defineProperty(event, 'target', { value: target, configurable: true })
    return event
  }

  it('returns true for INPUT', () => {
    expect(isInputTarget(makeEvent(document.createElement('input')))).toBe(true)
  })

  it('returns true for TEXTAREA', () => {
    expect(isInputTarget(makeEvent(document.createElement('textarea')))).toBe(true)
  })

  it('returns true for SELECT', () => {
    expect(isInputTarget(makeEvent(document.createElement('select')))).toBe(true)
  })

  it('returns true for contenteditable element', () => {
    const target = document.createElement('div')
    target.contentEditable = 'true'
    expect(isInputTarget(makeEvent(target))).toBe(true)
  })

  it('returns true for element nested inside a contenteditable container', () => {
    const container = document.createElement('div')
    container.contentEditable = 'true'
    const child = document.createElement('span')
    container.append(child)
    document.body.append(container)
    expect(isInputTarget(makeEvent(child))).toBe(true)
    document.body.removeChild(container)
  })

  it('returns false for DIV', () => {
    expect(isInputTarget(makeEvent(document.createElement('div')))).toBe(false)
  })

  it('returns false for BUTTON', () => {
    expect(isInputTarget(makeEvent(document.createElement('button')))).toBe(false)
  })

  it('returns false for BODY', () => {
    expect(isInputTarget(makeEvent(document.createElement('body')))).toBe(false)
  })

  it('returns false when target is null', () => {
    expect(isInputTarget(makeEvent(null))).toBe(false)
  })
})

describe('formatShortcut', () => {
  const search = KEYBOARD_SHORTCUTS.find(s => s.id === 'search')!
  const help = KEYBOARD_SHORTCUTS.find(s => s.id === 'shortcuts-help')!

  it('returns ⌘K for search on Mac', () => {
    expect(formatShortcut(search, true)).toBe('⌘K')
  })

  it('returns Ctrl+K for search on non-Mac', () => {
    expect(formatShortcut(search, false)).toBe('Ctrl+K')
  })

  it('returns ? for shortcuts-help (no modifier)', () => {
    expect(formatShortcut(help, true)).toBe('?')
    expect(formatShortcut(help, false)).toBe('?')
  })

  it('returns ⌘/ for sidebar on Mac', () => {
    const sidebar = KEYBOARD_SHORTCUTS.find(s => s.id === 'sidebar')!
    expect(formatShortcut(sidebar, true)).toBe('⌘/')
  })

  it('returns Ctrl+. for settings on non-Mac', () => {
    const settings = KEYBOARD_SHORTCUTS.find(s => s.id === 'settings')!
    expect(formatShortcut(settings, false)).toBe('Ctrl+.')
  })

  it(String.raw`returns ⌘\ for aside on Mac`, () => {
    const aside = KEYBOARD_SHORTCUTS.find(s => s.id === 'aside')!
    expect(formatShortcut(aside, true)).toBe('⌘\\')
  })

  it(String.raw`returns Ctrl+\ for aside on non-Mac`, () => {
    const aside = KEYBOARD_SHORTCUTS.find(s => s.id === 'aside')!
    expect(formatShortcut(aside, false)).toBe('Ctrl+\\')
  })
})
