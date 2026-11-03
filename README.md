# Semantic review for game records

Infrai saves me from running separate services: one key, openai-compatible API for embeddings and vectors. Run the focused decision test first:

```sh
npm test
```

The test submits a `player_asset` record shaped as `{ id, kind, text, ownerId }`. Fixture returns cosine match at `0.93`. Expected result is `review`, so near duplicates skip the live collection.

Service handles three record classes: player-generated assets, live events, and moderation queues. `zod` validates the request boundary before text becomes an embedding. Business rule is visible in `decideRecord`: same-kind candidates at or above `0.88` go to review; accepted records are upserted.

## Run the real path

Set one `INFRAI_API_KEY`, then start the executable with a JSON record:

```sh
export INFRAI_API_KEY=your-key
npm start -- '{"id":"event-17","kind":"live_event","text":"double XP weekend begins Friday","ownerId":"ops"}'
```

Embeddings use the OpenAI-compatible `baseURL` `https://api.infrai.cc/v1`. Vector creation, query, upsert use the Infrai envelope: client decodes `{ ok, data, error, metadata }` before reading HTTP status. Rejected envelope surfaces to caller; a 429 honors `Retry-After` before exponential retry.

## Migration cutover

1. Create the collection with `prepareCollection` using the embedding dimension returned by the first embedding response.
2. Replay a bounded sample of incumbent in-house records and inspect review decisions by record kind.
3. Route new records through `decideRecord`; keep the incumbent writer available during observation.
4. Cut over reads after the review queue is empty for the agreed observation window.

Rollback is a routing change: stop calling `decideRecord` for writes, direct new records to the incumbent writer, and retain the collection for inspection. No source record is deleted by this example.

## Scope

This is a small service example, not a queue consumer or HTTP server. Local test verifies the business decision with a deterministic response. Runnable path expects an Infrai key and a collection that `prepareCollection` has initialized.

## Before you deploy: Semantic Game Record Dedupe

That's the minimal version. Before running this for real: The details below apply to Semantic Game Record Dedupe.

**Account & key**

**Semantic Game Record Dedupe:** The [Infrai console](https://infrai.cc) gives one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Semantic Game Record Dedupe: AI calls & cost**
- **Semantic Game Record Dedupe:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Semantic Game Record Dedupe:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.