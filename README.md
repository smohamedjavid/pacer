# Pacer

**Issuance clocks for Meteora's Dynamic Bonding Curve: scheduled public offerings instead of one-block price discovery.**

[![CI](https://github.com/smohamedjavid/pacer/actions/workflows/ci.yml/badge.svg)](https://github.com/smohamedjavid/pacer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Network: devnet](https://img.shields.io/badge/network-devnet-purple)

On most launches, the whole price discovery of a token happens in its first block: a bot buys the cheap end of the curve and everyone else buys from the bot. Pacer is a Token-2022 transfer hook for DBC that releases curve supply on a schedule the creator publishes at launch. A buy that would take more supply than the clock has released reverts, whoever sends it and however it's routed. When the curve completes, DBC removes the hook and the token graduates into a compounding DAMM v2 pool with all LP permanently locked.

```text
released(t) = opening_tranche + release_per_second · (t − launch)
a buy is valid only if  supply_out_of_curve_after_buy ≤ released(now)
                    and amount ≤ burst bucket (refills at the same rate)
                    and amount ≤ max_per_buy
```

Two consequences matter:

- **No one-block sweeps, no idle-allowance sweeps.** The clock bounds cumulative supply; the burst bucket bounds any short window across all wallets and transactions, so allowance that piles up while nobody buys can't be taken at once.
- **A provable price speed limit.** Because supply out of the curve is capped at every moment, so is the curve price. The SDK computes the exact ceiling (`priceCeilingAt`; it matches DBC's live price to 1e-15) and the app charts it. Buyers can see the highest price the token can possibly reach by any given time.

> **Status:** hackathon build for the Superteam Earn bounty "Best use of Meteora's Dynamic Bonding Curve". Unaudited, devnet only.

## For judges

| Criterion                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Depth of Meteora integration** | DBC transfer-hook config and pool (`create_config_with_transfer_hook`, `initialize_virtual_pool_with_token2022_transfer_hook`), hook-aware swaps (`swap2_with_transfer_hook`, exact-out), DBC's automatic hook revocation at curve completion, permissionless `migrate_to_damm_v2` into a DAMM v2 pool with **compounding fees, dynamic fee and 100% permanently locked LP**. The hook reads DBC's own pool reserves inside the swap. |
| **Technical execution**          | Anchor program with strict account validation; 11 integration tests run against Meteora's real DBC and DAMM v2 binaries (cloned from devnet), including security tests for direct hook calls, vault donations, front-run initialization, re-initialization and the burst limit; Rust unit tests; CI with `clippy -D warnings`; typed SDK; full devnet lifecycle with explorer links below.                                            |
| **Originality and taste**        | A time-based supply schedule enforced inside the token itself, plus a stateful burst bucket and a provable price speed limit: not an anti-snipe fee, not a per-block or per-wallet cap, not a wrapper that can be bypassed. One hook program ID any DBC partner can drop into a config. See [how it differs](docs/ARCHITECTURE.md#how-this-differs-from-dbcs-rate-limiter).                                                           |
| **Impact**                       | Fair primary issuance for assets that shouldn't be priced in one block: tokenized/RWA receipts, ICM raises, agent tokens, live-streamed sales. Launchpads adopt it by setting one config field.                                                                                                                                                                                                                                       |
| **Traction**                     | Live on devnet with an end-to-end run (below) and a web app anyone can launch from.                                                                                                                                                                                                                                                                                                                                                   |

## Devnet deployment

| What            | Address                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pacer program   | [`4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM`](https://explorer.solana.com/address/4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM?cluster=devnet) |
| Meteora DBC     | [`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`](https://explorer.solana.com/address/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet)   |
| Meteora DAMM v2 | [`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`](https://explorer.solana.com/address/cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG?cluster=devnet)   |

<!-- DEVNET_RUN -->

## How it works

1. **A partner creates a DBC config with Pacer as the transfer hook.** Token-2022 base mint, flat 1% curve fee, graduation into a compounding DAMM v2 pool, LP split between partner and creator and permanently locked.
2. **A creator launches.** One transaction creates the DBC pool and calls `initialize_pace` with the schedule: an opening tranche, a release rate, an optional max per buy and an optional burst limit. Only the pool's creator can do this, once.
3. **Every buy passes through the clock.** DBC moves base tokens with Token-2022, which calls Pacer. Pacer reads DBC's post-trade reserves and rejects the buy if supply outside the curve would exceed what the clock has released, or if it would overdraw the burst bucket. Sells return supply and free allowance. Wallet-to-wallet transfers pass untouched.
4. **Graduation.** The buy that reaches the migration threshold completes the curve; DBC revokes the hook in the same instruction. Anyone can then migrate the pool into DAMM v2.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the sequence diagram, account layout and design decisions, and [SECURITY.md](SECURITY.md) for the threat model.

## Quickstart

Prerequisites: Rust, Solana CLI 2.3+, Anchor 0.32, Node 20+, pnpm 10.

```bash
pnpm install
pnpm build:program            # anchor build + sync the IDL into the SDK

# Local validator with Meteora DBC + DAMM v2 cloned from devnet, Pacer preloaded
pnpm localnet                 # terminal 1
pnpm test                     # terminal 2: integration + security tests
PACER_CLUSTER=localnet pnpm demo

# Devnet
PACER_CLUSTER=devnet MIGRATION_SOL=1.5 CLOCK_SECONDS=240 pnpm demo
PACER_CLUSTER=devnet pnpm --filter @pacer/scripts create-config   # shared config for the app

# Web app
cp app/.env.example app/.env.local   # set NEXT_PUBLIC_PACER_CONFIG
pnpm dev
```

## SDK

```ts
import { buildPacedLaunchTx, buildPacedBuyTx, fetchPaceState, availableToBuy } from '@pacer/sdk'

// Launch: DBC pool + issuance clock in one transaction
// (2% at open, the rest over 4 hours, max 1% per buy, at most 3% in any burst)
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

// Buy exactly what the clock has released
const pace = await fetchPaceState(connection, mint.publicKey)
const amount = availableToBuy(pace!, Math.floor(Date.now() / 1000))
const { transaction: buyTx } = await buildPacedBuyTx(connection, {
  owner,
  pool,
  baseAmountOut: new BN(amount.toString()),
})
```

## Repository

| Path             | Contents                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| `programs/pacer` | Anchor transfer-hook program (`initialize_pace`, `execute`)              |
| `packages/sdk`   | `@pacer/sdk`: PDAs, clock math, DBC transaction builders, error decoding |
| `scripts`        | Lifecycle demo, shared-config script, integration and security tests     |
| `app`            | Next.js app: launch, live Issuance Clock, trade, graduate                |
| `docs`           | Architecture and design notes                                            |
| `bin`            | Localnet and IDL tooling                                                 |

## Limitations

- Many wallets can still compete for each released slice; the clock and burst bucket bound the rate across all of them, `max_per_buy` bounds a single transaction. Per-wallet limits are on the roadmap.
- While on the curve, like every hook token, Pacer tokens are tradable only through hook-aware routes (DBC SDK, this app). After graduation they are plain Token-2022 tokens.
- The hook program must never be closed while a curve is live.
- Pacer reads DBC's `TransferHookPool` layout by fixed offsets (DBC v0.2.1).

## Roadmap

- **Session-aware clocks:** release supply only during market hours, for launches quoted in tokenized stocks.
- **Per-wallet allowances** with hand-resolved hook accounts.
- **Partner presets:** let a DBC partner enforce a minimum clock for every pool on its config.
- **Batch clearing:** one uniform price per release window instead of first-come slices.

## License

[MIT](LICENSE)
