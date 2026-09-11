import { describe, it, expect, vi } from 'vitest'
import { createCrawlSearchTool } from './search-crawl-tool.mts'
import type { PrivateUser } from '@services/users/types'

const mockUser = { id: 'test-user-id', username: 'testuser' } as PrivateUser

describe('createCrawlSearchTool', () => {
  it('curries _currentUser as first argument and returns an executor function', async () => {
    const searchFn = vi.fn<VitestLooseMock>().mockResolvedValue([])
    const tool = createCrawlSearchTool({
      name: 'test_tool',
      description: 'Test tool',
      queryDescription: 'Test query',
      searchFn,
    })

    // Calling function(user) must return a function (the executor)
    const executor = tool.function(mockUser)
    expect(typeof executor).toBe('function')

    await executor({ query: 'hello' })
    expect(searchFn).toHaveBeenCalledOnce()
  })

  it('clamps limit to max 10', async () => {
    const searchFn = vi.fn<VitestLooseMock>().mockResolvedValue([])
    const tool = createCrawlSearchTool({
      name: 'test_tool',
      description: 'Test tool',
      queryDescription: 'Test query',
      searchFn,
    })

    await tool.function(mockUser)({ query: 'q', limit: 100 })
    expect(searchFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }))
  })

  it('uses default limit of 5 when limit is not provided', async () => {
    const searchFn = vi.fn<VitestLooseMock>().mockResolvedValue([])
    const tool = createCrawlSearchTool({
      name: 'test_tool',
      description: 'Test tool',
      queryDescription: 'Test query',
      searchFn,
    })

    await tool.function(mockUser)({ query: 'q' })
    expect(searchFn).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }))
  })

  it('returns success: true with results from searchFn', async () => {
    const items = [{ id: '1' }]
    const searchFn = vi.fn<VitestLooseMock>().mockResolvedValue(items)
    const tool = createCrawlSearchTool({
      name: 'test_tool',
      description: 'Test tool',
      queryDescription: 'Test query',
      searchFn,
    })

    const result = await tool.function(mockUser)({ query: 'q' })
    expect(result).toEqual({ success: true, results: items })
  })
})
