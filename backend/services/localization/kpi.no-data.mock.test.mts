import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  compileLocalizationSqlite,
  explainLocalizationPlan,
  openLocalizationDatabase,
} from '@vouchington/localization-compiler'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock<typeof import('node:fs')>(import('node:fs'), async importOriginal => importOriginal())
import { getLocalizationDatabase } from './database.mts'
import { localizationBatchPayload, setLocalizationDatabaseForTests } from './index.mts'

function installKpiLookupDatabase(count: number): void {
  const path = join(mkdtempSync(join(tmpdir(), 'kpi-')), 'catalog.sqlite')
  compileLocalizationSqlite(
    [{ id: 'nav.home', descriptor: null, consumers: ['web'], translations: { 'en-US': 'Home' } }],
    path,
  )
  const sqlite = new DatabaseSync(path)
  const insertCopy = sqlite.prepare('INSERT INTO copies (id, descriptor_json) VALUES (?, ?)')
  const insertTranslation = sqlite.prepare(
    'INSERT INTO translations (locale, copy_id, value_json) VALUES (?, ?, ?)',
  )
  const insertAlias = sqlite.prepare(
    'INSERT INTO consumer_aliases (consumer, alias, copy_id) VALUES (?, ?, ?)',
  )
  sqlite.exec('BEGIN')
  for (let index = 0; index < count; index++) {
    const id = `kpi.${String(index).padStart(4, '0')}`
    insertCopy.run(id, 'null')
    insertAlias.run('web', id, id)
    insertTranslation.run('en-US', id, JSON.stringify(`Message ${index}`))
  }
  sqlite.exec('COMMIT')
  sqlite.close()
  setLocalizationDatabaseForTests(openLocalizationDatabase(path))
}

describe('localization KPIs', () => {
  afterEach(() => {
    setLocalizationDatabaseForTests(undefined)
  })

  it('resolves a 2,000-message public batch and rejects 2,001 messages', () => {
    installKpiLookupDatabase(2000)
    const started = performance.now()
    const payload = localizationBatchPayload({
      consumer: 'web',
      locales: ['en'],
      selectors: ['kpi.*'],
    })
    const elapsedMs = performance.now() - started
    const body = JSON.parse(payload.body) as { messages: Record<string, string> }
    expect(Object.keys(body.messages)).toHaveLength(2000)
    expect(body.messages['kpi.0000']).toBe('Message 0')
    expect(body.messages['kpi.1999']).toBe('Message 1999')
    expect(elapsedMs).toBeLessThan(500)
    const database = getLocalizationDatabase()
    const prefixPlan = explainLocalizationPlan(database, { kind: 'prefix', prefix: 'kpi' })
    const exactPlan = explainLocalizationPlan(database, { kind: 'exact', id: 'kpi.0000' })
    expect(prefixPlan).toMatch(/SEARCH r USING COVERING INDEX/)
    expect(prefixPlan).not.toMatch(/\bSCAN\b/)
    expect(exactPlan).toMatch(/SEARCH a USING COVERING INDEX/)
    expect(exactPlan).not.toMatch(/\bSCAN\b/)

    installKpiLookupDatabase(2001)
    expect(() =>
      localizationBatchPayload({
        consumer: 'web',
        locales: ['en'],
        selectors: ['kpi.*'],
      }),
    ).toThrow(/message/i)
  })
})
