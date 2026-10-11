# @pacer/sdk

TypeScript SDK for [Pacer](../../README.md), the issuance-clock transfer hook for Meteora DBC. It is consumed as TypeScript source inside this monorepo (the app transpiles it; scripts run it with `tsx`).

## Modules

| Module      | Exports                                                                                                                                                                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core.ts`   | Program IDs, PDAs (`derivePaceState`, `deriveExtraAccountMetaList`), `paceParamsFromSchedule`, `buildInitializePaceIx`, `fetchPaceState`, `fetchAllPaceStates`, clock math (`releasedAt`, `burstLevelAt`, `availableToBuy`, `clockEndsAt`), error decoding (`pacerErrorFromLogs`) |
| `dbc.ts`    | Meteora DBC integration: `buildPacedCurveConfig`, `buildCreatePacedConfigTx`, `buildPacedLaunchTx` (pool + clock in one tx), `buildPacedBuyTx` (exact-out), `buildQuoteInBuyTx`, `buildSellTx`, `buildMigrateTx`, `quoteMinimumOut`, `priceAtNetOut`, `priceCeilingAt`            |
| `fill.ts`   | `buildFillCurveBuyTx`: partial-fill buy that completes the curve                                                                                                                                                                                                                  |
| `events.ts` | `parsePacerEvents`, `fetchPaceActivity`: hook events decoded from nested CPI logs, including on-chain rejected buys                                                                                                                                                               |

The clock math mirrors the Rust program exactly (`PaceState::released_at`, `burst_level_at`), including u64 saturation. Every swap builder quotes first and enforces slippage (default 1%).

## Example

```ts
import { availableToBuy, buildPacedBuyTx, buildPacedLaunchTx, fetchPaceState } from '@pacer/sdk'

const { transaction, pool } = await buildPacedLaunchTx(connection, {
  payer,
  creator,
  config,
  baseMint: mint.publicKey,
  name: 'Example',
  symbol: 'EXMPL',
  uri,
  schedule: { openingBps: 200, clockSeconds: 4 * 3600, maxPerBuyBps: 100, burstBps: 300 },
})
// sign with payer, creator and the mint keypair, then send

const pace = await fetchPaceState(connection, mint.publicKey)
const amount = availableToBuy(pace!, Math.floor(Date.now() / 1000))
const { transaction: buy } = await buildPacedBuyTx(connection, {
  owner,
  pool,
  baseAmountOut: new BN(amount.toString()),
})
```

## IDL

`src/idl/*` is generated from `target/idl/pacer.json` by `pnpm sync-idl` (run automatically by `pnpm build:program`). Don't edit it by hand.
