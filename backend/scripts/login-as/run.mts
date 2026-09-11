/**
 * login-as — QA persona login helper
 *
 * Creates or resolves a user by email address, assigns any requested roles, and
 * mints an OTP deep-link for live browser persona login via claude-in-chrome.
 *
 * The verify step at /login?emailAddress=…&otp=… auto-submits once when the tab
 * is focused and visible — no click and no CAPTCHA needed.
 *
 * Usage:
 *   node backend/scripts/login-as/run.mts <email> [--role <slug>]...
 *   node backend/scripts/login-as/run.mts --all
 *   pnpm run login-as -- <email> [--role moderator]
 *   pnpm run login-as -- --all
 *
 * DNS note: brand-new emails (never logged in) trigger an MX lookup in
 * validateEmailAddress. Use a real-MX domain (e.g. @voucha.ai) and run with
 * network the first time. After the first successful login (logged_in_at set)
 * the email is DNS-free on re-runs. The seeded admin (tests@voucha.ai) is
 * always DNS-free.
 *
 * Local development only — refused on staging/production.
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v7 } from 'uuid'
import { gracefulShutdown } from '@data-stores/graceful-shutdown'
import { upsertUser } from '@services/users/create'
import { addUserRole } from '@services/users/roles-permissions'
import { createEmailAddressLoginToken } from '@services/users/authentication'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB_PROTOCOL =
  existsSync(resolve(REPO_ROOT, 'dev/certs/localhost.pem')) &&
  existsSync(resolve(REPO_ROOT, 'dev/certs/localhost-key.pem'))
    ? 'https'
    : 'http'

/** Refuse to run in staging or production; exits process on violation. */
function assertDevOnly(env: string | undefined): void {
  if (env === 'production' || env === 'staging') {
    console.error(`login-as must not run in ${env}.`)
    process.exit(1)
  }
}

// All site-scoped role slugs from user_roles_types. CO is community-scoped and cannot
// be granted site-wide via addUserRole — create a community and assign the owner instead.
const VALID_ROLE_SLUGS = new Set([
  'administrator',
  'moderator',
  'investor',
  'customer_support',
  'developer',
])

// Community Owner (CO) is a community-scoped role. It cannot be set up via
// addUserRole — CO requires creating a community and assigning an owner membership.
// To test CO flows: create a community first, then use a regular user as its owner.
const ALL_PERSONAS = [
  { label: 'Member (RU)', email: 'qa-member@voucha.ai', extraRoles: [] as string[] },
  {
    label: 'Site Moderator (SM)',
    email: 'qa-site-moderator@voucha.ai',
    extraRoles: ['moderator'],
  },
  {
    label: 'Developer QA (QA)',
    email: 'qa-developer@voucha.ai',
    extraRoles: ['developer'],
  },
  { label: 'Admin (SA)', email: 'qa-admin@voucha.ai', extraRoles: ['administrator'] },
]

async function mintDeepLink(emailAddress: string, extraRoles: string[]): Promise<string> {
  const workerPort = process.env['WORKER_PORT']
  if (!workerPort) throw new Error('WORKER_PORT is not set — run: source .env')

  for (const role of extraRoles) {
    if (!VALID_ROLE_SLUGS.has(role)) {
      throw new Error(
        `Unknown role slug: "${role}". Valid roles: ${[...VALID_ROLE_SLUGS].join(', ')}`,
      )
    }
  }

  const normalizedEmail = emailAddress.trim().toLowerCase()
  if (!normalizedEmail.includes('@')) {
    throw new Error(
      `"${emailAddress}" is not a valid email address. Did you pass a role slug instead of an email?`,
    )
  }

  const user = await upsertUser({ emailAddress: normalizedEmail, sessionId: v7(), deviceId: v7() })
  for (const role of extraRoles) {
    await addUserRole(user.id, role)
  }

  const { token } = await createEmailAddressLoginToken(normalizedEmail)
  const url = `${WEB_PROTOCOL}://localhost:${workerPort}/login?emailAddress=${encodeURIComponent(normalizedEmail)}&otp=${token}`
  return url
}

async function main() {
  assertDevOnly(process.env['NODE_ENV'])

  const args = process.argv.slice(2)
  const allMode = args.includes('--all')

  if (allMode) {
    console.log('Minting deep-links for all standard QA personas...\n')
    for (const persona of ALL_PERSONAS) {
      const url = await mintDeepLink(persona.email, persona.extraRoles)
      console.log(persona.label)
      console.log(`  Email: ${persona.email}`)
      console.log(`  URL:   ${url}`)
      console.log()
    }
    return
  }

  // Single-email mode
  const emailArg = args.find(a => !a.startsWith('--'))
  if (!emailArg) {
    process.stderr.write(
      'Usage: node backend/scripts/login-as/run.mts <email> [--role <slug>]...\n' +
        '       node backend/scripts/login-as/run.mts --all\n',
    )
    process.exitCode = 1
    return
  }

  const extraRoles: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--role' && args[i + 1]) {
      extraRoles.push(args[++i])
    }
  }

  const url = await mintDeepLink(emailArg, extraRoles)
  const rolesNote = extraRoles.length > 0 ? ` (roles: ${extraRoles.join(', ')})` : ''
  console.log(`Email: ${emailArg}${rolesNote}`)
  console.log(`URL:   ${url}`)
  console.log()
  console.log(
    'Navigate to this URL in claude-in-chrome. The verify step auto-submits once the tab is focused.',
  )
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => {
    void gracefulShutdown()
      .catch(console.error)
      .then(() => {
        setTimeout(() => process.exit(process.exitCode ?? 0), 250).unref()
      })
  })
