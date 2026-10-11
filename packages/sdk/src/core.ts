import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  type TransactionInstruction,
} from '@solana/web3.js'
import { PACER_IDL, PACER_IDL_JSON } from './idl/pacer-idl.js'
import type { Pacer } from './idl/pacer.js'

export type { Pacer }
export { PACER_IDL }
export const PACER_PROGRAM_ID = new PublicKey(PACER_IDL_JSON.address)
export const DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN')
export const DAMM_V2_PROGRAM_ID = new PublicKey('cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG')
/** DAMM v2 migration config for MigrationFeeOption.Customizable (same on mainnet and devnet). */
export const DAMM_V2_CUSTOMIZABLE_MIGRATION_CONFIG = new PublicKey(
  'A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck'
)

export const PACE_SEED = Buffer.from('pace')
/** On-chain size of a `PaceState` account (8-byte discriminator + fields). */
export const PACE_STATE_SIZE = 8 + 4 * 32 + 8 + 7 * 8 + 2 * 4 + 1
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from('extra-account-metas')

export function derivePaceState(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([PACE_SEED, mint.toBuffer()], PACER_PROGRAM_ID)[0]
}

export function deriveExtraAccountMetaList(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    PACER_PROGRAM_ID
  )[0]
}

/** Read-only Anchor client. Signing happens on the transaction, not the provider. */
export function getPacerProgram(connection: Connection): Program<Pacer> {
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: Keypair.generate().publicKey,
      signTransaction: async (tx) => tx,
      signAllTransactions: async (txs) => txs,
    },
    { commitment: 'confirmed' }
  )
  return new Program(PACER_IDL as Idl, provider) as unknown as Program<Pacer>
}

export interface PaceParams {
  /** Base units released the moment the pool opens. */
  openingTranche: BN
  /** Base units released per second afterwards. */
  releasePerSecond: BN
  /** Largest single buy in base units (0 = unlimited). */
  maxPerBuy: BN
}

export interface PaceSchedule {
  /** Base units the curve sells before graduation (DBC config `swapBaseAmount`). */
  curveSupply: BN
  /** Share of curve supply released at open, in basis points. */
  openingBps: number
  /** Seconds until the full curve supply is released. */
  clockSeconds: number
  /** Largest single buy as a share of curve supply, in basis points (0 = unlimited). */
  maxPerBuyBps: number
}

/** Turn a human schedule ("5% at open, the rest over 4 hours, max 1% per buy") into on-chain params. */
export function paceParamsFromSchedule(s: PaceSchedule): PaceParams {
  const openingTranche = s.curveSupply.muln(s.openingBps).divn(10_000)
  const rest = s.curveSupply.sub(openingTranche)
  // Round up so the whole curve is released exactly at the end of the clock.
  const releasePerSecond = rest.addn(s.clockSeconds - 1).divn(s.clockSeconds)
  const maxPerBuy = s.curveSupply.muln(s.maxPerBuyBps).divn(10_000)
  return { openingTranche, releasePerSecond, maxPerBuy }
}

export async function buildInitializePaceIx(
  connection: Connection,
  args: { creator: PublicKey; mint: PublicKey; pool: PublicKey; params: PaceParams }
): Promise<TransactionInstruction> {
  const program = getPacerProgram(connection)
  return program.methods
    .initializePace(args.params)
    .accountsPartial({
      creator: args.creator,
      mint: args.mint,
      pool: args.pool,
      paceState: derivePaceState(args.mint),
      extraAccountMetaList: deriveExtraAccountMetaList(args.mint),
    })
    .instruction()
}

export interface PaceStateView {
  address: PublicKey
  mint: PublicKey
  pool: PublicKey
  baseVault: PublicKey
  creator: PublicKey
  startTs: number
  openingTranche: bigint
  releasePerSecond: bigint
  maxPerBuy: bigint
  initialBaseReserve: bigint
  netOut: bigint
  totalBought: bigint
  totalSold: bigint
  buys: number
  sells: number
}

