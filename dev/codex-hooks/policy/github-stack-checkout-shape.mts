import { isAbsolute } from 'node:path'

import { tokenizeShellWordsDetailed } from './shell-tokenizer.mts'

const CHECKOUT_COMMANDS = [
  ['gh', 'stack', 'checkout'],
  ['gh-stack', 'checkout'],
]

export const STANDALONE_CHECKOUT_REASON =
  'Run gh stack checkout as the whole command: `gh stack checkout <stack-number>`, or ' +
  '`cd <absolute-worktree-path> && gh stack checkout <stack-number>`. The hook compares local ' +
  'layer branches with their PR heads before the import, so the checkout cannot share its command ' +
  'with anything that could change the repository, working directory, branches, or git ' +
  'environment it reads, including wrappers such as `bash -c`, `env`, or `pushd`.'

/**
 * True when the whole command is `gh stack checkout <target>` or `gh-stack checkout <target>`,
 * optionally after exactly one `cd <absolute literal path> &&`. Those are the only shapes whose
 * repository and git environment the hook can prove are the ones gh-stack reads; the target itself
 * is validated separately.
 */
export function isStandaloneStackCheckout(command: string): boolean {
  const words = tokenizeShellWordsDetailed(command.replace(/\\\n/g, ' '), {
    splitRedirections: true,
  })
  const first = words.findIndex(word => word.value !== '\n')
  const body =
    first === -1 ? [] : words.slice(first, words.findLastIndex(w => w.value !== '\n') + 1)
  if (body.some(word => word.expandable || word.value === '\n')) {
    return false
  }
  const values = body.map(word => word.value)
  const checkout =
    values[0] === 'cd' && values[2] === '&&' && isAbsolute(values[1] ?? '')
      ? values.slice(3, -1)
      : values.slice(0, -1)
  return CHECKOUT_COMMANDS.some(
    words => words.length === checkout.length && words.every((word, i) => checkout[i] === word),
  )
}
