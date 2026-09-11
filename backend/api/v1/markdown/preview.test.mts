import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('preview', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  describe('POST /api/v1/markdown/preview', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'application/json')
        .send({ markdown: '# Hello' })
        .expect(401)
    })

    it('renders markdown to HTML for authenticated users', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'application/json')
        .send({ markdown: '# Hello\n\n**bold** text' })
        .expect(200)

      expect(response.body).toMatchObject({ html: expect.any(String) })
      expect(response.body.html).toContain('<h1>')
      expect(response.body.html).toContain('<strong>')
    })

    it('returns empty html for empty markdown', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'application/json')
        .send({ markdown: '' })
        .expect(200)

      expect(response.body).toEqual({ html: '' })
    })

    it('returns empty html when markdown field is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const response = await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200)

      expect(response.body).toEqual({ html: '' })
    })

    it('renders GFM tables', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      const tableMarkdown = '| A | B |\n|---|---|\n| 1 | 2 |'
      const response = await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'application/json')
        .send({ markdown: tableMarkdown })
        .expect(200)

      expect(response.body.html).toContain('<table>')
    })

    it('returns 415 when Content-Type is not application/json', async () => {
      const request = createRequest()
      await request.authenticateAs(user)

      await request
        .post('/api/v1/markdown/preview')
        .set('Content-Type', 'text/plain')
        .send('# Hello')
        .expect(415)
    })
  })
})
