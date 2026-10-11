import {
  ActivationType,
  BaseFeeMode,
  buildCurve,
  CollectFeeMode,
  DammV2BaseFeeMode,
  DammV2DynamicFeeMode,
  deriveDbcPoolAddress,
  DynamicBondingCurveClient,
  getCurrentPoint,
  getDeltaAmountBaseUnsigned,
  getNextSqrtPriceFromBaseAmountOutRoundingUp,
  getPriceFromSqrtPrice,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  Rounding,
  SwapMode,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  type ConfigParameters,
  type PoolConfig,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { NATIVE_MINT } from '@solana/spl-token'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import BN from 'bn.js'
import {
  buildInitializePaceIx,
  DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG,
  PACER_PROGRAM_ID,
  paceParamsFromSchedule,
  releasedAt,
  type PaceSchedule,
  type PaceStateView,
} from './core.js'

export { DynamicBondingCurveClient, NATIVE_MINT }

export interface PacedCurveOptions {
  /** Total token supply in whole tokens. */
  totalTokenSupply: number
  /** Share of supply that seeds the DAMM v2 pool at graduation (percent). */
  percentageSupplyOnMigration: number
  /** Quote (SOL) raised on the curve before graduation. */
  migrationQuoteThreshold: number
  /** Flat trading fee on the curve in bps. Pacing replaces punitive anti-snipe fees. */
  curveFeeBps: number
  /** Creator share of curve trading fees (percent). */
  creatorTradingFeePercentage: number
  /** Which token curve fees are collected in (default: quote). */
  collectFeeMode?: CollectFeeMode
}

export const DEFAULT_PACED_CURVE: PacedCurveOptions = {
  totalTokenSupply: 1_000_000_000,
  percentageSupplyOnMigration: 20,
  migrationQuoteThreshold: 5,
  curveFeeBps: 100,
  creatorTradingFeePercentage: 50,
}

/**
 * DBC config used by every Pacer launch:
 * - Token-2022 base mint with the Pacer transfer hook (set on the config)
 * - flat curve fee — the issuance clock, not a 99% snipe tax, handles bots
 * - graduation into a compounding DAMM v2 pool with dynamic fees
 * - 100% of graduated LP permanently locked (split partner/creator)
 */
export function buildPacedCurveConfig(opts: PacedCurveOptions = DEFAULT_PACED_CURVE): ConfigParameters {
  return buildCurve({
    token: {
      tokenType: TokenType.Token2022,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.NINE,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: opts.totalTokenSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
          startingFeeBps: opts.curveFeeBps,
          endingFeeBps: opts.curveFeeBps,
          numberOfPeriod: 0,
          totalDuration: 0,
        },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: opts.collectFeeMode ?? CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: opts.creatorTradingFeePercentage,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode.Compounding,
        dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 100,
        compoundingFeeBps: 5_000,
        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
      },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 50,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: opts.percentageSupplyOnMigration,
    migrationQuoteThreshold: opts.migrationQuoteThreshold,
  })
}

export function dbcClient(connection: Connection): DynamicBondingCurveClient {
  return DynamicBondingCurveClient.create(connection, 'confirmed')
}

/** Partner step: a DBC config whose pools all carry the Pacer hook. */
export async function buildCreatePacedConfigTx(
  connection: Connection,
  args: {
    payer: PublicKey
    config: PublicKey
    feeClaimer: PublicKey
    leftoverReceiver?: PublicKey
    quoteMint?: PublicKey
    curve?: ConfigParameters
  }
): Promise<Transaction> {
  return dbcClient(connection).partner.createConfigWithTransferHook({
    payer: args.payer,
    config: args.config,
    feeClaimer: args.feeClaimer,
    leftoverReceiver: args.leftoverReceiver ?? args.feeClaimer,
    quoteMint: args.quoteMint ?? NATIVE_MINT,
    transferHookProgram: PACER_PROGRAM_ID,
    ...(args.curve ?? buildPacedCurveConfig()),
  })
}

