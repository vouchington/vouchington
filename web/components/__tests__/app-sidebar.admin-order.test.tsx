import { beforeEach, describe, expect, it } from 'vitest'
import {
  getSectionLabels,
  renderSidebar,
  setMockPathname,
} from '@/test-helpers/components/app-sidebar-test-helpers'
import type { User } from '@/types/user'

describe('AppSidebar Admin section visibility', () => {
  beforeEach(() => {
    setMockPathname('/')
  })

  it('News intent at / shows Browse first for unauthenticated — no admin groups', () => {
    const { container } = renderSidebar()
    const labels = getSectionLabels(container)
    expect(labels[0]).toBe('Browse')
    expect(labels).not.toContain('Feeds')
    expect(labels).not.toContain('CMS')
    expect(labels).not.toContain('Engineering')
    expect(labels).not.toContain('Design')
    expect(labels).not.toContain('Admin')
  })

  it('News intent at / shows only Browse for administrators (no Admin group)', () => {
    const { container } = renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const labels = getSectionLabels(container)
    expect(labels[0]).toBe('Browse')
    expect(labels).not.toContain('Admin')
  })

  it('News intent at / shows only Browse for investors (no Admin group)', () => {
    const { container } = renderSidebar({ id: 'u1', roles: ['investor'] } as User)
    const labels = getSectionLabels(container)
    expect(labels[0]).toBe('Browse')
    expect(labels).not.toContain('Admin')
    expect(labels).not.toContain('CMS')
    expect(labels).not.toContain('Engineering')
  })

  it('Moderation intent shows Moderation group for administrators', () => {
    setMockPathname('/reports')
    const { container } = renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const labels = getSectionLabels(container)
    expect(labels).toContain('Moderation')
  })

  it('Settings intent shows the administrator group for membership administration', () => {
    setMockPathname('/memberships/grants')
    const { container } = renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const labels = getSectionLabels(container)
    expect(labels).toContain('Admin')
  })

  it('Engineering intent shows Engineering group for administrators', () => {
    setMockPathname('/admin/queues')
    const { container } = renderSidebar({ id: 'u1', roles: ['administrator'] } as User)
    const labels = getSectionLabels(container)
    expect(labels).toContain('Operations')
    expect(labels).toContain('Dynamic Config')
    expect(labels).not.toContain('Design')
  })

  it('Engineering intent lands non-admin viewers in the Dynamic Config group', () => {
    setMockPathname('/admin/dynamic-config')
    const { container } = renderSidebar({ id: 'u1', roles: ['developer'] } as User)
    expect(getSectionLabels(container)).toEqual(['Dynamic Config'])
  })

  it('Support intent does not show static Messages group when authenticated', () => {
    setMockPathname('/chat/support')
    const { container } = renderSidebar({ id: 'u1', roles: ['user'] } as User)
    const labels = getSectionLabels(container)
    expect(labels).not.toContain('Messages')
  })
})
