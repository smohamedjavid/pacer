# Security

Pacer is unaudited hackathon software. It is deployed on devnet only. Do not use it with real funds.

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Advisories → Report a vulnerability) rather than a public issue.

## Trust model

Pacer is a Token-2022 transfer hook attached to a Meteora DBC pool's base mint. Its authority is deliberately narrow:

| Pacer can                                                                             | Pacer cannot                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Reject a buy that would take more supply out of the curve than the clock has released | Move, mint, freeze or burn anyone's tokens                         |
| Reject a single buy larger than `max_per_buy`                                         | Block sells or wallet-to-wallet transfers                          |
| Reject a buy that would overdraw the burst bucket                                     |                                                                    |
| Record counters (buys, sells, totals)                                                 | Change the schedule after launch (no admin, no update instruction) |
|                                                                                       | Run after graduation: DBC revokes the hook on curve completion     |

The pool creator sets the schedule once, inside the launch transaction. There is no upgradeable configuration, no fee, and no privileged role in the program after `initialize_pace`.

## Threats and mitigations

| Threat                                                                                               | Mitigation                                                                                                                               | Test                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Calling `execute` directly to move the clock                                                         | `execute` requires the source token account's `TransferHookAccount.transferring` flag, which Token-2022 sets only during a real transfer | `calling the hook directly (outside a transfer) is rejected`                                |
| Another token's hook replaying Pacer while its own transfer is in flight                             | The source account must hold the paced mint (`source.mint == mint`); `pace_state` is a PDA of that mint with `has_one = mint, pool`      | covered by the same check; see `assert_transferring_this_mint`                              |
| Donating tokens straight into the curve vault to "free" allowance                                    | Net supply is read from DBC's own pool accounting (`initial_base_reserve - base_reserve`), which only DBC swaps change                   | `donating tokens straight into the curve vault does not free allowance`                     |
| Front-running `initialize_pace` with hostile parameters                                              | Only the DBC pool `creator` (read from the pool account) can initialize; the PDA can be created once                                     | `only the DBC pool creator can start the clock`, `a running clock cannot be re-initialized` |
| Passing a fake pool                                                                                  | Pool must be owned by the DBC program, have the `TransferHookPool` discriminator and length, and its `base_mint` must equal the mint     | `initialize_pace` checks                                                                    |
| Mint with a different hook                                                                           | `initialize_pace` requires the mint's TransferHook program to be Pacer                                                                   | `initialize_pace` checks                                                                    |
| Legitimate vault outflows (base-token fee claims, leftover withdrawals) blocked as if they were buys | Trades are classified by the change in DBC's `base_reserve`; vault transfers that don't move the reserves pass unmetered                 | `base-token fee claims from the curve vault are not metered as buys`                        |
| Idle allowance swept in one block after a quiet period                                               | Token-bucket burst limit refilled at the clock rate, shared by all wallets                                                               | `the burst limit caps back-to-back buys even when the clock has allowance`                  |
| Griefing the shared burst bucket by buying and selling straight back                                 | Sells refill the bucket by the amount returned, so it limits net outflow per window                                                      | `buying and selling straight back cannot keep the burst bucket empty`                       |
| Arithmetic overflow                                                                                  | Saturating math for the release schedule and bucket; every subtraction is guarded by a comparison                                        | `release_saturates_instead_of_overflowing`                                                  |

## Known limitations

- **Sybil buyers.** The clock and burst bucket limit how fast supply leaves the curve, not who receives it. Many wallets can still compete for each released slice; `max_per_buy` bounds any single transaction. Per-wallet limits are on the roadmap.
- **Closing the program freezes live curves.** A transfer hook program that no longer exists makes every transfer of its mints fail. The program must never be closed while any curve is live. The upgrade authority should move to a multisig before any mainnet use.
- **Aggregator routing.** Like every hook token, a Pacer token cannot be routed by aggregators that don't resolve transfer-hook accounts while it is on the curve. Pacer's extra accounts derive only from the mint and pool, so any standard resolver handles them, including the DBC SDK's.
- **Dependency on DBC's pool layout.** Pacer reads `base_mint`, `base_vault`, `creator` and `base_reserve` from DBC's `TransferHookPool` by fixed byte offsets (verified against DBC v0.2.1). A DBC layout change would require a Pacer upgrade.
