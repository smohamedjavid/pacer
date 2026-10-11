#!/usr/bin/env bash
# Local validator with Meteora DBC + DAMM v2 cloned from devnet and Pacer preloaded.
# Usage: ./bin/localnet.sh   (then: PACER_CLUSTER=localnet pnpm demo | pnpm test)
set -euo pipefail
cd "$(dirname "$0")/.."

DBC=dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
DAMM_V2=cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
DBC_POOL_AUTHORITY=FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM  # fronts migration rent
DAMM_V2_CUSTOMIZABLE_CONFIG=A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck
PACER=4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM  # declare_id! in programs/pacer/src/lib.rs
DEPLOYER=${DEPLOYER_KEYPAIR:-.keys/deployer.json}

[[ -f target/deploy/pacer.so ]] || anchor build
[[ -f "$DEPLOYER" ]] || { mkdir -p .keys && solana-keygen new --no-bip39-passphrase -s -o "$DEPLOYER"; }

exec solana-test-validator --reset --quiet --ledger .anchor/test-ledger --url devnet \
  --clone-upgradeable-program "$DBC" \
  --clone-upgradeable-program "$DAMM_V2" \
  --clone "$DBC_POOL_AUTHORITY" \
  --clone "$DAMM_V2_CUSTOMIZABLE_CONFIG" \
  --upgradeable-program "$PACER" target/deploy/pacer.so "$DEPLOYER" \
  --mint "$(solana-keygen pubkey "$DEPLOYER")"
