import { BorshCoder, EventParser } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import { getMint, getTransferHook, getTokenMetadata, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { PACER_IDL, PACER_PROGRAM_ID, derivePaceState, fetchAllPaceStates, dbcClient } from '../src/index.js'

const c = new Connection('http://127.0.0.1:8899', 'confirmed')
const mint = new PublicKey('Bc3s7W1tBoHTViooBHftthupBm9QRvMLU3V54maFNGwA')
const m = await getMint(c, mint, 'confirmed', TOKEN_2022_PROGRAM_ID)
console.log('hook', getTransferHook(m)?.programId.toBase58(), 'auth', getTransferHook(m)?.authority?.toBase58())
console.log('meta', await getTokenMetadata(c, mint, 'confirmed'))
const sigs = await c.getSignaturesForAddress(derivePaceState(mint), { limit: 100 })
console.log('sigs', sigs.length, sigs.filter((s) => s.err).length, 'failed')
const parser = new EventParser(PACER_PROGRAM_ID, new BorshCoder(PACER_IDL as never))
const txs = await c.getTransactions(sigs.slice(0, 60).map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
let shown = 0
for (const tx of txs) {
  if (!tx) continue
  const evs = [...parser.parseLogs(tx.meta?.logMessages ?? [])]
  if (shown < 3 || tx.meta?.err) {
    console.log(tx.blockTime, tx.meta?.err ? 'ERR' : 'ok', JSON.stringify(evs.map((e) => ({ name: e.name, data: Object.fromEntries(Object.entries(e.data as Record<string, unknown>).map(([k, v]) => [k, String(v)])) }))))
    if (tx.meta?.err) console.log((tx.meta.logMessages ?? []).filter((l) => l.includes('pacer') || l.includes('Error')).join('\n'))
    shown++
  }
}
const pool = await dbcClient(c).state.getPool(new PublicKey('G6LLPRcpDBCkmVa4CPFchj6zDMPTQfizxUW6bRNPUDh1'))
const ps = pool!.poolState as Record<string, unknown>
console.log(Object.keys(pool!), Object.keys(ps))
console.log('quoteReserve', String(ps.quoteReserve), 'isMigrated', ps.isMigrated, 'migrationProgress', ps.migrationProgress)
const cfg = await dbcClient(c).state.getPoolConfig(ps.config as PublicKey)
console.log('threshold', String(cfg!.migrationQuoteThreshold), 'swapBase', String(cfg!.swapBaseAmount), 'quoteMint', cfg!.quoteMint.toBase58(), Object.keys(cfg!).join(','))
