import {
  DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG,
  burstLevelAt,
  clockEndsAt,
  dbcClient,
  fetchAllPaceStates,
  fetchPaceState,
  releasedAt,
  type PaceStateView,
} from '@pacer/sdk'
import { deriveDammV2PoolAddress, type PoolConfig, type VirtualPool } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { ExtensionType, TOKEN_2022_PROGRAM_ID, getExtensionData, getTransferHook, unpackMint } from '@solana/spl-token'
import { unpack as unpackTokenMetadata } from '@solana/spl-token-metadata'
import { PublicKey, type AccountInfo, type Connection } from '@solana/web3.js'
import { minBigInt, ratio } from './units'

export interface TokenInfo {
  name: string
  symbol: string
  uri: string
}

/** DBC market facts a launch needs for display. All amounts in raw units. */
export interface CurveMarket {
  config: PublicKey
  quoteMint: PublicKey
  /** Base units the curve sells before graduation (`swapBaseAmount`). */
  curveSupply: bigint
  quoteReserve: bigint
  migrationQuoteThreshold: bigint
  isMigrated: boolean
}

export interface LaunchSummary {
  mint: PublicKey
  pace: PaceStateView
  token: TokenInfo | null
  /** Pacer is still the mint's transfer hook (DBC revokes it when the curve completes). */
  hookActive: boolean
  market: CurveMarket
}

/** A launch plus the raw DBC accounts needed to quote swaps locally. */
export interface LaunchDetail extends LaunchSummary {
  virtualPool: VirtualPool
  poolConfig: PoolConfig
  dammPool: PublicKey
}

export type LaunchPhase = 'live' | 'clock-complete' | 'curve-complete' | 'graduated'

export const PHASE_LABEL: Record<LaunchPhase, string> = {
  live: 'Live',
  'clock-complete': 'Clock complete',
  'curve-complete': 'Ready to graduate',
  graduated: 'Graduated',
}

export function launchPhase(launch: LaunchSummary, now: number): LaunchPhase {
  const { market, pace } = launch
  if (market.isMigrated) return 'graduated'
  if (market.quoteReserve >= market.migrationQuoteThreshold) return 'curve-complete'
  if (now >= clockEndsAt(pace, market.curveSupply)) return 'clock-complete'
  return 'live'
}

/** Clock facts at `now`, capped at the curve supply. */
export function clockReading(launch: LaunchSummary, now: number) {
  const { pace, market } = launch
  const endsAt = clockEndsAt(pace, market.curveSupply)
  const released = minBigInt(releasedAt(pace, now), market.curveSupply)
  const netOut = pace.netOut
  /** Headroom under the release line. */
  const available = released > netOut ? released - netOut : 0n
  /** Burst bucket level, or null when the launch has no burst limit. */
  const burst = burstLevelAt(pace, now)
  /** What one buyer could take right now (before the per-buy cap). */
  const buyable = burst !== null && burst < available ? burst : available
  return {
    endsAt,
    duration: endsAt - pace.startTs,
    elapsed: Math.max(0, now - pace.startTs),
    released,
    netOut,
    available,
    burst,
    buyable,
    burstLimited: burst !== null && burst < available,
    releasedFraction: ratio(released, market.curveSupply),
    soldFraction: ratio(netOut, market.curveSupply),
    raisedFraction: ratio(market.quoteReserve, market.migrationQuoteThreshold),
  }
}

export type ClockReading = ReturnType<typeof clockReading>

// ── Decoding ────────────────────────────────────────────────────────────────

function decodeMint(
  address: PublicKey,
  info: AccountInfo<Buffer> | null
): { token: TokenInfo | null; hookActive: boolean } {
  if (!info) return { token: null, hookActive: false }
  const mint = unpackMint(address, info, TOKEN_2022_PROGRAM_ID)
  const hook = getTransferHook(mint)
  const hookActive = Boolean(hook && !hook.programId.equals(PublicKey.default))
  const metadataBytes = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData)
  if (!metadataBytes) return { token: null, hookActive }
  const { name, symbol, uri } = unpackTokenMetadata(metadataBytes)
  return { token: { name, symbol, uri }, hookActive }
}

