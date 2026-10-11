/**
 * Throw bots at a live paced launch, for demos: an ahead-of-clock buy and a same-second burst.
 * Rejected transactions are sent without preflight so they land on-chain (and in the app's
 * activity feed as "Blocked"). Leftover SOL is returned to the deployer.
 *
 *   PACER_CLUSTER=devnet pnpm --filter @pacer/scripts attack <MINT>
 */
import { availableToBuy, buildPacedBuyTx, fetchPaceState, pacerErrorFromLogs, releasedAt } from '@pacer/sdk'
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import { CLUSTER, chainTime, connection, explorerTx, fund, sendExpectFailure, sweepBack } from './env.js'

function fmt(base: bigint): string {
  return (Number(base) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

async function main() {
  const mintArg = process.argv[2]
  if (!mintArg) throw new Error('usage: attack <MINT>')
  const mint = new PublicKey(mintArg)
  const pace = await fetchPaceState(connection, mint)
  if (!pace) throw new Error(`no Pacer clock for mint ${mint.toBase58()}`)

  const bots = [Keypair.generate(), Keypair.generate(), Keypair.generate()]
  const describe = (r: { ok: boolean; logs?: string[]; error?: string }) =>
    r.ok
      ? 'filled'
      : `BLOCKED — ${pacerErrorFromLogs(r.logs) ?? r.logs?.find((l) => l.includes('Error')) ?? r.error ?? 'failed'}`
  /** Build a buy, then fund the bot with exactly what it may spend (plus fees and rent). */
  const prepare = async (bot: Keypair, amount: bigint) => {
    const built = await buildPacedBuyTx(connection, {
      owner: bot.publicKey,
      pool: pace.pool,
      baseAmountOut: new BN(amount.toString()),
      slippageBps: 5_000,
    })
    await fund(bot.publicKey, built.maxQuoteIn.toNumber() / LAMPORTS_PER_SOL + 0.02)
    return built.transaction
  }

  try {
    const now = await chainTime()
    const available = availableToBuy(pace, now)

    // 1. A greedy bot asks for three times what Pacer allows right now.
    const greedy = (available > 0n ? available : releasedAt(pace, now + 10) - pace.netOut) * 3n + 1n
    const greedyRes = await sendExpectFailure(await prepare(bots[0]!, greedy), [bots[0]!])
    console.log(`Greedy bot asks ${fmt(greedy)} (available ${fmt(available)}): ${describe(greedyRes)}`)
    console.log(`  ${explorerTx(greedyRes.signature!)}`)

    // 2. Three bots each try to take everything available, in the same moment.
    const fresh = (await fetchPaceState(connection, mint))!
    const slice = availableToBuy(fresh, await chainTime())
    const txs = []
    for (const bot of bots) txs.push(await prepare(bot, slice))
    const results = await Promise.all(txs.map((tx, i) => sendExpectFailure(tx, [bots[i]!])))
    for (const [i, r] of results.entries()) {
      console.log(`Bot ${i + 1} grabs ${fmt(slice)} at the same moment: ${describe(r)}`)
      console.log(`  ${explorerTx(r.signature!)}`)
    }
  } finally {
    if (CLUSTER === 'devnet') console.log(`Returned ${(await sweepBack(bots)).toFixed(3)} SOL to the deployer`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
