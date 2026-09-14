import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { getImportBatch, getImportRowsByBatchId } from '@services/admin-imports'
import type { PrivateUser } from '@services/users/types'

describe('batch-crm-contacts', () => {
  const r = () => Math.random().toString(36).slice(2, 10)

  let admin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  function makeCrmCsv(rows: Record<string, string>[], headers?: string[]): string {
    const cols = headers ?? Object.keys(rows[0] ?? { name: '', email: '' })
    const headerLine = cols.join(',')
    const dataLines = rows.map(row => cols.map(c => row[c] ?? '').join(','))
    return `${[headerLine, ...dataLines].join('\n')}\n`
  }

  describe('POST /api/v1/imports/crm-contacts', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request
        .post('/api/v1/imports/crm-contacts')
        .send({ csv: 'name,email\nJohn Doe,tests+john@voucha.ai\n' })
        .expect(401)
    })

    it('returns 403 for non-admin users', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .post('/api/v1/imports/crm-contacts')
        .send({ csv: 'name,email\nJohn Doe,tests+john@voucha.ai\n' })
        .expect(403)
    })

    it('returns 400 for empty CSV body', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/imports/crm-contacts').send({ csv: '' }).expect(400)
    })

    it('returns 400 for header-only CSV', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.post('/api/v1/imports/crm-contacts').send({ csv: 'name,email\n' }).expect(400)
    })

    it('returns 422 for CSV with unknown columns', async () => {
      const suffix = r()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = `name,email,unknown_column\nTest ${suffix},tests+test-${suffix}@voucha.ai,bad\n`
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
      expect(response.body.error).toMatch(/unknown_column/)
    })

    it('returns 422 for invalid rows (missing name)', async () => {
      const suffix = r()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = `name,email\n,tests+missing-name-${suffix}@voucha.ai\n`
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
      expect(response.body.validation).toHaveProperty('rows')
    })

    it('returns 422 for invalid rows (bad email)', async () => {
      const suffix = r()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = `name,email\nTest Contact ${suffix},not-an-email\n`
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
    })

    it('returns 422 for duplicate emails in batch', async () => {
      const suffix = r()
      const email = `tests+dup-import-${suffix}@voucha.ai`
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = `name,email\nContact A ${suffix},${email}\nContact B ${suffix},${email}\n`
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(422)
      expect(response.body.valid).toBe(false)
    })

    it('returns 201 and batch info for valid CSV', async () => {
      const suffix = r()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeCrmCsv(
        [{ name: `Import Contact ${suffix}`, email: `tests+import-${suffix}@voucha.ai` }],
        ['name', 'email'],
      )
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(201)
      expect(response.body.valid).toBe(true)
      expect(response.body.batch).toHaveProperty('id')
      expect(response.body.batch.import_type).toBe('crm_contact')
      expect(response.body.batch.total_rows).toBe(1)

      const batch = await getImportBatch(response.body.batch.id)
      const rows = await getImportRowsByBatchId(response.body.batch.id)
      expect(batch).not.toBeNull()
      expect(batch!.import_type).toBe('crm_contact')
      expect(rows).toHaveLength(1)
      expect(rows[0]).toBeDefined()
      expect(rows[0].input_data).toEqual({
        name: `Import Contact ${suffix}`,
        email: `tests+import-${suffix}@voucha.ai`,
      })
    })

    it('returns 201 for valid CSV with optional columns', async () => {
      const suffix = r()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeCrmCsv(
        [
          {
            name: `Full Import ${suffix}`,
            email: `tests+full-import-${suffix}@voucha.ai`,
            vertical: 'ai',
            follower_count: '50000',
            instagram: `@ig_${suffix}`,
            notes: 'Test import',
          },
        ],
        ['name', 'email', 'vertical', 'follower_count', 'instagram', 'notes'],
      )
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(201)
      expect(response.body.valid).toBe(true)
      expect(response.body.batch.total_rows).toBe(1)
    })

    it('handles multiple rows in one import', async () => {
      const suffix = r()
      const request = createRequest()
      await request.authenticateAs(admin)
      const csv = makeCrmCsv(
        [
          { name: `Multi A ${suffix}`, email: `tests+multi-a-${suffix}@voucha.ai` },
          { name: `Multi B ${suffix}`, email: `tests+multi-b-${suffix}@voucha.ai` },
          { name: `Multi C ${suffix}`, email: `tests+multi-c-${suffix}@voucha.ai` },
        ],
        ['name', 'email'],
      )
      const response = await request.post('/api/v1/imports/crm-contacts').send({ csv }).expect(201)
      expect(response.body.batch.total_rows).toBe(3)
    })

    it('is idempotent — importing same contact twice creates one batch each time', async () => {
      const suffix = r()
      const csv = makeCrmCsv(
        [
          {
            name: `Idempotent Import ${suffix}`,
            email: `tests+idempotent-import-${suffix}@voucha.ai`,
          },
        ],
        ['name', 'email'],
      )

      const req1 = createRequest()
      await req1.authenticateAs(admin)
      const res1 = await req1.post('/api/v1/imports/crm-contacts').send({ csv }).expect(201)

      const req2 = createRequest()
      await req2.authenticateAs(admin)
      const res2 = await req2.post('/api/v1/imports/crm-contacts').send({ csv }).expect(201)

      // Different batches
      expect(res1.body.batch.id).not.toBe(res2.body.batch.id)
    })
  })
})
