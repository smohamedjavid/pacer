/**
 * Launch one paced token into the shared config (from `create-config`), signed by the deployer.
 *
 *   PACER_CLUSTER=devnet CLOCK_SECONDS=600 pnpm --filter @pacer/scripts launch
 *
 * Prints the mint and the app path to open (`/t/<mint>`).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildPacedLaunchTx, fetchPaceState } from '@pacer/sdk'
import { Keypair, PublicKey } from '@solana/web3.js'
import { CLUSTER, ROOT, connection, deployer, explorerAddress, explorerTx, send } from './env.js'

const CLOCK_SECONDS = Number(process.env.CLOCK_SECONDS ?? 600)
const OPENING_BPS = Number(process.env.OPENING_BPS ?? 200)
const MAX_PER_BUY_BPS = Number(process.env.MAX_PER_BUY_BPS ?? 600)
const BURST_BPS = Number(process.env.BURST_BPS ?? 1_200)
const NAME = process.env.NAME ?? 'Pacer Demo'
const SYMBOL = process.env.SYMBOL ?? 'PACE'
const URI = process.env.URI ?? 'https://raw.githubusercontent.com/smohamedjavid/pacer/main/app/public/token.json'

function sharedConfig(): PublicKey {
  if (process.env.PACER_CONFIG) return new PublicKey(process.env.PACER_CONFIG)
  const file = resolve(ROOT, `demo-runs/config-${CLUSTER}.json`)
  return new PublicKey((JSON.parse(readFileSync(file, 'utf8')) as { config: string }).config)
}

async function main() {
  const config = sharedConfig()
  const mintKp = Keypair.generate()
  const { transaction, pool } = await buildPacedLaunchTx(connection, {
    payer: deployer.publicKey,
    creator: deployer.publicKey,
    config,
    baseMint: mintKp.publicKey,
    name: NAME,
    symbol: SYMBOL,
    uri: URI,
    schedule: {
      openingBps: OPENING_BPS,
      clockSeconds: CLOCK_SECONDS,
      maxPerBuyBps: MAX_PER_BUY_BPS,
      burstBps: BURST_BPS,
    },
  })
  const res = await send(transaction, [deployer, mintKp])
  if (!res.ok) throw new Error(`${res.error}\n${res.logs?.join('\n')}`)
  const pace = await fetchPaceState(connection, mintKp.publicKey)
  console.log(`mint ${mintKp.publicKey.toBase58()}`)
  console.log(`pool ${pool.toBase58()}  ${explorerAddress(pool)}`)
  console.log(`tx   ${explorerTx(res.signature!)}`)
  console.log(`clock starts ${new Date(pace!.startTs * 1000).toISOString()}, runs ${CLOCK_SECONDS}s`)
  console.log(`app  /t/${mintKp.publicKey.toBase58()}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
