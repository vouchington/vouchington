import { describe, it, expect } from 'vitest'
import { request } from '@voucha/test-helpers/api/server'
// Register this package routes on the shared app singleton for route tests.
import './index.mts'

describe('Infrastructure Routes', () => {
  describe('GET /infra/ping', () => {
    it('should return pong', async () => {
      const response = await request.get('/infra/ping')

      expect(response.status).toBe(200)
      expect(response.text).toBe('pong')
      expect(response.headers['cache-control']).toBe(
        'max-age=0,private,no-cache,no-store,must-revalidate',
      )
      expect(response.headers['x-voucha-capabilities']).toBe('absolute-sideload-urls-v1')
    })
  })
})