function toMarket(configAddress: PublicKey, config: PoolConfig, pool: Pick<VirtualPool, 'poolState'>): CurveMarket {
  return {
    config: configAddress,
    quoteMint: config.quoteMint,
    curveSupply: BigInt(config.swapBaseAmount.toString()),
    quoteReserve: BigInt(pool.poolState.quoteReserve.toString()),
    migrationQuoteThreshold: BigInt(config.migrationQuoteThreshold.toString()),
    isMigrated: pool.poolState.isMigrated !== 0,
  }
}

// DBC configs are immutable, so each is fetched once per session.
const configCache = new Map<string, Promise<PoolConfig | null>>()

function getConfig(connection: Connection, address: PublicKey): Promise<PoolConfig | null> {
  const key = address.toBase58()
  let pending = configCache.get(key)
  if (!pending) {
    pending = dbcClient(connection).state.getPoolConfig(address)
    pending.catch(() => configCache.delete(key))
    configCache.set(key, pending)
  }
  return pending
}

// ── Fetching ────────────────────────────────────────────────────────────────

/** Every paced launch with its token metadata and curve progress, newest first. */
export async function fetchLaunches(connection: Connection): Promise<LaunchSummary[]> {
  const paces = await fetchAllPaceStates(connection)
  if (paces.length === 0) return []
  const program = dbcClient(connection).state.getProgram()
  const [pools, mints] = await Promise.all([
    program.account.transferHookPool.fetchMultiple(paces.map((p) => p.pool)),
    getMultipleAccountsChunked(
      connection,
      paces.map((p) => p.mint)
    ),
  ])

  const launches = await Promise.all(
    paces.map(async (pace, i): Promise<LaunchSummary | null> => {
      const pool = pools[i]
      if (!pool) return null
      const config = await getConfig(connection, pool.poolState.config)
      if (!config) return null
      return {
        mint: pace.mint,
        pace,
        ...decodeMint(pace.mint, mints[i] ?? null),
        market: toMarket(pool.poolState.config, config, pool),
      }
    })
  )
  return launches.filter((l): l is LaunchSummary => l !== null)
}

/** The mint's clock account was written by an older Pacer layout and cannot be decoded. */
export class LegacyLaunchError extends Error {
  constructor() {
    super('This launch was created by an earlier version of the Pacer program and cannot be shown here.')
    this.name = 'LegacyLaunchError'
  }
}

async function readPaceState(connection: Connection, mint: PublicKey): Promise<PaceStateView | null> {
  try {
    return await fetchPaceState(connection, mint)
  } catch (error) {
    // Older PaceState accounts are shorter than the current layout; Borsh runs off the end.
    if (error instanceof RangeError || (error instanceof Error && /buffer length|out of range/i.test(error.message))) {
      throw new LegacyLaunchError()
    }
    throw error
  }
}

/** One launch with everything the token page needs. Null when the mint has no issuance clock. */
export async function fetchLaunch(connection: Connection, mint: PublicKey): Promise<LaunchDetail | null> {
  const pace = await readPaceState(connection, mint)
  if (!pace) return null
  const [virtualPool, mintInfo] = await Promise.all([
    dbcClient(connection).state.getProgram().account.transferHookPool.fetchNullable(pace.pool),
    connection.getAccountInfo(mint),
  ])
  if (!virtualPool) throw new Error(`DBC pool ${pace.pool.toBase58()} not found`)
  const poolConfig = await getConfig(connection, virtualPool.poolState.config)
  if (!poolConfig) throw new Error(`DBC config ${virtualPool.poolState.config.toBase58()} not found`)
  return {
    mint,
    pace,
    ...decodeMint(mint, mintInfo),
    market: toMarket(virtualPool.poolState.config, poolConfig, virtualPool),
    virtualPool,
    poolConfig,
    dammPool: deriveDammV2PoolAddress(DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG, mint, poolConfig.quoteMint),
  }
}

/** `getMultipleAccountsInfo` accepts at most 100 keys per call. */
async function getMultipleAccountsChunked(connection: Connection, keys: PublicKey[]) {
  const chunks: PublicKey[][] = []
  for (let i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100))
  const results = await Promise.all(chunks.map((c) => connection.getMultipleAccountsInfo(c)))
  return results.flat()
}
