# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-10-11

### Added

- `pacer` Anchor program: Token-2022 transfer hook for Meteora DBC that meters net supply out of the curve against a published schedule (opening tranche + release per second), with an optional max per buy and a token-bucket burst limit.
- `@pacer/sdk`: PDAs, clock math mirrored from the program, DBC config/launch/buy/sell/migrate builders with slippage protection, exact curve-price model and price speed limit, hook event parsing.
- Scripts: devnet/localnet lifecycle demo, shared-config, launch and attack commands; 13 integration tests against Meteora's real DBC and DAMM v2 binaries.
- Next.js app: launch form, live Issuance Clock and Price speed limit, trading, graduation, activity feed.
- Docs: architecture, security model, contributing guide; CI.

### Security

- Net supply is read from DBC's pool reserves instead of being counted by the hook; donations to the vault and calls outside a real transfer of the mint can't move the clock.
- Trades are classified by DBC reserve changes, so base-token fee claims and other non-trade vault transfers are never metered or blocked.
- Sells refill the burst bucket, so buying and selling straight back can't keep it empty for others.
