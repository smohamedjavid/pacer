import { BorshCoder, EventParser } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import { PACER_IDL, PACER_PROGRAM_ID, derivePaceState } from '../src/index.js'
const c = new Connection('http://127.0.0.1:8899', 'confirmed')
const mint = new PublicKey(process.argv[2] ?? 'Bc3s7W1tBoHTViooBHftthupBm9QRvMLU3V54maFNGwA')
const sigs = await c.getSignaturesForAddress(derivePaceState(mint), { limit: 100 })
const parser = new EventParser(PACER_PROGRAM_ID, new BorshCoder(PACER_IDL as never))
const txs = await c.getTransactions(sigs.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
let n = 0
for (const tx of txs) {
  const evs = [...parser.parseLogs(tx?.meta?.logMessages ?? [])]
  n += evs.length
  if (evs.length) console.log(evs.map((e) => e.name + ' ' + JSON.stringify(Object.keys(e.data as object))))
}
console.log('total events', n)
const sample = txs.find((t) => (t?.meta?.logMessages ?? []).some((l) => l.includes('Program data')))
console.log((sample?.meta?.logMessages ?? []).slice(0, 60).join('\n'))
