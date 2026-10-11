/**
 * End-to-end Pacer lifecycle against Meteora's real DBC + DAMM v2 programs.
 *
 *   PACER_CLUSTER=localnet pnpm demo     # local validator with programs cloned from devnet
 *   PACER_CLUSTER=devnet   pnpm demo     # public devnet
 *
 * 1. Partner creates a DBC config whose pools carry the Pacer hook.
 * 2. Creator launches a pool and starts its issuance clock in the same transaction.
 * 3. A sniper tries to sweep the curve in one transaction — the hook reverts it.
 * 4. Buyers fill the curve at the pace the clock releases supply; a sell frees allowance;
 *    a wallet-to-wallet transfer passes untouched.
 * 5. The final buy completes the curve; DBC revokes the hook on the mint.
 * 6. Anyone migrates the pool into a compounding DAMM v2 pool.
 */
import {
  DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG,
  DynamicBondingCurveClient,
  availableToBuy,
  buildCreatePacedConfigTx,
  buildFillCurveBuyTx,
  buildPacedBuyTx,
  buildPacedCurveConfig,
  buildPacedLaunchTx,
  buildQuoteInBuyTx,
  buildSellTx,
  clockEndsAt,
  DEFAULT_PACED_CURVE,
  fetchPaceState,
  pacerErrorFromLogs,
  releasedAt,
} from '@pacer/sdk'
import { deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getTransferHook,
} from '@solana/spl-token'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js'
import BN from 'bn.js'
import {
  CLUSTER,
  chainTime,
  connection,
  deployer,
  explorerAddress,
  explorerTx,
  fund,
  send,
  sendExpectFailure,
  sleep,
  sweepBack,
  saveWallets,
  writeRunReport,
} from './env.js'

const CLOCK_SECONDS = Number(process.env.CLOCK_SECONDS ?? (CLUSTER === 'devnet' ? 300 : 240))
const MIGRATION_SOL = Number(process.env.MIGRATION_SOL ?? (CLUSTER === 'devnet' ? 1 : 5))
const OPENING_BPS = Number(process.env.OPENING_BPS ?? 200) // 2% at open
const MAX_PER_BUY_BPS = Number(process.env.MAX_PER_BUY_BPS ?? 800) // 8% per buy
const BURST_BPS = Number(process.env.BURST_BPS ?? 1_600) // at most 16% in a burst
const BUYERS = Number(process.env.BUYERS ?? 3)
// Smallest slice worth a transaction (bps of curve supply); larger on devnet to spare the public RPC.
const MIN_SLICE_BPS = Number(process.env.MIN_SLICE_BPS ?? (CLUSTER === 'devnet' ? 300 : 25))
const TOKEN_DECIMALS = 6

interface Step {
  step: string
  ok: boolean
  signature?: string
  explorer?: string
  detail?: Record<string, unknown>
}

const steps: Step[] = []
const wallets: Keypair[] = []
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-')

/** Remember a throwaway wallet (and persist its key) so its SOL can always be swept back. */
function track(kp: Keypair): Keypair {
  wallets.push(kp)
  saveWallets(`wallets-${CLUSTER}-${RUN_ID}`, wallets)
  return kp
}
const timeline: Array<{ t: number; released: string; netOut: string }> = []

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)
}