export async function fetchPaceState(
  connection: Connection,
  mint: PublicKey
): Promise<PaceStateView | null> {
  const program = getPacerProgram(connection)
  const address = derivePaceState(mint)
  const s = await program.account.paceState.fetchNullable(address)
  if (!s) return null
  return {
    address,
    mint: s.mint,
    pool: s.pool,
    baseVault: s.baseVault,
    creator: s.creator,
    startTs: s.startTs.toNumber(),
    openingTranche: BigInt(s.openingTranche.toString()),
    releasePerSecond: BigInt(s.releasePerSecond.toString()),
    maxPerBuy: BigInt(s.maxPerBuy.toString()),
    initialBaseReserve: BigInt(s.initialBaseReserve.toString()),
    netOut: BigInt(s.netOut.toString()),
    totalBought: BigInt(s.totalBought.toString()),
    totalSold: BigInt(s.totalSold.toString()),
    buys: s.buys,
    sells: s.sells,
  }
}

/** Supply the issuance clock has released at `nowSec` (mirrors `PaceState::released_at`). */
export function releasedAt(state: PaceStateView, nowSec: number): bigint {
  const elapsed = BigInt(Math.max(0, nowSec - state.startTs))
  return state.openingTranche + state.releasePerSecond * elapsed
}

/** Largest buy (in base units) the hook will accept at `nowSec`. */
export function availableToBuy(state: PaceStateView, nowSec: number, curveSupply?: bigint): bigint {
  let released = releasedAt(state, nowSec)
  if (curveSupply !== undefined && released > curveSupply) released = curveSupply
  let available = released > state.netOut ? released - state.netOut : 0n
  if (state.maxPerBuy > 0n && available > state.maxPerBuy) available = state.maxPerBuy
  return available
}

/** Seconds from `startTs` until the clock has released `curveSupply`. */
export function clockEndsAt(state: PaceStateView, curveSupply: bigint): number {
  if (state.releasePerSecond === 0n) return state.startTs
  const rest = curveSupply > state.openingTranche ? curveSupply - state.openingTranche : 0n
  const secs = (rest + state.releasePerSecond - 1n) / state.releasePerSecond
  return state.startTs + Number(secs)
}

/** Pacer program errors, by Anchor error code, for friendly UI messages. */
export const PACER_ERRORS: Record<number, string> = Object.fromEntries(
  PACER_IDL_JSON.errors.map((e: { code: number; msg?: string; name: string }) => [
    e.code,
    e.msg ?? e.name,
  ])
)

/** Extract a Pacer error message from simulation/transaction logs, if any. */
export function pacerErrorFromLogs(logs: string[] | null | undefined): string | null {
  if (!logs) return null
  const clock = logs.find((l) => l.includes('pacer: buy'))
  const anchorErr = logs.find((l) => l.includes('Error Code: AheadOfClock') || l.includes('Error Code: ExceedsMaxPerBuy'))
  if (clock || anchorErr) {
    return [anchorErr?.replace(/^Program log: AnchorError.*Error Message: /, ''), clock?.replace('Program log: ', '')]
      .filter(Boolean)
      .join(' — ')
  }
  return null
}

/** All paced launches, newest first. */
export async function fetchAllPaceStates(connection: Connection): Promise<PaceStateView[]> {
  const program = getPacerProgram(connection)
  // Filter by size so accounts from older program layouts are skipped, not mis-decoded.
  const all = await program.account.paceState.all([{ dataSize: PACE_STATE_SIZE }])
  return all
    .map(({ publicKey, account: s }) => ({
      address: publicKey,
      mint: s.mint,
      pool: s.pool,
      baseVault: s.baseVault,
      creator: s.creator,
      startTs: s.startTs.toNumber(),
      openingTranche: BigInt(s.openingTranche.toString()),
      releasePerSecond: BigInt(s.releasePerSecond.toString()),
      maxPerBuy: BigInt(s.maxPerBuy.toString()),
      initialBaseReserve: BigInt(s.initialBaseReserve.toString()),
      netOut: BigInt(s.netOut.toString()),
      totalBought: BigInt(s.totalBought.toString()),
      totalSold: BigInt(s.totalSold.toString()),
      buys: s.buys,
      sells: s.sells,
    }))
    .sort((a, b) => b.startTs - a.startTs)
}
