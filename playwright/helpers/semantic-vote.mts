import type { Locator, Page } from '@playwright/test'

type VoteScope = Page | Locator

const voteRoot = (scope: VoteScope, dataPw: string) => scope.locator(`[data-vote-root="${dataPw}"]`)

export function voteTrigger(scope: VoteScope, dataPw = 'vote'): Locator {
  // oxlint-disable-next-line no-mistakes/playwright-prefer-get-by-test-id -- explicit data-pw keeps selector coverage statically discoverable
  return voteRoot(scope, dataPw).locator('[data-pw="semantic-vote-trigger"]')
}

export function voteChoice(scope: VoteScope, dataPw = 'vote', choice = 'vouch'): Locator {
  return voteChoiceGroup(scope, dataPw).locator(
    `[data-pw="semantic-vote-choice"][data-vote-choice="${choice}"]`,
  )
}

export function voteChoiceGroup(scope: VoteScope, dataPw = 'vote'): Locator {
  return scope.locator(`[data-vote-control="${dataPw}"][data-pw="semantic-vote-choices"]`)
}

export function voteBinaryChoice(scope: VoteScope, dataPw = 'vote', choice = 'support'): Locator {
  return voteRoot(scope, dataPw).locator(
    `[data-pw="semantic-vote-binary-choice"][data-vote-choice="${choice}"]`,
  )
}

export function userSignalChoice(
  scope: VoteScope,
  dataPw = 'user-signal-election-card',
  choice = 'vouch',
): Locator {
  return scope
    .getByTestId(dataPw)
    .locator(`[data-pw="user-signal-vote-choice"][data-vote-choice="${choice}"]`)
}

export function voteClear(scope: VoteScope, dataPw = 'vote'): Locator {
  return scope.locator(`[data-pw="semantic-vote-clear"][data-vote-clear-for="${dataPw}"]`)
}

export async function chooseVote(
  scope: VoteScope,
  dataPw = 'vote',
  choice = 'vouch',
): Promise<void> {
  const trigger = voteTrigger(scope, dataPw)
  if (await trigger.isVisible()) {
    await trigger.click()
    await voteChoice(scope, dataPw, choice).click()
    return
  }

  await voteBinaryChoice(scope, dataPw, choice).click()
}
