import type { ExplainResult } from '@data-stores/psql'
import { getScenarioContract, type PlanExpectation } from './plan-expectations.mts'

type FunctionCallExpectation = Extract<PlanExpectation, { kind: 'maxFunctionCalls' }>

export function assertFunctionCallCap(
  result: ExplainResult,
  expectation: FunctionCallExpectation,
): void {
  const calls = (result.function_calls ?? [])
    .filter(entry => entry.funcname === expectation.function)
    .reduce((total, entry) => total + entry.calls, 0)
  if (calls > expectation.max)
    throw new Error(
      `${result.name} called ${expectation.function} ${calls} times; expected at most ${expectation.max}`,
    )
}

/** A cap must belong to a function actually observed in at least one captured query. */
export function assertScenarioFunctionCalls(
  scenarioId: string,
  results: readonly ExplainResult[],
): void {
  const expectations = getScenarioContract(scenarioId).expectations
  for (const expectation of expectations) {
    if (expectation.kind !== 'maxFunctionCalls') continue
    if (
      !results.some(
        result =>
          result.scenario_id === scenarioId &&
          result.function_calls?.some(entry => entry.funcname === expectation.function),
      )
    )
      throw new Error(`${scenarioId} never called capped function ${expectation.function}`)
  }
}
