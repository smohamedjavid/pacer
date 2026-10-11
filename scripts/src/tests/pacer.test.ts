/**
 * Integration tests against Meteora's DBC program (cloned into a local validator) and Pacer.
 *
 *   ./scripts/localnet.sh        # in another terminal
 *   pnpm --filter @pacer/scripts test
 */
import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'
import {
  PACER_PROGRAM_ID,
  availableToBuy,
  buildCreatePacedConfigTx,
  buildInitializePaceIx,
  buildPacedBuyTx,
  buildPacedCurveConfig,
  buildPacedLaunchTx,
  buildSellTx,
  dbcClient,
  deriveExtraAccountMetaList,
  derivePaceState,
  fetchPaceState,
  getPacerProgram,
  paceParamsFromSchedule,
} from '@pacer/sdk'
import { deriveDbcPoolAddress, deriveDbcTokenVaultAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  createTransferCheckedWithTransferHookInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import BN from 'bn.js'
import { CLUSTER, chainTime, connection, deployer, fund, send } from '../env.js'

const DECIMALS = 6
// Slow clock: 5% at open, the rest over ~11 days, so nothing unlocks mid-test.
const SLOW = { openingBps: 500, clockSeconds: 1_000_000, maxPerBuyBps: 1_000 }

let config: PublicKey

async function launch(schedule = SLOW) {
  const creator = Keypair.generate()
  await fund(creator.publicKey, 2)
  const mintKp = Keypair.generate()
  const { transaction, pool, curveSupply } = await buildPacedLaunchTx(connection, {
    payer: creator.publicKey,
    creator: creator.publicKey,
    config,
    baseMint: mintKp.publicKey,
    name: 'Pacer Test',
    symbol: 'PTEST',
    uri: 'https://example.com/token.json',
    schedule,
  })
  const res = await send(transaction, [creator, mintKp])
  assert.ok(res.ok, `launch failed: ${res.error}\n${res.logs?.join('\n')}`)
  return { creator, mint: mintKp.publicKey, pool, curveSupply: BigInt(curveSupply.toString()) }
}

async function buyer(sol = 3) {
  const kp = Keypair.generate()
  await fund(kp.publicKey, sol)
  return kp
}

async function buy(owner: Keypair, pool: PublicKey, amount: bigint) {
  const { transaction } = await buildPacedBuyTx(connection, {
    owner: owner.publicKey,
    pool,
    baseAmountOut: new BN(amount.toString()),
  })
  return send(transaction, [owner])
}

function anchorError(logs: string[] | undefined): string | undefined {
  return logs?.find((l) => l.includes('Error Code:'))?.match(/Error Code: (\w+)/)?.[1]
}

describe('pacer', { skip: CLUSTER !== 'localnet' && 'integration tests run on localnet only' }, () => {
  before(async () => {
    const configKp = Keypair.generate()
    const tx = await buildCreatePacedConfigTx(connection, {
      payer: deployer.publicKey,
      config: configKp.publicKey,
      feeClaimer: deployer.publicKey,
      curve: buildPacedCurveConfig(),
    })
    const res = await send(tx, [deployer, configKp])
    assert.ok(res.ok, res.error)
    config = configKp.publicKey
  })

  test('launch starts the clock atomically with the DBC pool', async () => {
    const { mint, pool, curveSupply } = await launch()
    const pace = await fetchPaceState(connection, mint)
    assert.ok(pace)
    assert.equal(pace.pool.toBase58(), pool.toBase58())
    assert.equal(pace.netOut, 0n)
    assert.equal(pace.openingTranche, (curveSupply * 500n) / 10_000n)
    assert.ok(pace.initialBaseReserve >= curveSupply)
  })

  test('a buy within the released supply succeeds', async () => {
    const { mint, pool } = await launch()
    const b = await buyer()
    const pace = (await fetchPaceState(connection, mint))!
    const amount = availableToBuy(pace, await chainTime())
    const res = await buy(b, pool, amount)
    assert.ok(res.ok, res.error)
    assert.equal((await fetchPaceState(connection, mint))!.netOut, amount)
  })

  test('a buy ahead of the clock reverts with AheadOfClock', async () => {
    const { mint, pool } = await launch({ ...SLOW, maxPerBuyBps: 0 })
    const b = await buyer()
    const pace = (await fetchPaceState(connection, mint))!
    const res = await buy(b, pool, pace.openingTranche * 2n)
    assert.equal(res.ok, false)
    assert.equal(anchorError(res.logs), 'AheadOfClock')
  })

  test('a buy above max-per-buy reverts with ExceedsMaxPerBuy', async () => {
    const { mint, pool } = await launch({ openingBps: 5_000, clockSeconds: 1_000_000, maxPerBuyBps: 100 })
    const b = await buyer()
    const pace = (await fetchPaceState(connection, mint))!
    const res = await buy(b, pool, pace.maxPerBuy + 1n)
    assert.equal(res.ok, false)
    assert.equal(anchorError(res.logs), 'ExceedsMaxPerBuy')
  })

  test('a sell through DBC frees allowance', async () => {
    const { mint, pool } = await launch()
    const b = await buyer()
    const pace = (await fetchPaceState(connection, mint))!
    const amount = availableToBuy(pace, await chainTime())
    assert.ok((await buy(b, pool, amount)).ok)
    const sell = await buildSellTx(connection, {
      owner: b.publicKey,
      pool,
      baseAmountIn: new BN((amount / 2n).toString()),
    })
    assert.ok((await send(sell, [b])).ok)
    const after = (await fetchPaceState(connection, mint))!
    assert.ok(after.netOut < amount, 'net supply out should drop after a sell')
    assert.equal(after.sells, 1)
  })

  test('donating tokens straight into the curve vault does not free allowance', async () => {
    const { mint, pool } = await launch()
    const b = await buyer()
    const pace = (await fetchPaceState(connection, mint))!
    const amount = availableToBuy(pace, await chainTime())
    assert.ok((await buy(b, pool, amount)).ok)
    const before = (await fetchPaceState(connection, mint))!

    const baseVault = deriveDbcTokenVaultAddress(pool, mint)
    const fromAta = getAssociatedTokenAddressSync(mint, b.publicKey, false, TOKEN_2022_PROGRAM_ID)
    const donation = amount / 2n
    const tx = new Transaction().add(
      await createTransferCheckedWithTransferHookInstruction(
        connection,
        fromAta,
        mint,
        baseVault,
        b.publicKey,
        donation,
        DECIMALS,
        [],
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
    )
    const res = await send(tx, [b])
    assert.ok(res.ok, `donation transfer should pass the hook: ${res.error}`)
    const after = (await fetchPaceState(connection, mint))!
    assert.equal(after.netOut, before.netOut, 'allowance must not move without a DBC sell')
    assert.equal(after.sells, before.sells)

    // Trying to spend the "freed" allowance is still ahead of the clock.
    const retry = await buy(b, pool, donation)
    assert.equal(retry.ok, false)
    assert.equal(anchorError(retry.logs), 'AheadOfClock')
  })

  test('calling the hook directly (outside a transfer) is rejected', async () => {
    const { mint, pool } = await launch()
    const b = await buyer()
    const pace = (await fetchPaceState(connection, mint))!
    assert.ok((await buy(b, pool, availableToBuy(pace, await chainTime()))).ok)
    const ata = getAssociatedTokenAddressSync(mint, b.publicKey, false, TOKEN_2022_PROGRAM_ID)
    const ix = await getPacerProgram(connection)
      .methods.execute(new BN(1))
      .accountsPartial({
        sourceToken: deriveDbcTokenVaultAddress(pool, mint),
        mint,
        destinationToken: ata,
        owner: b.publicKey,
        extraAccountMetaList: deriveExtraAccountMetaList(mint),
        paceState: derivePaceState(mint),
        pool,
      })
      .instruction()
    const res = await send(new Transaction().add(ix), [b])
    assert.equal(res.ok, false)
    assert.equal(anchorError(res.logs), 'NotTransferring')
  })

  test('only the DBC pool creator can start the clock', async () => {
    const creator = await buyer(2)
    const attacker = await buyer(2)
    const mintKp = Keypair.generate()
    const poolTx = await dbcClient(connection).creator.createPoolWithTransferHook({
      name: 'Pacer Test',
      symbol: 'PTEST',
      uri: 'https://example.com/token.json',
      payer: creator.publicKey,
      poolCreator: creator.publicKey,
      config,
      baseMint: mintKp.publicKey,
      transferHookProgram: PACER_PROGRAM_ID,
    })
    assert.ok((await send(poolTx, [creator, mintKp])).ok)
    const pool = deriveDbcPoolAddress(NATIVE_MINT, mintKp.publicKey, config)
    const params = paceParamsFromSchedule({ ...SLOW, curveSupply: new BN(1_000_000) })

    const hijack = await buildInitializePaceIx(connection, {
      creator: attacker.publicKey,
      mint: mintKp.publicKey,
      pool,
      params,
    })
    const res = await send(new Transaction().add(hijack), [attacker])
    assert.equal(res.ok, false)
    assert.equal(anchorError(res.logs), 'NotPoolCreator')
  })

  test('a running clock cannot be re-initialized', async () => {
    const { creator, mint, pool } = await launch()
    const params = paceParamsFromSchedule({ ...SLOW, openingBps: 10_000, curveSupply: new BN(1_000_000) })
    const ix = await buildInitializePaceIx(connection, { creator: creator.publicKey, mint, pool, params })
    const res = await send(new Transaction().add(ix), [creator])
    assert.equal(res.ok, false, 'second initialize_pace must fail')
  })
})
