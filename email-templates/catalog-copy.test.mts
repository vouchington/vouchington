import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { compileLocalizationSqlite } from '@vouchington/localization-compiler'
import {
  emailCopy,
  emailMessagesFromCatalog,
  emailOptional,
  formatLocalizationLeaf,
  leavesFromCatalog,
  loadEmailCatalogMessages,
  resetEmailCatalogCache,
  resolveEmailCatalogDirectory,
} from './catalog-copy.mts'

const ORIGINAL_SQLITE = process.env.LOCALIZATION_SQLITE_PATH
const ORIGINAL_NODE_ENV = process.env.NODE_ENV

describe('catalog-copy', () => {
  afterEach(() => {
    resetEmailCatalogCache()
    process.env.LOCALIZATION_SQLITE_PATH = ORIGINAL_SQLITE ?? ''
    process.env.NODE_ENV = ORIGINAL_NODE_ENV ?? 'test'
  })

  it('projects normalized email aliases without changing their IDs', () => {
    expect(
      emailMessagesFromCatalog({
        copies: [{ id: 'copy.fixture.welcome', descriptor: null }],
        aliases: [
          { consumer: 'web', alias: 'fixture.welcome', copyId: 'copy.fixture.welcome' },
          { consumer: 'email', alias: 'email.fixture.welcome', copyId: 'copy.fixture.welcome' },
        ],
        translations: {
          'en-US': [{ id: 'copy.fixture.welcome', value: 'Welcome' }],
          es: [{ id: 'copy.fixture.welcome', value: 'Bienvenido' }],
        },
      }),
    ).toEqual([
      {
        id: 'email.fixture.welcome',
        consumers: ['email'],
        descriptor: null,
        translations: { 'en-US': 'Welcome', es: 'Bienvenido' },
      },
    ])
  })

  describe('emailCopy', () => {
    it('interpolates catalog JSON and unnamed variants', () => {
      const t = emailCopy('en', 'welcome')
      expect(t('preview')).toContain('Welcome to Voucha')
      expect(t('heading', { userName: 'Jordan' })).toBe('Welcome to Voucha, Jordan!')
      expect(emailOptional(t, 'heading', 'Jordan')).toBe('Welcome to Voucha, Jordan!')
      expect(emailOptional(t, 'heading', undefined)).toBe('Welcome to Voucha!')
      expect(emailOptional(t, 'heading', '')).toBe('Welcome to Voucha!')
      expect(emailCopy('es', 'welcome')('button')).toBe('Comenzar a explorar')
    })

    it('formats plural leaves from the catalog', () => {
      const t = emailCopy('en', 'post-referral-link')
      expect(t('activeLinks', { count: 1 })).toBe('1 active link')
      expect(t('activeLinks', { count: 3 })).toBe('3 active links')
    })

    it('throws on a missing message', () => {
      expect(() => emailCopy('en', 'welcome')('missing')).toThrow(/Missing email message/)
    })

    it('resolves the same strings from sqlite', () => {
      const directory = mkdtempSync(join(tmpdir(), 'email-catalog-'))
      const output = join(directory, 'catalog.sqlite')
      compileLocalizationSqlite(
        [
          {
            id: 'email.welcome.heading',
            consumers: ['email'],
            descriptor: null,
            translations: {
              'en-US': 'Welcome to Voucha, {userName}!',
              es: '¡Bienvenido a Voucha, {userName}!',
            },
          },
          {
            id: 'email.welcome.button',
            consumers: ['email'],
            descriptor: null,
            translations: {
              'en-US': 'Get started',
              es: 'Comenzar a explorar',
            },
          },
          {
            id: 'email.shared.footer',
            consumers: ['email'],
            descriptor: null,
            translations: {
              'en-US': '© {year} Voucha. All rights reserved.',
              es: '© {year} Voucha. Todos los derechos reservados.',
              fr: '© {year} Voucha. Tous droits réservés.',
              pt: '© {year} Voucha. Todos os direitos reservados.',
            },
          },
          {
            id: 'email.login-token.subject',
            consumers: ['email'],
            descriptor: null,
            translations: {
              'en-US': 'Your Voucha One-Time Password Login',
              es: 'Tu inicio de sesión con contraseña de un solo uso de Voucha',
              fr: 'Votre connexion Voucha par mot de passe à usage unique',
              pt: 'Seu login da Voucha com senha de uso único',
            },
          },
        ],
        output,
      )
      process.env.LOCALIZATION_SQLITE_PATH = output
      resetEmailCatalogCache()
      try {
        expect(emailCopy('en', 'welcome')('heading', { userName: 'Jordan' })).toBe(
          'Welcome to Voucha, Jordan!',
        )
        expect(emailCopy('es', 'welcome')('button')).toBe('Comenzar a explorar')
        for (const [locale, footer, subject] of [
          ['en', '© 2026 Voucha. All rights reserved.', 'Your Voucha One-Time Password Login'],
          [
            'es',
            '© 2026 Voucha. Todos los derechos reservados.',
            'Tu inicio de sesión con contraseña de un solo uso de Voucha',
          ],
          [
            'fr',
            '© 2026 Voucha. Tous droits réservés.',
            'Votre connexion Voucha par mot de passe à usage unique',
          ],
          [
            'pt',
            '© 2026 Voucha. Todos os direitos reservados.',
            'Seu login da Voucha com senha de uso único',
          ],
        ] as const) {
          expect(emailCopy(locale, 'shared')('footer', { year: 2026 })).toBe(footer)
          expect(emailCopy(locale, 'login-token')('subject')).toBe(subject)
        }
      } finally {
        resetEmailCatalogCache()
        rmSync(directory, { recursive: true, force: true })
      }
    })

    it('throws in production when sqlite is absent', () => {
      process.env.NODE_ENV = 'production'
      process.env.LOCALIZATION_SQLITE_PATH = ''
      expect(() => emailCopy('en', 'welcome')('preview')).toThrow(/LOCALIZATION_SQLITE_PATH/)
    })

    it('throws when the sqlite path does not exist', () => {
      process.env.LOCALIZATION_SQLITE_PATH = join(tmpdir(), 'missing-catalog.sqlite')
      expect(() => emailCopy('en', 'welcome')('preview')).toThrow(/sqlite is missing/)
    })

    it('loads catalog JSON independently of the working directory', () => {
      const previous = process.cwd()
      const empty = mkdtempSync(join(tmpdir(), 'no-email-json-'))
      try {
        process.chdir(empty)
        expect(emailCopy('en', 'welcome')('preview')).toContain('Welcome to Voucha')
      } finally {
        process.chdir(previous)
        rmSync(empty, { recursive: true, force: true })
      }
    })
  })

  it('resolves the catalog directory from the built package module', () => {
    expect(resolveEmailCatalogDirectory(new URL('dist/index.mjs', import.meta.url).href)).toBe(
      fileURLToPath(new URL('../localization/catalog', import.meta.url)),
    )
  })

  it('reports the missing catalog path', () => {
    const path = join(tmpdir(), 'missing-email-catalog')
    expect(() => loadEmailCatalogMessages(path)).toThrow(
      `Email catalog directory is missing at ${path}`,
    )
  })

  it('reports a catalog without a translations directory', () => {
    const directory = mkdtempSync(join(tmpdir(), 'email-catalog-without-translations-'))
    try {
      writeFileSync(join(directory, 'copies.json'), '[]')
      writeFileSync(join(directory, 'aliases.json'), '[]')
      expect(() => loadEmailCatalogMessages(directory)).toThrow(
        `Email catalog translations directory is missing at ${join(directory, 'translations')}`,
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('loads normalized email aliases from the fixture directory', () => {
    expect(loadEmailCatalogMessages('localization/normalized-fixture')).toEqual([])
  })

  it('rejects an email alias whose copy is absent from the catalog', () => {
    expect(() =>
      emailMessagesFromCatalog({
        copies: [],
        aliases: [
          { consumer: 'email', alias: 'email.fixture.missing', copyId: 'copy.fixture.missing' },
        ],
        translations: {},
      }),
    ).toThrow('Email alias "email.fixture.missing" references missing copy')
  })

  describe('formatLocalizationLeaf', () => {
    it('keeps unknown placeholders', () => {
      expect(formatLocalizationLeaf('Hello {name}', 'en')).toBe('Hello {name}')
    })

    it('selects plural forms and select-plural cases', () => {
      expect(
        formatLocalizationLeaf(
          { kind: 'plural', valueParameter: 'count', forms: { other: '{count} items' } },
          'en',
          { count: 1 },
        ),
      ).toBe('1 items')
      expect(
        formatLocalizationLeaf(
          {
            kind: 'plural',
            valueParameter: 'count',
            forms: { one: '{count} item', other: '{count} items' },
          },
          'en',
          { count: 1 },
        ),
      ).toBe('1 item')
      expect(
        formatLocalizationLeaf(
          {
            kind: 'select-plural',
            valueParameter: 'value',
            selectParameter: 'unit',
            cases: { day: { one: '1d', other: '{value}d' } },
          },
          'en',
          { unit: 'day', value: 4 },
        ),
      ).toBe('4d')
    })

    it('skips catalog messages with no matching locale', () => {
      expect(
        leavesFromCatalog(
          [
            {
              id: 'email.only.fr',
              consumers: ['email'],
              descriptor: null,
              translations: { fr: 'Bonjour' },
            },
          ],
          'en',
        ),
      ).toEqual({})
    })

    it('rejects non-numeric plural values and unknown cases', () => {
      expect(() =>
        formatLocalizationLeaf(
          { kind: 'plural', valueParameter: 'count', forms: { other: '{count}' } },
          'en',
          {},
        ),
      ).toThrow(/numeric/)
      expect(() =>
        formatLocalizationLeaf(
          {
            kind: 'select-plural',
            valueParameter: 'value',
            selectParameter: 'unit',
            cases: { day: { other: 'd' } },
          },
          'en',
          { unit: 'week', value: 1 },
        ),
      ).toThrow(/no case/)
    })
  })
})
