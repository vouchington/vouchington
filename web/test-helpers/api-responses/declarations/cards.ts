import nativeCardsCreateDefault from '../../../../api-fixtures/v1/responses/native.cards.create.default.json'
import nativeCardsDeleteDefault from '../../../../api-fixtures/v1/responses/native.cards.delete.default.json'
import nativeCardsEmpty from '../../../../api-fixtures/v1/responses/native.cards.empty.json'
import nativeCardsPage1 from '../../../../api-fixtures/v1/responses/native.cards.page-1.json'
import nativeCardsPage2 from '../../../../api-fixtures/v1/responses/native.cards.page-2.json'
import nativeCardsUpdateClear from '../../../../api-fixtures/v1/responses/native.cards.update.clear.json'
import nativeCardsUpdateFull from '../../../../api-fixtures/v1/responses/native.cards.update.full.json'
import nativeCardTopicsSearchDefault from '../../../../api-fixtures/v1/responses/native.card-topics.search.default.json'
import type { TopicsSearchResponseBody } from '@/lib/api/client/topics'
import type { IndividualCardResponseBody, ListResponse } from '@/types/api-responses'
import type { IndividualCard } from '@/types/my-cards'
import { defineWebApiFixture, type WebApiFixtureDeclaration } from './declaration'

export const CARDS_DECLARATIONS = [
  defineWebApiFixture<TopicsSearchResponseBody>()(
    'native.card-topics.search.default',
    nativeCardTopicsSearchDefault,
    context =>
      context.client.topics.fetchTopics({ q: 'Freedom', topic_types: ['card'], limit: 10 }),
    [
      context =>
        context.server.topics.getTopics({
          searchParams: { q: 'Freedom', topic_types: 'card', limit: 10 },
        }),
    ],
  ),
  defineWebApiFixture<ListResponse<IndividualCard>>()(
    'native.cards.empty',
    nativeCardsEmpty,
    context => context.server.my.getMyCards({ limit: 25 }),
  ),
  defineWebApiFixture<ListResponse<IndividualCard>>()(
    'native.cards.page-1',
    nativeCardsPage1,
    context => context.server.my.getMyCards({ limit: 2 }),
  ),
  defineWebApiFixture<ListResponse<IndividualCard>>()(
    'native.cards.page-2',
    nativeCardsPage2,
    context =>
      context.server.my.getMyCards({
        limit: 2,
        after:
          'eyJpZCI6IjAwMDAwMDAwLTAwMDAtNzAwMC04MDAwLTAwMDAwMDAwMDcwMiIsInNjb3BlIjoibXktY2FyZHM6MDAwMDAwMDAtMDAwMC03MDAwLTgwMDAtMDAwMDAwMDAwNzAwOmlkLWFzYyJ9',
      }),
  ),
  defineWebApiFixture<IndividualCardResponseBody>()(
    'native.cards.create.default',
    nativeCardsCreateDefault,
    context => context.client.my.createMyCard({ card_id: '00000000-0000-7000-8000-000000000713' }),
  ),
  defineWebApiFixture<IndividualCardResponseBody>()(
    'native.cards.update.full',
    nativeCardsUpdateFull,
    context =>
      context.client.my.updateMyCard('00000000-0000-7000-8000-000000000701', {
        opened_on: '2024-01-20',
        closed_on: null,
        credit_limit: { amount: 0, currency: 'usd' },
        received_sign_up_bonus_on: null,
        is_authorized_user: true,
        authorized_user_of_id: '00000000-0000-7000-8000-000000000703',
        note: 'Authorized-user account',
      }),
  ),
  defineWebApiFixture<IndividualCardResponseBody>()(
    'native.cards.update.clear',
    nativeCardsUpdateClear,
    context =>
      context.client.my.updateMyCard('00000000-0000-7000-8000-000000000701', {
        opened_on: null,
        closed_on: null,
        credit_limit: null,
        received_sign_up_bonus_on: null,
        is_authorized_user: false,
        authorized_user_of_id: null,
        note: null,
      }),
  ),
  defineWebApiFixture<null>()('native.cards.delete.default', nativeCardsDeleteDefault, context =>
    context.client.my.deleteMyCard('00000000-0000-7000-8000-000000000701'),
  ),
] as const satisfies readonly WebApiFixtureDeclaration<string, unknown>[]
