# @pacer/app

Next.js 15 (App Router, React 19, Tailwind v4) front end for Pacer.

| Route       | What                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `/`         | Live chronograph of the newest launch, how it works, and the launch board                                                             |
| `/launch`   | Schedule form (clock length, opening tranche, max per buy, burst limit) with a live preview; launches pool + clock in one transaction |
| `/t/[mint]` | Issuance Clock and Price speed limit charts, live stats, exact-out buy / sell, permissionless graduation to DAMM v2, activity feed    |

```bash
cp .env.example .env.local   # devnet by default
pnpm dev                     # from the repo root
```

Wallets are detected via Wallet Standard (Phantom, Solflare, Backpack). Every transaction is simulated before the wallet prompt so Pacer's own revert reason (for example _Buy is ahead of the issuance clock_) is shown instead of a generic error.
