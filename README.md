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
- **A provable price speed limit.** Because supply out of the curve is capped at every moment, so is the curve price. The SDK computes the exact ceiling (`priceCeilingAt`; a test asserts it matches DBC's live price to within 1e-12) and the app charts it. Buyers can see the highest price the token can possibly reach by any given time.

> **Live app (devnet):** https://pacer-sepia.vercel.app
>
> **Status:** hackathon build for the Superteam Earn bounty "Best use of Meteora's Dynamic Bonding Curve". Unaudited, devnet only.

## For judges

| Criterion                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Depth of Meteora integration** | DBC transfer-hook config and pool (`create_config_with_transfer_hook`, `initialize_virtual_pool_with_token2022_transfer_hook`), hook-aware swaps (`swap2_with_transfer_hook`, exact-out), DBC's automatic hook revocation at curve completion, permissionless `migrate_to_damm_v2` into a DAMM v2 pool with **compounding fees, dynamic fee and 100% permanently locked LP**. The hook reads DBC's own pool reserves inside the swap. |
| **Technical execution**          | Anchor program with strict account validation; 13 integration tests run against Meteora's real DBC and DAMM v2 binaries (cloned from devnet), including security tests for direct hook calls, vault donations, front-run initialization, re-initialization, the burst limit, burst griefing and base-token fee claims; Rust unit tests; CI with `clippy -D warnings`; typed SDK; full devnet lifecycle with explorer links below.     |
| **Originality and taste**        | A time-based supply schedule enforced inside the token itself, plus a stateful burst bucket and a provable price speed limit: not an anti-snipe fee, not a per-block or per-wallet cap, not a wrapper that can be bypassed. One hook program ID any DBC partner can drop into a config. See [how it differs](docs/ARCHITECTURE.md#how-this-differs-from-dbcs-rate-limiter).                                                           |
| **Impact**                       | Fair primary issuance for assets that shouldn't be priced in one block: tokenized/RWA receipts, ICM raises, agent tokens, live-streamed sales. Launchpads adopt it by setting one config field.                                                                                                                                                                                                                                       |
| **Traction**                     | Live on devnet with an end-to-end run (below) and a web app anyone can launch from.                                                                                                                                                                                                                                                                                                                                                   |

## Devnet deployment

| What              | Address                                                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pacer program     | [`4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM`](https://explorer.solana.com/address/4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM?cluster=devnet)                                                                             |
| Upgrade authority | [`AKBMcamQCJJ6CTobQzqMUQMG5AzSdyBKfc4GD6wtA7MG`](https://explorer.solana.com/address/AKBMcamQCJJ6CTobQzqMUQMG5AzSdyBKfc4GD6wtA7MG?cluster=devnet) (single key, devnet only; see [SECURITY.md](SECURITY.md#upgrade-authority)) |
| Meteora DBC       | [`dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`](https://explorer.solana.com/address/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN?cluster=devnet)                                                                               |
| Meteora DAMM v2   | [`cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`](https://explorer.solana.com/address/cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG?cluster=devnet)                                                                               |

<!-- devnet-run:start -->

### Devnet lifecycle run

`PACER_CLUSTER=devnet pnpm demo` on 2026-10-11: 300-second clock, 2% at open, max 8% per buy, burst 16%, graduation at 1 SOL. Rejected transactions were sent without preflight, so they are on-chain with Pacer's error in the logs.

| What                    | Address                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| DBC config (Pacer hook) | [`FZQyxeqGRe4F7hzFqCKi3JgnaoU8yXUwBCDirNz531s4`](https://explorer.solana.com/address/FZQyxeqGRe4F7hzFqCKi3JgnaoU8yXUwBCDirNz531s4?cluster=devnet) |
| DBC pool                | [`DkXx71nMSYJA6CRZJhRYKjuxQ41edGkLbTsFX93sKoNt`](https://explorer.solana.com/address/DkXx71nMSYJA6CRZJhRYKjuxQ41edGkLbTsFX93sKoNt?cluster=devnet) |
| Token mint (Token-2022) | [`Ujki9A5weifSVvvEpgAbGYDw99XMuW8pXibz98ZSSCF`](https://explorer.solana.com/address/Ujki9A5weifSVvvEpgAbGYDw99XMuW8pXibz98ZSSCF?cluster=devnet)   |
| PaceState               | [`4fwRbcVb5VmDiejQYzKN2EGoMvArbyGh4srqK8tV5Csu`](https://explorer.solana.com/address/4fwRbcVb5VmDiejQYzKN2EGoMvArbyGh4srqK8tV5Csu?cluster=devnet) |
| Graduated DAMM v2 pool  | [`Gg3AUi2GezwR5ws1vHkNYL8pSGkbCohFhKqjBk1XYL1J`](https://explorer.solana.com/address/Gg3AUi2GezwR5ws1vHkNYL8pSGkbCohFhKqjBk1XYL1J?cluster=devnet) |

| Step                                                                 | Result                                                                                                    | Explorer                                                                                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Partner creates Pacer-hooked DBC config                              | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/2THvxPpCXXsKqdGi2sERiMs2BLvxvUiTLQfDYGkuwScMrWche7erfRe2fvoBewWukV9rGjw39zyvrrwydq3DwYKZ?cluster=devnet) |
| Creator launches pool + starts issuance clock (one tx)               | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/5nX4cWtcYshQCoRTo3eXuCRjJ4QFaVbtMvPr174EnQtdEmpx6PX8s39YuPsbdGB8PC4YZ2vpB2Uaeu4PAt5Yuaew?cluster=devnet) |
| Sniper buys 60,799,992 PACE (under the cap, ahead of the clock)      | ❌ reverted by Pacer (expected): Buy is ahead of the issuance clock — wait for more supply to be released | [tx](https://explorer.solana.com/tx/5YKT9nuFWxRPhHRvz8wrTxPtt2vySduiMrU6ByWvmi1WYn2DiGp5TB3DEWbTTRm7DfrzE9kunWRmWoNyrLDUmg6N?cluster=devnet) |
| Sniper sweeps 0.3 SOL in block one                                   | ❌ reverted by Pacer (expected): Buy exceeds the maximum size per buy                                     | [tx](https://explorer.solana.com/tx/4uHUFpvBLaNAQfYctNAYJeW5bfSmsHe3kvRe7xko52X2L77Tg23ah7dz8YNhy75cHjk9TVJjdWqQqXhJwdG8it8J?cluster=devnet) |
| Bot 1 buys 63,999,992 PACE in the same burst                         | ✅ filled                                                                                                 | [tx](https://explorer.solana.com/tx/4TYgNMzixTiup6oYEgeEyFq97Vm8KGPzmWabkGgo3Rq67eE7XsjQxHbDZpGUMWLG6oqD6X8PmeQVsNuZNGZqYSnv?cluster=devnet) |
| Bot 2 buys 63,999,992 PACE in the same burst                         | ✅ filled                                                                                                 | [tx](https://explorer.solana.com/tx/4piSAU18yRvURqv43tMCVCJvx7XuxufTCNS8rbZ3Nzho2EmFgKzJdDE128s92U8arKFrDB6DWLzRW2qLJbb9nVUu?cluster=devnet) |
| Bot 3 buys 63,999,992 PACE in the same burst                         | ❌ blocked (expected): Buy exceeds the burst limit — too much supply bought in a short window             | [tx](https://explorer.solana.com/tx/44LxwBbyaQV4L56wH3twRgL6hZZKt79ByWyfchTAkyfAkk8PJyvkv9mCAewPaKvPGTYP2Z7oTvx86nFeJgRnCopZ?cluster=devnet) |
| Paced buy 63,999,992 PACE (t+120s) (first of 21 paced buys)          | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/EAWF5ewdnKcw64GzzsYmbgVTPH6sZ91kSGiB8pLwbzp9fWUHZKGf1njQ93cjhPyuKAvmawJncvojY4jAviWAiCt?cluster=devnet)  |
| Sell 13,066,665 PACE back to the curve (frees allowance)             | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/3nebVRTP6huYvLMp3BWxyovj76TqLNnE57fPX9aFSG3dBwjDTQYkPiHPBGkDaaueVAmkVpZ9Lhedx8jj9gUCxKCS?cluster=devnet) |
| Wallet-to-wallet transfer of 11,106,665 PACE passes the hook         | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/34bjw9o1dwt1EJNnbHyC4TBSQaMjorNLgYfZHWDvwYx5Vai8JbWioXVA4J3BtTDaCha1itX98P9eEjzXJj1p9D1b?cluster=devnet) |
| Final paced buy completes the curve                                  | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/4bfuUpwZXwp4aVWLdZLNvHquuhE6RghhZ3VD8riFRyYq44CAZ1cPR56y32iZhAaEUt7JxKWDGxj8wm9iK241xdQ9?cluster=devnet) |
| DBC revoked the Pacer hook on graduation                             | ✅                                                                                                        | —                                                                                                                                            |
| Graduated into compounding DAMM v2 pool (100% LP permanently locked) | ✅                                                                                                        | [tx](https://explorer.solana.com/tx/C5u4ojtDNpGoXpzir5XWJJmiukiD9e7dPyQgD3dsdMUSKF3WCbNLcJGuVZmVeEbn6fMtekVLKU3Sus1eTurS8CH?cluster=devnet)  |

Full machine-readable report: [`demo-runs/latest-devnet.json`](demo-runs/latest-devnet.json) (every signature, plus the supply timeline).
<!-- devnet-run:end -->

## How it works

1. **A partner creates a DBC config with Pacer as the transfer hook.** Token-2022 base mint, 1% base curve fee (plus DBC's dynamic fee), graduation into a compounding DAMM v2 pool, LP split between partner and creator and permanently locked.
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
- **The program is upgradeable on devnet, by a single key.** Its upgrade authority could change or switch off the rules for tokens still on their curve (it can't move anyone's funds, and has no effect after graduation). Before mainnet it becomes immutable or moves to a timelocked multisig; see [SECURITY.md](SECURITY.md#upgrade-authority).
- Pacer reads DBC's `TransferHookPool` layout by fixed offsets (DBC v0.2.1).

## Roadmap

- **Session-aware clocks:** release supply only during market hours, for launches quoted in tokenized stocks.
- **Per-wallet allowances** with hand-resolved hook accounts.
- **Partner presets:** let a DBC partner enforce a minimum clock for every pool on its config.
- **Batch clearing:** one uniform price per release window instead of first-come slices.

## License

[MIT](LICENSE)
