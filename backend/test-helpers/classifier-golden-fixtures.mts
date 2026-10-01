import type { ClassifierGoldenFixture } from './classifier-golden-set.mts'
import { classifierPostGoldenFixtures1 } from './classifier-post-golden-fixtures-1.mts'
import { classifierPostGoldenFixtures2 } from './classifier-post-golden-fixtures-2.mts'
import { classifierPostGoldenFixtures3 } from './classifier-post-golden-fixtures-3.mts'
import { classifierPostGoldenFixtures4 } from './classifier-post-golden-fixtures-4.mts'
import { classifierPostGoldenFixtures5 } from './classifier-post-golden-fixtures-5.mts'
import { classifierAutotaggerGoldenFixtures1 } from './classifier-autotagger-golden-fixtures-1.mts'
import { classifierAutotaggerGoldenFixtures2 } from './classifier-autotagger-golden-fixtures-2.mts'

export { autotaggerCandidateSlate } from './classifier-golden-expectations.mts'
export const postClassifierGoldenFixtures: readonly ClassifierGoldenFixture[] = [
  classifierPostGoldenFixtures1,
  classifierPostGoldenFixtures2,
  classifierPostGoldenFixtures3,
  classifierPostGoldenFixtures4,
  classifierPostGoldenFixtures5,
].flat()
export const autotaggerGoldenFixtures: readonly ClassifierGoldenFixture[] = [
  classifierAutotaggerGoldenFixtures1,
  classifierAutotaggerGoldenFixtures2,
].flat()
