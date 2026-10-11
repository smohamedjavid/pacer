# Contributing

## Setup

Prerequisites: Rust (stable), Solana CLI 2.3+, Anchor 0.32, Node 20+, pnpm 10.

```bash
pnpm install
pnpm build:program        # anchor build + sync IDL into packages/sdk
pnpm localnet             # terminal 1: validator with Meteora DBC + DAMM v2 cloned from devnet
pnpm test                 # terminal 2: integration + security tests
pnpm test:program         # Rust unit tests
```

On macOS 27 SDKs, the Solana platform tools' linker may fail to parse the system `.tbd` files. Build with an older SDK:
`SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk anchor build`.

## Conventions

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- **Rust:** `cargo fmt` and `cargo clippy --all-targets -- -D warnings` must pass. Every account read from another program is validated (owner, discriminator, length, key relationships) before use.
- **TypeScript:** strict mode with `noUncheckedIndexedAccess`; no `any`. Prettier settings live in `.prettierrc`.
- **IDL:** never edit `packages/sdk/src/idl/*`; run `pnpm sync-idl` after `anchor build`.
- **Tests:** a change to the hook needs a localnet test in `scripts/src/tests/` that exercises it through a real DBC swap.

## Layout

| Path             | What                                                          |
| ---------------- | ------------------------------------------------------------- |
| `programs/pacer` | Anchor transfer-hook program                                  |
| `packages/sdk`   | TypeScript SDK (`@pacer/sdk`): PDAs, clock math, DBC builders |
| `scripts`        | Devnet/localnet lifecycle demo and integration tests          |
| `app`            | Next.js web app                                               |
| `bin`            | Localnet and IDL tooling                                      |
| `docs`           | Architecture and design notes                                 |
