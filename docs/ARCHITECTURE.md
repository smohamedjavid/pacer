# Architecture

Pacer adds one rule to a Meteora Dynamic Bonding Curve (DBC) launch: supply leaves the curve no faster than a clock published at launch. Everything else (pricing, fees, graduation, migration) is DBC and DAMM v2, unchanged.

```text
released(t) = opening_tranche + release_per_second · (t − start_ts)
buy allowed  ⇔  net_out_after_buy ≤ released(now)
               ∧  amount ≤ burst_level(now)        (token bucket: refills at release_per_second and on sells, capped)
               ∧  amount ≤ max_per_buy
net_out      = initial_base_reserve − pool.base_reserve        (read from DBC)
price(t)     ≤ curve_price(min(released(t), curve_supply))     (the price speed limit)
```

## Components

| Layer              | Component                                             | Responsibility                                                                                          |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| On-chain (Pacer)   | `pacer` Anchor program                                | `initialize_pace` (creator-only, once per mint) and `execute` (the Token-2022 transfer hook)            |
| On-chain (Meteora) | DBC `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN`     | Transfer-hook config and pool, `swap2_with_transfer_hook`, curve completion, hook revocation, migration |
| On-chain (Meteora) | DAMM v2 `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG` | Graduated pool: compounding fees, dynamic fee, permanently locked LP                                    |
| Off-chain          | `@pacer/sdk`                                          | PDAs, clock math (`releasedAt`, `availableToBuy`), DBC transaction builders, error decoding             |
| Off-chain          | `scripts`                                             | Lifecycle demo and integration tests against the real DBC/DAMM v2 binaries                              |
| Frontend           | `app` (Next.js)                                       | Launch form, live Issuance Clock, hook-aware trading, permissionless graduation                         |

## Accounts

| Account                | Seeds                           | Contents                                                                                                                                                                                                             |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PaceState`            | `["pace", mint]`                | mint, pool, base vault, creator, `start_ts`, `opening_tranche`, `release_per_second`, `max_per_buy`, burst bucket (`burst_capacity`, `burst_level`, `burst_updated_ts`), `initial_base_reserve`, `net_out`, counters |
| `ExtraAccountMetaList` | `["extra-account-metas", mint]` | Two extra accounts for `execute`: `PaceState` (seeded by the mint) and the DBC pool (fixed address)                                                                                                                  |

Neither extra account depends on the trader's wallet. That matters: the DBC SDK resolves hook accounts with placeholder keys for source, destination and owner, so wallet-derived accounts would resolve wrongly. Pacer's resolve correctly with any standard resolver.

## Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Partner
    actor Creator
    actor Buyer
    participant DBC as Meteora DBC
    participant T22 as Token-2022
    participant Pacer as Pacer hook
    participant DAMM as DAMM v2

    Partner->>DBC: create_config_with_transfer_hook(hook = Pacer, Token-2022, compounding DAMM v2 migration)
    Creator->>DBC: initialize_virtual_pool_with_token2022_transfer_hook
    Creator->>Pacer: initialize_pace(opening, rate, max_per_buy, burst_capacity)  [same transaction]
    Note over Pacer: checks pool owner/discriminator,<br/>base_mint, creator signer, mint hook = Pacer<br/>stores initial_base_reserve, start_ts, burst bucket

    Buyer->>DBC: swap2_with_transfer_hook (quote → base)
    DBC->>DBC: apply swap to reserves
    DBC->>T22: transfer_checked(base_vault → buyer)
    T22->>Pacer: execute(amount)
    Pacer->>Pacer: net_out = initial − pool.base_reserve<br/>require net_out ≤ released(now), taken ≤ max, taken ≤ bucket
    Pacer-->>T22: ok / AheadOfClock / ExceedsMaxPerBuy / BurstLimit

    Buyer->>DBC: final buy reaches migration_quote_threshold
    DBC->>T22: revoke transfer hook program + authority
    Note over Pacer: no longer invoked; the token is a plain Token-2022 asset

    Buyer->>DBC: migrate_to_damm_v2 (permissionless)
    DBC->>DAMM: create pool, compounding fees, LP permanently locked
```

## Why a transfer hook

- **A wrapper can be bypassed; a hook can't.** A program that wraps DBC swaps only constrains users who go through it. Anyone can call DBC directly. Token-2022 calls the hook on every transfer of the mint, so the clock holds whatever route a buyer takes.
- **The trust boundary ends at graduation.** DBC revokes the hook when the curve completes. After that, Pacer has no power over the token at all.
- **No custody, no admin instruction.** Pacer never holds tokens or SOL, and no instruction lets anyone change a launch's schedule or move funds. The program is immutable (upgrade authority revoked) and its on-chain bytes match a verified build of this repository; see [SECURITY.md](../SECURITY.md#upgrade-authority).

## How this differs from DBC's rate limiter

DBC once offered a "rate limiter" base-fee mode (deprecated for new configs) that raised the _fee_ on large buys within a window. Pacer is not a fee:

|                                 | DBC rate limiter (deprecated) | Pacer                                                 |
| ------------------------------- | ----------------------------- | ----------------------------------------------------- |
| Constrains                      | Fee paid per buy              | Cumulative supply out of the curve                    |
| Time model                      | Fixed window after launch     | Continuous schedule until the whole curve is released |
| Large buy early                 | Allowed, pays more            | Reverts                                               |
| Sells                           | Not considered                | Free allowance (read from DBC reserves)               |
| Composes with DBC fee scheduler | Replaces it                   | Yes; any base-fee mode                                |

## Design choices

- **`net_out` comes from DBC, not from the hook.** Counting transfers in and out of the vault is spoofable (anyone can transfer tokens _into_ the vault). DBC applies each swap to `base_reserve` before it moves tokens, so reading the reserve inside the hook gives the exact post-trade supply outside the curve.
- **A burst bucket on top of the clock.** A cumulative schedule alone lets allowance accumulate during quiet periods and be swept in one block. The bucket refills at the clock's rate up to a capacity, so any short window is bounded across all wallets. Sells refill it too, so it bounds _net_ outflow per window: buying and selling straight back can't keep it empty for everyone else. It needs per-launch state, which declarative hook rule engines don't keep.
- **The price ceiling is a by-product, computed exactly.** Capping supply out of the curve caps the curve price. `priceAtNetOut` walks DBC's constant-product segments from the start price; a test checks it against the pool's live `sqrt_price`.
- **Creator sets the schedule at launch, once.** No update instruction exists. A published schedule that can't change is the point.
- **Exact-out buys.** The SDK and app buy the exact base amount the clock has released, so buyers don't overshoot and revert.
- **Low, steady curve fee.** Pacer replaces punitive anti-snipe fees (up to 99% decaying), so the demo config uses a 1% base fee (plus DBC's volatility-based dynamic fee) and lets the clock do the work.
- **All graduated LP permanently locked, compounding.** The DAMM v2 pool can't be drained after graduation, and fees deepen liquidity over time.
