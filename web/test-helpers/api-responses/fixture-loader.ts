import {
  WEB_API_FIXTURE_DECLARATIONS,
  indexWebApiFixtureDeclarations,
  type WebApiFixtureBody,
  type WebApiFixtureId,
} from './declarations'

const declarationsById = indexWebApiFixtureDeclarations(WEB_API_FIXTURE_DECLARATIONS)

export const WEB_API_FIXTURE_IDS = Object.freeze(
  WEB_API_FIXTURE_DECLARATIONS.map(declaration => declaration.id),
) as readonly WebApiFixtureId[]

export function loadWebApiFixture<Id extends WebApiFixtureId>(id: Id): WebApiFixtureBody<Id> {
  return structuredClone(declarationsById[id].body) as WebApiFixtureBody<Id>
}
