import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { Connection, PublicKey, Transaction } from '@solana/web3.js'
import BN from 'bn.js'
import { dbcClient } from './dbc.js'

/**
 * Buy whatever is left on the curve, spending at most `maxQuoteIn`.
 *
 * Exact-out cannot land exactly on DBC's migration threshold, so the curve-completing buy uses
 * partial fill: DBC takes only the quote needed to finish the curve and the hook still checks
 * the clock. Use it when the clock has released everything that remains on the curve.
 */
export async function buildFillCurveBuyTx(
  connection: Connection,
  args: { owner: PublicKey; pool: PublicKey; maxQuoteIn: BN; payer?: PublicKey }
): Promise<Transaction> {
  return dbcClient(connection).pool.swap2WithTransferHook({
    owner: args.owner,
    payer: args.payer,
    pool: args.pool,
    swapBaseForQuote: false,
    referralTokenAccount: null,
    swapMode: SwapMode.PartialFill,
    amountIn: args.maxQuoteIn,
    minimumAmountOut: new BN(0),
  })
}
