# @pacer/scripts

Operational scripts and integration tests. All commands take `PACER_CLUSTER=localnet|devnet` (default `localnet`) and optional `RPC_URL`; the signer is `.keys/deployer.json` (override with `DEPLOYER_KEYPAIR`).

| Command                                      | What it does                                                                                                                                                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @pacer/scripts test`          | 13 integration and security tests against Meteora DBC + DAMM v2 on localnet (start `pnpm localnet` first)                                                                   |
| `pnpm demo`                                  | Full lifecycle: config, launch + clock, rejected sniper, burst of bots, paced buys, sell, transfer, graduation, DAMM v2 migration; writes `demo-runs/latest-<cluster>.json` |
| `pnpm --filter @pacer/scripts create-config` | Shared DBC config for the app; writes `demo-runs/config-<cluster>.json`                                                                                                     |
| `pnpm --filter @pacer/scripts launch`        | One paced launch into the shared config; prints the mint and app path                                                                                                       |
| `pnpm --filter @pacer/scripts attack <mint>` | Greedy and same-moment bot buys against a live launch; rejected attempts land on-chain                                                                                      |

Demo tuning via env: `CLOCK_SECONDS`, `MIGRATION_SOL`, `OPENING_BPS`, `MAX_PER_BUY_BPS`, `BURST_BPS`, `BUYERS`, `SWEEP_SOL`, `MIN_SLICE_BPS`.

On devnet, throwaway wallets are saved to `demo-runs/wallets-*.json` (gitignored, mode 0600), and their SOL is always swept back to the deployer, even if a run fails. Public RPC rate limits (HTTP 429) are retried with exponential backoff.