function fmt(base: bigint | BN): string {
  const v = typeof base === 'bigint' ? base : BigInt(base.toString())
  return (Number(v) / 10 ** TOKEN_DECIMALS).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function record(s: Step) {
  steps.push(s.signature ? { ...s, explorer: explorerTx(s.signature) } : s)
  log(`${s.ok ? '✓' : '✗'} ${s.step}${s.signature ? `  ${explorerTx(s.signature)}` : ''}`)
}

async function main() {
  log(`Cluster: ${CLUSTER} · clock ${CLOCK_SECONDS}s · graduation at ${MIGRATION_SOL} SOL`)
  const dbc = DynamicBondingCurveClient.create(connection, 'confirmed')

  // ── Wallets ────────────────────────────────────────────────────────────────
  const creator = track(Keypair.generate())
  const sniper = track(Keypair.generate())
  const buyers = Array.from({ length: BUYERS }, () => track(Keypair.generate()))
  const devnet = CLUSTER === 'devnet'
  await fund(creator.publicKey, devnet ? 0.08 : 5)
  // The sniper's sweep must be large enough to matter; on devnet it is sent anyway and fails.
  await fund(sniper.publicKey, devnet ? MIGRATION_SOL * 0.6 : MIGRATION_SOL * 2)
  for (const b of buyers) await fund(b.publicKey, devnet ? MIGRATION_SOL / BUYERS + 0.12 : MIGRATION_SOL)
  log(`Funded creator, sniper and ${BUYERS} buyers`)

  // ── 1. Partner config ─────────────────────────────────────────────────────
  const configKp = Keypair.generate()
  const curve = buildPacedCurveConfig({ ...DEFAULT_PACED_CURVE, migrationQuoteThreshold: MIGRATION_SOL })
  const configTx = await buildCreatePacedConfigTx(connection, {
    payer: deployer.publicKey,
    config: configKp.publicKey,
    feeClaimer: deployer.publicKey,
    curve,
  })
  const configRes = await send(configTx, [deployer, configKp])
  record({ step: 'Partner creates Pacer-hooked DBC config', ok: configRes.ok, signature: configRes.signature })
  if (!configRes.ok) throw new Error(`config failed: ${configRes.error}\n${configRes.logs?.join('\n')}`)

  // ── 2. Launch + start the issuance clock ──────────────────────────────────
  const mintKp = Keypair.generate()
  const {
    transaction: launchTx,
    pool,
    curveSupply,
  } = await buildPacedLaunchTx(connection, {
    payer: creator.publicKey,
    creator: creator.publicKey,
    config: configKp.publicKey,
    baseMint: mintKp.publicKey,
    name: 'Pacer Demo',
    symbol: 'PACE',
    uri: 'https://raw.githubusercontent.com/smohamedjavid/pacer/main/app/public/token.json',
    schedule: {
      openingBps: OPENING_BPS,
      clockSeconds: CLOCK_SECONDS,
      maxPerBuyBps: MAX_PER_BUY_BPS,
      burstBps: BURST_BPS,
    },
  })
  const launchRes = await send(launchTx, [creator, mintKp])
  record({
    step: 'Creator launches pool + starts issuance clock (one tx)',
    ok: launchRes.ok,
    signature: launchRes.signature,
    detail: { pool: pool.toBase58(), mint: mintKp.publicKey.toBase58(), curveSupply: fmt(curveSupply) },
  })
  if (!launchRes.ok) throw new Error(`launch failed: ${launchRes.error}\n${launchRes.logs?.join('\n')}`)
  const mint = mintKp.publicKey
  const curveTotal = BigInt(curveSupply.toString())

  let pace = await fetchPaceState(connection, mint)
  if (!pace) throw new Error('pace state missing')
  log(
    `Clock: ${fmt(pace.openingTranche)} PACE at open, +${fmt(pace.releasePerSecond)}/s, ` +
      `max ${fmt(pace.maxPerBuy)}/buy, burst ${fmt(pace.burstCapacity)}, curve supply ${fmt(curveTotal)}, ` +
      `full release at +${clockEndsAt(pace, curveTotal) - pace.startTs}s`
  )

  // ── 3. Sniper tries to buy ahead of the clock, right at open ───────────────
  // Under the per-buy cap but beyond what's released (with margin so the clock can't catch
  // up while the transaction is in flight on a slow RPC).
  const aheadAmount = pace.maxPerBuy > 0n ? (pace.maxPerBuy * 95n) / 100n : pace.openingTranche * 3n
  const releasedSoon = releasedAt(pace, (await chainTime()) + 10)
  if (aheadAmount <= releasedSoon) throw new Error('clock too fast for the ahead-of-clock step; raise CLOCK_SECONDS')
  const { transaction: aheadTx } = await buildPacedBuyTx(connection, {
    owner: sniper.publicKey,
    pool,
    baseAmountOut: new BN(aheadAmount.toString()),
  })
  const aheadRes = await sendExpectFailure(aheadTx, [sniper])
  record({
    step: `Sniper buys ${fmt(aheadAmount)} PACE (under the cap, ahead of the clock)`,
    ok: !aheadRes.ok,
    signature: aheadRes.signature,
    detail: { reverted: !aheadRes.ok, reason: pacerErrorFromLogs(aheadRes.logs) ?? aheadRes.error },
  })
  if (aheadRes.ok) throw new Error('expected the ahead-of-clock buy to revert')
  log(`  ↳ reverted by Pacer: ${pacerErrorFromLogs(aheadRes.logs)}`)

  // A full sweep is stopped even earlier, by the per-buy cap.
  const sweepLamports = new BN(Math.floor(MIGRATION_SOL * 0.5 * LAMPORTS_PER_SOL))
  const sweepTx = await buildQuoteInBuyTx(connection, { owner: sniper.publicKey, pool, quoteAmountIn: sweepLamports })
  const sweepRes = await sendExpectFailure(sweepTx, [sniper])
  record({
    step: `Sniper sweeps ${MIGRATION_SOL * 0.5} SOL in block one`,
    ok: !sweepRes.ok, // success = the hook rejected it
    signature: sweepRes.signature,
    detail: { reverted: !sweepRes.ok, reason: pacerErrorFromLogs(sweepRes.logs) ?? sweepRes.error },
  })
  if (sweepRes.ok) throw new Error('expected the sweep to revert')
  log(`  ↳ reverted by Pacer: ${pacerErrorFromLogs(sweepRes.logs)}`)

  // ── 3b. Quiet period, then three bots fire in the same second ───────────────
  // Without a burst limit, allowance that piles up while nobody buys could be swept at once.
  const bots = [track(Keypair.generate()), track(Keypair.generate()), track(Keypair.generate())]
  for (const bot of bots) await fund(bot.publicKey, CLUSTER === 'devnet' ? 0.15 : 2)
  const burstSlice = pace.maxPerBuy
  for (;;) {
    const p = (await fetchPaceState(connection, mint))!
    if (releasedAt(p, await chainTime()) - p.netOut >= burstSlice * 3n) break
    await sleep(2_000)
  }
  const botTxs = await Promise.all(
    bots.map((bot) =>
      // Generous slippage: quotes are taken before any bot fills, so only Pacer should stop them.
      buildPacedBuyTx(connection, {
        owner: bot.publicKey,
        pool,
        baseAmountOut: new BN(burstSlice.toString()),
        slippageBps: 5_000,
      })
    )
  )
  const botResults = await Promise.all(botTxs.map(({ transaction }, i) => sendExpectFailure(transaction, [bots[i]!])))
  const blocked = botResults.filter((r) => !r.ok)
  for (const [i, r] of botResults.entries()) {
    record({
      step: `Bot ${i + 1} buys ${fmt(burstSlice)} PACE in the same burst`,
      ok: true,
      signature: r.signature,
      detail: { filled: r.ok, reason: r.ok ? undefined : (pacerErrorFromLogs(r.logs) ?? r.error) },
    })
  }
  if (!blocked.some((r) => pacerErrorFromLogs(r.logs)?.includes('burst'))) {
    throw new Error(
      `expected the burst limit to block a bot: ${blocked.map((r) => r.logs?.slice(-3).join(' | ')).join(' || ')}`
    )
  }
  log(
    `  ↳ ${botResults.length - blocked.length} filled, ${blocked.length} blocked by the burst limit: ${pacerErrorFromLogs(blocked[0]!.logs)}`
  )

  // ── 4. Paced buying ───────────────────────────────────────────────────────
  const participants = [sniper, ...buyers]
  let turn = 0
  let soldOnce = false
  let transferredOnce = false
  const minSlice = (curveTotal * BigInt(MIN_SLICE_BPS)) / 10_000n

  for (;;) {
    pace = (await fetchPaceState(connection, mint))!
    const now = await chainTime()
    const released = releasedAt(pace, now)
    timeline.push({ t: now - pace.startTs, released: released.toString(), netOut: pace.netOut.toString() })
    const remaining = curveTotal - pace.netOut
    const available = availableToBuy(pace, now, curveTotal)

    if (remaining <= available && remaining > 0n) {
      // Final buy: take whatever is left; DBC completes the curve (partial fill refunds the rest).
      const balances = await Promise.all(participants.map((p) => connection.getBalance(p.publicKey)))
      const richest = balances.indexOf(Math.max(...balances))
      const buyer = participants[richest]!
      const spendable = balances[richest]! - 0.05 * LAMPORTS_PER_SOL
      const tx = await buildFillCurveBuyTx(connection, {
        owner: buyer.publicKey,
        pool,
        maxQuoteIn: new BN(Math.floor(spendable)),
      })
      const res = await send(tx, [buyer])
      record({ step: 'Final paced buy completes the curve', ok: res.ok, signature: res.signature })
      if (!res.ok) throw new Error(`final buy failed: ${res.error}\n${res.logs?.join('\n')}`)
      break
    }

    if (available < minSlice) {
      await sleep(1_500)
      continue
    }

    const buyer = participants[turn++ % participants.length]!
    const amount = available < remaining ? available : remaining - 1n
    const { transaction } = await buildPacedBuyTx(connection, {
      owner: buyer.publicKey,
      pool,
      baseAmountOut: new BN(amount.toString()),
    })
    const res = await send(transaction, [buyer])
    record({
      step: `Paced buy ${fmt(amount)} PACE (t+${now - pace.startTs}s)`,
      ok: res.ok,
      signature: res.signature,
      detail: res.ok ? undefined : { reason: pacerErrorFromLogs(res.logs) ?? res.error },
    })

    // Show that sells free allowance and that wallet transfers are untouched.
    if (res.ok && !soldOnce && turn >= 3) {
      soldOnce = true
      const seller = buyer
      const ata = getAssociatedTokenAddressSync(mint, seller.publicKey, false, TOKEN_2022_PROGRAM_ID)
      const bal = BigInt((await connection.getTokenAccountBalance(ata)).value.amount)
      const before = (await fetchPaceState(connection, mint))!.netOut
      const sellTx = await buildSellTx(connection, {
        owner: seller.publicKey,
        pool,
        baseAmountIn: new BN((bal / 2n).toString()),
      })
      const sellRes = await send(sellTx, [seller])
      const after = (await fetchPaceState(connection, mint))!.netOut
      record({
        step: `Sell ${fmt(bal / 2n)} PACE back to the curve (frees allowance)`,
        ok: sellRes.ok,
        signature: sellRes.signature,
        detail: { netOutBefore: fmt(before), netOutAfter: fmt(after) },
      })
    }
    if (res.ok && !transferredOnce && turn >= 4) {
      transferredOnce = true
      const from = buyer
      const to = Keypair.generate().publicKey
      const fromAta = getAssociatedTokenAddressSync(mint, from.publicKey, false, TOKEN_2022_PROGRAM_ID)
      const toAta = getAssociatedTokenAddressSync(mint, to, false, TOKEN_2022_PROGRAM_ID)
      const bal = BigInt((await connection.getTokenAccountBalance(fromAta)).value.amount)
      const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(from.publicKey, toAta, to, mint, TOKEN_2022_PROGRAM_ID),
        await createTransferCheckedWithTransferHookInstruction(
          connection,
          fromAta,
          mint,
          toAta,
          from.publicKey,
          bal / 4n,
          TOKEN_DECIMALS,
          [],
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        )
      )
      const tRes = await send(tx, [from])
      record({
        step: `Wallet-to-wallet transfer of ${fmt(bal / 4n)} PACE passes the hook`,
        ok: tRes.ok,
        signature: tRes.signature,
      })
    }
  }

  // ── 5. Hook revoked at graduation ─────────────────────────────────────────
  const mintInfo = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const hook = getTransferHook(mintInfo)
  const revoked = !hook || hook.programId.equals(PublicKey.default)
  record({
    step: 'DBC revoked the Pacer hook on graduation',
    ok: revoked,
    detail: { hookProgram: hook?.programId.toBase58() ?? null },
  })
  pace = (await fetchPaceState(connection, mint))!

  // ── 6. Migrate to DAMM v2 ─────────────────────────────────────────────────
  const {
    transaction: migrateTx,
    firstPositionNftKeypair,
    secondPositionNftKeypair,
  } = await dbc.migration.migrateToDammV2({
    payer: deployer.publicKey,
    pool,
    dammConfig: DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG,
  })
  const migrateRes = await send(migrateTx, [deployer, firstPositionNftKeypair, secondPositionNftKeypair])
  const virtualPool = await dbc.state.getPool(pool)
  const dbcConfig = await dbc.state.getPoolConfig(configKp.publicKey)
  const dammPool = deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG, mint, dbcConfig!.quoteMint)
  record({
    step: 'Graduated into compounding DAMM v2 pool (100% LP permanently locked)',
    ok: migrateRes.ok,
    signature: migrateRes.signature,
    detail: migrateRes.ok
      ? { dammPool: dammPool.toBase58() }
      : { error: migrateRes.error, logs: migrateRes.logs?.slice(-8) },
  })

  // ── Report ─────────────────────────────────────────────────────────────────
  const report = {
    cluster: CLUSTER,
    createdAt: new Date().toISOString(),
    params: { CLOCK_SECONDS, MIGRATION_SOL, OPENING_BPS, MAX_PER_BUY_BPS, BUYERS },
    addresses: {
      config: configKp.publicKey.toBase58(),
      pool: pool.toBase58(),
      mint: mint.toBase58(),
      paceState: pace.address.toBase58(),
      dammPool: dammPool.toBase58(),
      poolExplorer: explorerAddress(pool),
      mintExplorer: explorerAddress(mint),
    },
    pace: {
      startTs: pace.startTs,
      openingTranche: pace.openingTranche,
      releasePerSecond: pace.releasePerSecond,
      maxPerBuy: pace.maxPerBuy,
      totalBought: pace.totalBought,
      totalSold: pace.totalSold,
      buys: pace.buys,
      sells: pace.sells,
      curveSupply: curveTotal,
    },
    migrated: Boolean(virtualPool?.poolState.isMigrated),
    steps,
    timeline,
  }
  const file = writeRunReport(`latest-${CLUSTER}`, report)
  log(`Report written to ${file}`)
}

main()
  .catch((err) => {
    console.error(err)
    writeRunReport(`failed-${CLUSTER}`, { steps, timeline, error: String(err) })
    process.exitCode = 1
  })
  .finally(async () => {
    // Never strand devnet SOL in throwaway wallets, even when a run fails.
    if (CLUSTER === 'devnet' && wallets.length > 0) {
      const swept = await sweepBack(wallets)
      log(`Returned ${swept.toFixed(3)} SOL from ${wallets.length} demo wallets to the deployer`)
    }
  })
