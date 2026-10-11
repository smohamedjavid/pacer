// Regenerate the README's devnet evidence section from demo-runs/latest-devnet.json.
// Usage: node bin/readme-devnet.mjs   (after `PACER_CLUSTER=devnet pnpm demo`)
import { readFileSync, writeFileSync } from 'node:fs'

const run = JSON.parse(readFileSync('demo-runs/latest-devnet.json', 'utf8'))
const explorer = (kind, v) => `https://explorer.solana.com/${kind}/${v}?cluster=devnet`
const addr = (label, v) => `| ${label} | [\`${v}\`](${explorer('address', v)}) |`
const reason = (r) => (r ?? '').split(' — pacer:')[0].replace(/\.$/, '')

const paced = run.steps.filter((s) => s.step.startsWith('Paced buy'))
const rows = []
for (const s of run.steps) {
  if (s.step.startsWith('Paced buy')) continue
  const d = s.detail ?? {}
  const result =
    'reverted' in d
      ? `❌ reverted by Pacer (expected): ${reason(d.reason)}`
      : 'filled' in d
        ? d.filled
          ? '✅ filled'
          : `❌ blocked (expected): ${reason(d.reason)}`
        : '✅'
  rows.push(`| ${s.step} | ${result} | ${s.explorer ? `[tx](${s.explorer})` : '—'} |`)
  if (s.step.startsWith('Bot 3') && paced[0]) {
    rows.push(`| ${paced[0].step} (first of ${paced.length} paced buys) | ✅ | [tx](${paced[0].explorer}) |`)
  }
}

const p = run.params
const section = `<!-- devnet-run:start -->
### Devnet lifecycle run

\`PACER_CLUSTER=devnet pnpm demo\` on ${run.createdAt.slice(0, 10)}: ${p.CLOCK_SECONDS}-second clock, ${p.OPENING_BPS / 100}% at open, max ${p.MAX_PER_BUY_BPS / 100}% per buy, burst ${(p.BURST_BPS ?? 0) / 100}%, graduation at ${p.MIGRATION_SOL} SOL. Rejected transactions were sent without preflight, so they are on-chain with Pacer's error in the logs.

| What | Address |
| --- | --- |
${addr('DBC config (Pacer hook)', run.addresses.config)}
${addr('DBC pool', run.addresses.pool)}
${addr('Token mint (Token-2022)', run.addresses.mint)}
${addr('PaceState', run.addresses.paceState)}
${addr('Graduated DAMM v2 pool', run.addresses.dammPool)}

| Step | Result | Explorer |
| --- | --- | --- |
${rows.join('\n')}

Full machine-readable report: [\`demo-runs/latest-devnet.json\`](demo-runs/latest-devnet.json) (every signature, plus the supply timeline).
<!-- devnet-run:end -->
`

const readme = readFileSync('README.md', 'utf8')
const next = readme.replace(/<!-- devnet-run:start -->[\s\S]*?<!-- devnet-run:end -->\n/, section)
if (next === readme) throw new Error('devnet-run markers not found in README.md')
writeFileSync('README.md', next)
console.log(`README devnet section updated from run ${run.createdAt}`)
