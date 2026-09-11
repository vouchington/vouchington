import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const clientApiRequestFiles = [
  'admin.ts',
  'posts.ts',
  'topics.ts',
  'elections.ts',
  'entity-relations.ts',
]

const apiDir = path.resolve(process.cwd(), 'web/lib/api')

describe('api module boundaries', () => {
  it('labels client endpoint modules with use client', () => {
    for (const filename of clientApiRequestFiles) {
      const file = path.join(apiDir, 'client', filename)
      const contents = fs.readFileSync(file, 'utf8').trimStart()
      expect(contents.startsWith("'use client'")).toBe(true)
    }
  })
})
