import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { compileLocalizationSqlite } from '@vouchington/localization-compiler'
import { emailCopy, resetEmailCatalogCache, resolveEmailCatalogDirectory } from './catalog-copy.mts'

const ORIGINAL_SQLITE = process.env.LOCALIZATION_SQLITE_PATH
const ORIGINAL_NODE_ENV = process.env.NODE_ENV

describe('catalog-copy', () => {
  afterEach(() => {
    resetEmailCatalogCache()
    process.env.LOCALIZATION_SQLITE_PATH = ORIGINAL_SQLITE ?? ''
    process.env.NODE_ENV = ORIGINAL_NODE_ENV ?? 'test'
  })

  describe('emailCopy', () => {
    it('interpolates catalog JSON and unnamed variants', () => {
      const t = emailCopy('en', 'welcome')
      expect(t('preview')).toContain('Welcome to Voucha')
      expect(t('heading', { userName: 'Jordan' })).toBe('Welcome to Voucha, Jordan!')
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
})