/** Base units the curve sells before graduation (the supply the clock meters). */
export async function getCurveSupply(connection: Connection, config: PublicKey): Promise<BN> {
  const cfg = await dbcClient(connection).state.getPoolConfig(config)
  if (!cfg) throw new Error(`DBC config not found: ${config.toBase58()}`)
  return new BN(cfg.swapBaseAmount.toString())
}

/**
 * Creator step: create the DBC pool and start its issuance clock atomically.
 * Signers: payer, creator, baseMint keypair.
 */
export async function buildPacedLaunchTx(
  connection: Connection,
  args: {
    payer: PublicKey
    creator: PublicKey
    config: PublicKey
    baseMint: PublicKey
    name: string
    symbol: string
    uri: string
    schedule: Omit<PaceSchedule, 'curveSupply'>
  }
): Promise<{ transaction: Transaction; pool: PublicKey; curveSupply: BN }> {
  const client = dbcClient(connection)
  const cfg = await client.state.getPoolConfig(args.config)
  if (!cfg) throw new Error(`DBC config not found: ${args.config.toBase58()}`)
  const curveSupply = new BN(cfg.swapBaseAmount.toString())
  const pool = deriveDbcPoolAddress(cfg.quoteMint, args.baseMint, args.config)

  const transaction = await client.creator.createPoolWithTransferHook({
    name: args.name,
    symbol: args.symbol,
    uri: args.uri,
    payer: args.payer,
    poolCreator: args.creator,
    config: args.config,
    baseMint: args.baseMint,
    transferHookProgram: PACER_PROGRAM_ID,
  })
  transaction.add(
    await buildInitializePaceIx(connection, {
      creator: args.creator,
      mint: args.baseMint,
      pool,
      params: paceParamsFromSchedule({ ...args.schedule, curveSupply }),
    })
  )
  return { transaction, pool, curveSupply }
}

/**
 * Buy an exact amount of base tokens. Exact-out lets a buyer take precisely what the
 * clock has released instead of guessing an input that might overshoot and revert.
 */
export async function buildPacedBuyTx(
  connection: Connection,
  args: { owner: PublicKey; pool: PublicKey; baseAmountOut: BN; slippageBps?: number; payer?: PublicKey }
): Promise<{ transaction: Transaction; maxQuoteIn: BN }> {
  const client = dbcClient(connection)
  const virtualPool = await client.state.getPool(args.pool)
  if (!virtualPool) throw new Error(`DBC pool not found: ${args.pool.toBase58()}`)
  const config = await client.state.getPoolConfig(virtualPool.poolState.config)
  if (!config) throw new Error('DBC config not found')
  const currentPoint = await getCurrentPoint(connection, config.activationType)
  const quote = client.pool.swapQuote2({
    virtualPool,
    config,
    swapBaseForQuote: false,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
    slippageBps: args.slippageBps ?? 100,
    swapMode: SwapMode.ExactOut,
    amountOut: args.baseAmountOut,
  })
  const maxQuoteIn = new BN(quote.maximumAmountIn!.toString())
  const transaction = await client.pool.swap2WithTransferHook({
    owner: args.owner,
    payer: args.payer,
    pool: args.pool,
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: SwapMode.ExactOut,
    amountOut: args.baseAmountOut,
    maximumAmountIn: maxQuoteIn,
  })
  return { transaction, maxQuoteIn }
}

/**
 * Quote an exact-in or partial-fill swap and return the slippage-protected minimum output.
 * Every SDK swap builder sets a real minimum so trades can't be sandwiched to zero.
 */
export async function quoteMinimumOut(
  connection: Connection,
  args: {
    pool: PublicKey
    swapBaseForQuote: boolean
    swapMode: SwapMode.ExactIn | SwapMode.PartialFill
    amountIn: BN
    slippageBps?: number
  }
): Promise<BN> {
  const client = dbcClient(connection)
  const virtualPool = await client.state.getPool(args.pool)
  if (!virtualPool) throw new Error(`DBC pool not found: ${args.pool.toBase58()}`)
  const config = await client.state.getPoolConfig(virtualPool.poolState.config)
  if (!config) throw new Error('DBC config not found')
  const currentPoint = await getCurrentPoint(connection, config.activationType)
  const quote = client.pool.swapQuote2({
    virtualPool,
    config,
    swapBaseForQuote: args.swapBaseForQuote,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
    slippageBps: args.slippageBps ?? 100,
    swapMode: args.swapMode,
    amountIn: args.amountIn,
  })
  return new BN(quote.minimumAmountOut!.toString())
}

