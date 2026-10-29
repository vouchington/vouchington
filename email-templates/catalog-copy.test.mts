import { mkdtempSync, rmSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { compileLocalizationSqlite } from '@vouchington/localization-compiler'

const execFileAsync = promisify(execFile)
const probe = fileURLToPath(new URL('./test-helpers/catalog-copy-probe.mts', import.meta.url))

describe('catalog-copy', () => {
  beforeEach(() => {
    vi.stubEnv('LOCALIZATION_SQLITE_PATH', '')
    vi.stubEnv('NODE_ENV', 'test')
  })

  afterEach(() => vi.unstubAllEnvs())

  describe('emailCopy', () => {
    it('interpolates catalog JSON and unnamed variants', async () => {
      vi.resetModules()
      const { emailCopy } = await import('./catalog-copy.mts')
      const t = emailCopy('en', 'welcome')
      expect(t('preview')).toContain('Welcome to Voucha')
      expect(t('heading', { userName: 'Jordan' })).toBe('Welcome to Voucha, Jordan!')
      expect(emailCopy('es', 'welcome')('button')).toBe('Comenzar a explorar')
    })

    it('formats plural leaves from the catalog', async () => {
      vi.resetModules()
      const { emailCopy } = await import('./catalog-copy.mts')
      const t = emailCopy('en', 'post-referral-link')
      expect(t('activeLinks', { count: 1 })).toBe('1 active link')
      expect(t('activeLinks', { count: 3 })).toBe('3 active links')
    })

    it('throws on a missing message', async () => {
      vi.resetModules()
      const { emailCopy } = await import('./catalog-copy.mts')
      expect(() => emailCopy('en', 'welcome')('missing')).toThrow(/Missing email message/)
    })

    it('resolves the same strings from sqlite', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'email-catalog-'))
      const output = join(directory, 'catalog.sqlite')
      try {
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
        const { stdout } = await execFileAsync(process.execPath, [probe, 'sqlite'], {
          cwd: directory,
          env: { ...process.env, NODE_ENV: 'test', LOCALIZATION_SQLITE_PATH: output },
        })
        const result = JSON.parse(stdout) as {
          heading: string
          button: string
          locales: Record<string, { footer: string; subject: string }>
        }
        expect(result.heading).toBe('Welcome to Voucha, Jordan!')
        expect(result.button).toBe('Comenzar a explorar')
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
          expect(result.locales[locale]!.footer).toBe(footer)
          expect(result.locales[locale]!.subject).toBe(subject)
        }
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })

    it('throws in production when sqlite is absent', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()
      const { emailCopy } = await import('./catalog-copy.mts')
      expect(() => emailCopy('en', 'welcome')('preview')).toThrow(/LOCALIZATION_SQLITE_PATH/)
    })

    it('throws when the sqlite path does not exist', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'missing-email-catalog-'))
      try {
        vi.stubEnv('LOCALIZATION_SQLITE_PATH', join(directory, 'missing.sqlite'))
        vi.resetModules()
        const { emailCopy } = await import('./catalog-copy.mts')
        expect(() => emailCopy('en', 'welcome')('preview')).toThrow(/sqlite is missing/)
      } finally {
        rmSync(directory, { recursive: true, force: true })
      }
    })

    it('loads catalog JSON independently of the working directory', async () => {
      const empty = mkdtempSync(join(tmpdir(), 'no-email-json-'))
      try {
        const { stdout } = await execFileAsync(process.execPath, [probe, 'json'], {
          cwd: empty,
          env: { ...process.env, NODE_ENV: 'test', LOCALIZATION_SQLITE_PATH: '' },
        })
        expect(JSON.parse(stdout)).toEqual(
          expect.objectContaining({ preview: expect.stringContaining('Welcome to Voucha') }),
        )
      } finally {
        rmSync(empty, { recursive: true, force: true })
      }
    })
  })

  it('renders the prebuilt package from an empty working directory', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'built-email-json-'))
    try {
      const { stdout } = await execFileAsync(process.execPath, [probe, 'built'], {
        cwd: empty,
        env: { ...process.env, NODE_ENV: 'test', LOCALIZATION_SQLITE_PATH: '' },
      })
      const result = JSON.parse(stdout) as { subject: string; html: string; text: string }
      expect(result.subject).toContain('Voucha')
      expect(result.text).toContain('¡Bienvenido a Voucha!')
      expect(result.html).toContain('¡Bienvenido a Voucha!')
      expect(result.html).toContain('lang="es"')
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
