/**
 * Create the shared Pacer DBC config that the web app launches into.
 *
 *   PACER_CLUSTER=devnet MIGRATION_SOL=2 pnpm --filter @pacer/scripts create-config
 *
 * Prints the config address; set it as NEXT_PUBLIC_PACER_CONFIG for the app.
 */
import { buildCreatePacedConfigTx, buildPacedCurveConfig, DEFAULT_PACED_CURVE } from '@pacer/sdk'
import { Keypair } from '@solana/web3.js'
import { CLUSTER, connection, deployer, explorerAddress, explorerTx, send, writeRunReport } from './env.js'

const MIGRATION_SOL = Number(process.env.MIGRATION_SOL ?? (CLUSTER === 'devnet' ? 2 : 5))

async function main() {
  const configKp = Keypair.generate()
  const tx = await buildCreatePacedConfigTx(connection, {
    payer: deployer.publicKey,
    config: configKp.publicKey,
    feeClaimer: deployer.publicKey,
    curve: buildPacedCurveConfig({ ...DEFAULT_PACED_CURVE, migrationQuoteThreshold: MIGRATION_SOL }),
  })
  const res = await send(tx, [deployer, configKp])
  if (!res.ok) throw new Error(`${res.error}\n${res.logs?.join('\n')}`)
  const out = {
    cluster: CLUSTER,
    config: configKp.publicKey.toBase58(),
    partner: deployer.publicKey.toBase58(),
    migrationQuoteThresholdSol: MIGRATION_SOL,
    signature: res.signature,
  }
  writeRunReport(`config-${CLUSTER}`, out)
  console.log(`config ${out.config}\n${explorerAddress(out.config)}\n${explorerTx(res.signature!)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