/** Spend an exact amount of quote on base tokens. */
export async function buildQuoteInBuyTx(
  connection: Connection,
  args: { owner: PublicKey; pool: PublicKey; quoteAmountIn: BN; slippageBps?: number; payer?: PublicKey }
): Promise<Transaction> {
  const minimumAmountOut = await quoteMinimumOut(connection, {
    pool: args.pool,
    swapBaseForQuote: false,
    swapMode: SwapMode.ExactIn,
    amountIn: args.quoteAmountIn,
    slippageBps: args.slippageBps,
  })
  return dbcClient(connection).pool.swap2WithTransferHook({
    owner: args.owner,
    payer: args.payer,
    pool: args.pool,
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: SwapMode.ExactIn,
    amountIn: args.quoteAmountIn,
    minimumAmountOut,
  })
}

/** Sell base tokens back to the curve; this frees issuance allowance. */
export async function buildSellTx(
  connection: Connection,
  args: { owner: PublicKey; pool: PublicKey; baseAmountIn: BN; slippageBps?: number; payer?: PublicKey }
): Promise<Transaction> {
  const minimumAmountOut = await quoteMinimumOut(connection, {
    pool: args.pool,
    swapBaseForQuote: true,
    swapMode: SwapMode.ExactIn,
    amountIn: args.baseAmountIn,
    slippageBps: args.slippageBps,
  })
  return dbcClient(connection).pool.swap2WithTransferHook({
    owner: args.owner,
    payer: args.payer,
    pool: args.pool,
    swapBaseForQuote: true,
    referralTokenAccount: null,
    swapMode: SwapMode.ExactIn,
    amountIn: args.baseAmountIn,
    minimumAmountOut,
  })
}

/**
 * Permissionless graduation: move a completed curve into its DAMM v2 pool.
 * Signers: payer plus the two returned position-NFT keypairs.
 */
export async function buildMigrateTx(connection: Connection, args: { payer: PublicKey; pool: PublicKey }) {
  return dbcClient(connection).migration.migrateToDammV2({
    payer: args.payer,
    pool: args.pool,
    dammConfig: DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG,
  })
}

/**
 * Curve price (quote per base, UI units) after `netOut` base units have been sold from the
 * curve, walking DBC's constant-product segments from the start price.
 */
export function priceAtNetOut(config: PoolConfig, netOut: BN, baseDecimals = 6, quoteDecimals = 9): number {
  let sqrtPrice = new BN(config.sqrtStartPrice.toString())
  let remaining = netOut.clone()
  for (const point of config.curve) {
    if (remaining.isZero()) break
    const liquidity = new BN(point.liquidity.toString())
    const upper = new BN(point.sqrtPrice.toString())
    if (liquidity.isZero() || upper.lte(sqrtPrice)) continue
    const segmentBase = getDeltaAmountBaseUnsigned(sqrtPrice, upper, liquidity, Rounding.Down)
    if (remaining.lte(segmentBase)) {
      sqrtPrice = getNextSqrtPriceFromBaseAmountOutRoundingUp(sqrtPrice, liquidity, remaining)
      remaining = new BN(0)
      break
    }
    remaining = remaining.sub(segmentBase)
    sqrtPrice = upper
  }
  return getPriceFromSqrtPrice(sqrtPrice, baseDecimals, quoteDecimals).toNumber()
}

/**
 * The price speed limit: the highest curve price reachable at `nowSec`, because supply out of
 * the curve can't exceed what the clock has released.
 */
export function priceCeilingAt(state: PaceStateView, config: PoolConfig, nowSec: number, curveSupply: bigint): number {
  const released = releasedAt(state, nowSec)
  const capped = released > curveSupply ? curveSupply : released
  return priceAtNetOut(config, new BN(capped.toString()))
}
