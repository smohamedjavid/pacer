// Copy the Anchor IDL and types into the SDK as TypeScript modules (no JSON imports needed).
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'

const idl = JSON.parse(readFileSync('target/idl/pacer.json', 'utf8'))
writeFileSync(
  'packages/sdk/src/idl/pacer-idl.ts',
  `// Generated from target/idl/pacer.json by \`pnpm sync-idl\`. Do not edit.\nimport type { Pacer } from './pacer.js'\n\nexport const PACER_IDL_JSON = ${JSON.stringify(idl, null, 2)} as const\n\nexport const PACER_IDL = PACER_IDL_JSON as unknown as Pacer\n`
)
copyFileSync('target/types/pacer.ts', 'packages/sdk/src/idl/pacer.ts')
console.log('IDL synced to packages/sdk/src/idl')
