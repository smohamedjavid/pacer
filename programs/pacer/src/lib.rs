//! Pacer — an issuance clock for Meteora Dynamic Bonding Curve (DBC) launches.
//!
//! Pacer is a Token-2022 transfer hook. DBC runs it on every transfer of the base token
//! while the token sits on the bonding curve, and revokes it automatically when the curve
//! completes. Pacer only constrains one thing: how much supply may leave the curve vault
//! by time `t`:
//!
//! ```text
//! net_out(t) <= opening_tranche + release_per_second * (t - start_ts)
//! ```
//!
//! A buyer (or bot) can never take more than the clock has released, so a one-block sweep
//! of the curve reverts and price discovery is spread over a schedule the creator publishes
//! at launch. Sells return supply to the vault and free allowance; wallet-to-wallet
//! transfers are never touched.
//!
//! An optional burst limit (a token bucket refilled at the same rate as the clock) bounds how
//! much can be bought in any short window, across all transactions and wallets. Without it,
//! allowance that goes unused during a quiet period could be swept in a single block.
//!
//! `net_out` is never tracked by Pacer itself: it is read from DBC's own pool accounting
//! (`initial_base_reserve - base_reserve`), which DBC updates before it moves tokens. Tokens
//! donated straight to the vault, or hook calls outside a real transfer of this mint, can
//! therefore never change the allowance.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{
        transfer_hook::{self as hook_ext, TransferHookAccount},
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::{Account as SplTokenAccount, Mint as SplMint},
};
use spl_discriminator::SplDiscriminate;
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

declare_id!("4AX6qNnFYqLqKLvcSe6FkvCJWJsoBF9pK743UmEYLokM");

/// Meteora Dynamic Bonding Curve program (same address on mainnet and devnet).
pub const DBC_PROGRAM_ID: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");

pub const PACE_SEED: &[u8] = b"pace";
pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";

/// Byte offsets inside DBC's `TransferHookPool` account
/// (8-byte discriminator + 64-byte VolatilityTracker, then config, creator, base_mint, base_vault).
mod dbc_pool {
    pub const LEN: usize = 8 + 416;
    /// sha256("account:TransferHookPool")[..8]
    pub const DISCRIMINATOR: [u8; 8] = [237, 219, 184, 23, 42, 189, 169, 35];
    pub const CREATOR: usize = 104;
    pub const BASE_MINT: usize = 136;
    pub const BASE_VAULT: usize = 168;
    pub const BASE_RESERVE: usize = 232;
}

#[program]
pub mod pacer {
    use super::*;

    /// Attach an issuance clock (and optional burst limit) to a freshly created DBC
    /// transfer-hook pool.
    /// Must be signed by the pool creator; usually sent in the same transaction as
    /// `initialize_virtual_pool_with_token2022_transfer_hook`.
    pub fn initialize_pace(ctx: Context<InitializePace>, params: PaceParams) -> Result<()> {
        require!(
            params.opening_tranche > 0 || params.release_per_second > 0,
            PacerError::InvalidParams
        );
        require!(
            params.burst_capacity == 0 || params.release_per_second > 0,
            PacerError::InvalidParams
        );

        let mint_info = ctx.accounts.mint.to_account_info();
        let mint_data = mint_info.try_borrow_data()?;
        let mint = StateWithExtensions::<SplMint>::unpack(&mint_data)?;
        require!(
            hook_ext::get_program_id(&mint) == Some(crate::ID),
            PacerError::MintNotPaced
        );
        drop(mint_data);

        let pool_info = ctx.accounts.pool.to_account_info();
        let pool_data = pool_info.try_borrow_data()?;
        require!(pool_data.len() == dbc_pool::LEN, PacerError::InvalidPool);
        require!(
            pool_data[..8] == dbc_pool::DISCRIMINATOR,
            PacerError::InvalidPool
        );
        let creator = read_pubkey(&pool_data, dbc_pool::CREATOR);
        let base_mint = read_pubkey(&pool_data, dbc_pool::BASE_MINT);
        let base_vault = read_pubkey(&pool_data, dbc_pool::BASE_VAULT);
        let initial_base_reserve = read_u64(&pool_data, dbc_pool::BASE_RESERVE);
        require_keys_eq!(base_mint, ctx.accounts.mint.key(), PacerError::InvalidPool);
        require_keys_eq!(
            creator,
            ctx.accounts.creator.key(),
            PacerError::NotPoolCreator
        );

        // Extra accounts: Pacer's state PDA (derived from the mint) and the DBC pool (fixed).
        // Nothing depends on the trader's wallet, so generic hook resolvers (including the
        // DBC SDK, which resolves with placeholder keys) produce the right accounts.
        let metas = [
            ExtraAccountMeta::new_with_seeds(
                &[
                    Seed::Literal {
                        bytes: PACE_SEED.to_vec(),
                    },
                    Seed::AccountKey { index: 1 }, // mint
                ],
                false,
                true,
            )?,
            ExtraAccountMeta::new_with_pubkey(&ctx.accounts.pool.key(), false, false)?,
        ];
        let mut list_data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
        ExtraAccountMetaList::init::<ExecuteInstruction>(&mut list_data, &metas)?;

        let now = Clock::get()?.unix_timestamp;
        let pace = &mut ctx.accounts.pace_state;
        pace.mint = base_mint;
        pace.pool = ctx.accounts.pool.key();
        pace.base_vault = base_vault;
        pace.creator = creator;
        pace.start_ts = now;
        pace.opening_tranche = params.opening_tranche;
        pace.release_per_second = params.release_per_second;
        pace.max_per_buy = params.max_per_buy;
        pace.burst_capacity = params.burst_capacity;
        pace.burst_level = params.burst_capacity;
        pace.burst_updated_ts = now;
        pace.initial_base_reserve = initial_base_reserve;
        pace.net_out = 0;
        pace.total_bought = 0;
        pace.total_sold = 0;
        pace.buys = 0;
        pace.sells = 0;
        pace.bump = ctx.bumps.pace_state;

        emit!(PaceInitialized {
            mint: base_mint,
            pool: pace.pool,
            start_ts: now,
            opening_tranche: params.opening_tranche,
            release_per_second: params.release_per_second,
            max_per_buy: params.max_per_buy,
            burst_capacity: params.burst_capacity,
        });
        Ok(())
    }

    /// Token-2022 transfer hook entrypoint.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        // Only a real Token-2022 transfer of *this* mint may drive the hook: Token-2022 sets
        // `transferring` on the source account for the duration of the transfer, and the
        // source must hold this mint. A hook of another token cannot replay us mid-transfer.
        assert_transferring_this_mint(
            &ctx.accounts.source_token.to_account_info(),
            &ctx.accounts.mint.key(),
        )?;

        let pace = &mut ctx.accounts.pace_state;
        let source = ctx.accounts.source_token.key();
        let destination = ctx.accounts.destination_token.key();
        if source != pace.base_vault && destination != pace.base_vault {
            // Wallet-to-wallet transfers pass untouched.
            return Ok(());
        }

        // DBC applies the swap to its reserves before moving tokens, so this is the
        // post-trade supply outside the curve.
        let base_reserve = {
            let pool_data = ctx.accounts.pool.try_borrow_data()?;
            read_u64(&pool_data, dbc_pool::BASE_RESERVE)
        };
        let net_out = pace.initial_base_reserve.saturating_sub(base_reserve);

        if source == pace.base_vault {
            // Buy: supply leaves the curve. Enforce the clock.
            if pace.max_per_buy > 0 {
                require!(amount <= pace.max_per_buy, PacerError::ExceedsMaxPerBuy);
            }
            let now = Clock::get()?.unix_timestamp;
            let released = pace.released_at(now);
            if net_out > released {
                msg!(
                    "pacer: buy {} > available {} (released {}, out {})",
                    amount,
                    released.saturating_sub(pace.net_out),
                    released,
                    pace.net_out
                );
                return err!(PacerError::AheadOfClock);
            }
            if pace.burst_capacity > 0 {
                let level = pace.burst_level_at(now);
                if amount > level {
                    msg!("pacer: buy {} > burst available {}", amount, level);
                    return err!(PacerError::BurstLimit);
                }
                pace.burst_level = level - amount;
                pace.burst_updated_ts = now;
            }
            pace.net_out = net_out;
            pace.total_bought = pace.total_bought.saturating_add(amount);
            pace.buys = pace.buys.saturating_add(1);
            emit!(PacedBuy {
                mint: pace.mint,
                amount,
                net_out,
                released,
                ts: now,
            });
        } else if net_out < pace.net_out {
            // Sell through DBC: supply returned to the curve frees allowance. A plain transfer
            // into the vault leaves DBC's reserves unchanged and is ignored.
            let returned = pace.net_out - net_out;
            pace.net_out = net_out;
            pace.total_sold = pace.total_sold.saturating_add(returned);
            pace.sells = pace.sells.saturating_add(1);
            emit!(PacedSell {
                mint: pace.mint,
                amount: returned,
                net_out,
            });
        }
        Ok(())
    }
}

fn read_pubkey(data: &[u8], offset: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&data[offset..offset + 32]);
    Pubkey::new_from_array(bytes)
}

fn read_u64(data: &[u8], offset: usize) -> u64 {
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&data[offset..offset + 8]);
    u64::from_le_bytes(bytes)
}

fn assert_transferring_this_mint(account: &AccountInfo, mint: &Pubkey) -> Result<()> {
    let data = account.try_borrow_data()?;
    let state = StateWithExtensions::<SplTokenAccount>::unpack(&data)?;
    require_keys_eq!(state.base.mint, *mint, PacerError::NotTransferring);
    let ext = state.get_extension::<TransferHookAccount>()?;
    require!(bool::from(ext.transferring), PacerError::NotTransferring);
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug)]
pub struct PaceParams {
    /// Base units released the moment the pool opens.
    pub opening_tranche: u64,
    /// Base units released per second after that.
    pub release_per_second: u64,
    /// Largest single buy in base units (0 = no limit).
    pub max_per_buy: u64,
    /// Most that can be bought in a burst, refilled at `release_per_second` (0 = no limit).
    pub burst_capacity: u64,
}

#[account]
#[derive(InitSpace)]
pub struct PaceState {
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub base_vault: Pubkey,
    pub creator: Pubkey,
    pub start_ts: i64,
    pub opening_tranche: u64,
    pub release_per_second: u64,
    pub max_per_buy: u64,
    /// Token-bucket burst limit: capacity, current level and last refill time.
    pub burst_capacity: u64,
    pub burst_level: u64,
    pub burst_updated_ts: i64,
    /// DBC `base_reserve` when the clock started; `net_out` is measured against it.
    pub initial_base_reserve: u64,
    /// Net base units that have left the curve (bought minus sold), per DBC's reserves.
    pub net_out: u64,
    pub total_bought: u64,
    pub total_sold: u64,
    pub buys: u32,
    pub sells: u32,
    pub bump: u8,
}

impl PaceState {
    /// Supply the clock has released by `now`.
    pub fn released_at(&self, now: i64) -> u64 {
        let elapsed = now.saturating_sub(self.start_ts).max(0) as u64;
        self.opening_tranche
            .saturating_add(self.release_per_second.saturating_mul(elapsed))
    }

    /// Burst bucket level at `now`: refilled at the clock rate, capped at capacity.
    pub fn burst_level_at(&self, now: i64) -> u64 {
        let elapsed = now.saturating_sub(self.burst_updated_ts).max(0) as u64;
        self.burst_level
            .saturating_add(self.release_per_second.saturating_mul(elapsed))
            .min(self.burst_capacity)
    }
}

#[derive(Accounts)]
pub struct InitializePace<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: Token-2022 mint created by DBC; hook program id verified in the handler.
    #[account(owner = spl_token_2022::ID)]
    pub mint: UncheckedAccount<'info>,

    /// CHECK: DBC TransferHookPool; owner, discriminator, base mint and creator verified in the handler.
    #[account(owner = DBC_PROGRAM_ID)]
    pub pool: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + PaceState::INIT_SPACE,
        seeds = [PACE_SEED, mint.key().as_ref()],
        bump
    )]
    pub pace_state: Account<'info, PaceState>,

    /// CHECK: Transfer-hook validation account, initialized here.
    #[account(
        init,
        payer = creator,
        space = ExtraAccountMetaList::size_of(2).unwrap(),
        seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()],
        bump
    )]
    pub extra_account_meta_list: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

/// Account order is fixed by the transfer-hook interface:
/// source, mint, destination, authority, validation account, then extra accounts.
#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: source token account; `transferring` flag verified in the handler.
    #[account(owner = spl_token_2022::ID)]
    pub source_token: UncheckedAccount<'info>,
    /// CHECK: base mint.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: destination token account.
    pub destination_token: UncheckedAccount<'info>,
    /// CHECK: transfer authority (DBC pool authority on buys, the seller on sells).
    pub owner: UncheckedAccount<'info>,
    /// CHECK: validation account.
    #[account(seeds = [EXTRA_ACCOUNT_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [PACE_SEED, mint.key().as_ref()],
        bump = pace_state.bump,
        has_one = mint,
        has_one = pool
    )]
    pub pace_state: Account<'info, PaceState>,
    /// CHECK: the DBC pool recorded at initialization (`has_one = pool` above).
    pub pool: UncheckedAccount<'info>,
}

#[event]
pub struct PaceInitialized {
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub start_ts: i64,
    pub opening_tranche: u64,
    pub release_per_second: u64,
    pub max_per_buy: u64,
    pub burst_capacity: u64,
}

#[event]
pub struct PacedBuy {
    pub mint: Pubkey,
    pub amount: u64,
    pub net_out: u64,
    pub released: u64,
    pub ts: i64,
}

#[event]
pub struct PacedSell {
    pub mint: Pubkey,
    pub amount: u64,
    pub net_out: u64,
}

#[error_code]
pub enum PacerError {
    #[msg("Buy is ahead of the issuance clock — wait for more supply to be released")]
    AheadOfClock,
    #[msg("Buy exceeds the maximum size per buy")]
    ExceedsMaxPerBuy,
    #[msg("Buy exceeds the burst limit — too much supply bought in a short window")]
    BurstLimit,
    #[msg("Hook can only run inside a Token-2022 transfer")]
    NotTransferring,
    #[msg("Pool is not a DBC transfer-hook pool for this mint")]
    InvalidPool,
    #[msg("Signer is not the DBC pool creator")]
    NotPoolCreator,
    #[msg("Mint's transfer hook is not Pacer")]
    MintNotPaced,
    #[msg("Opening tranche or release rate must be non-zero")]
    InvalidParams,
    #[msg("Math overflow")]
    MathOverflow,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(opening: u64, rate: u64) -> PaceState {
        PaceState {
            mint: Pubkey::default(),
            pool: Pubkey::default(),
            base_vault: Pubkey::default(),
            creator: Pubkey::default(),
            start_ts: 1_000,
            opening_tranche: opening,
            release_per_second: rate,
            max_per_buy: 0,
            burst_capacity: 0,
            burst_level: 0,
            burst_updated_ts: 1_000,
            initial_base_reserve: 0,
            net_out: 0,
            total_bought: 0,
            total_sold: 0,
            buys: 0,
            sells: 0,
            bump: 0,
        }
    }

    #[test]
    fn releases_opening_tranche_at_start() {
        assert_eq!(state(500, 10).released_at(1_000), 500);
    }

    #[test]
    fn releases_linearly_after_start() {
        assert_eq!(state(500, 10).released_at(1_060), 500 + 600);
    }

    #[test]
    fn clock_never_runs_backwards() {
        // A timestamp before start (clock skew) releases only the opening tranche.
        assert_eq!(state(500, 10).released_at(900), 500);
    }

    #[test]
    fn release_saturates_instead_of_overflowing() {
        assert_eq!(
            state(u64::MAX - 1, u64::MAX).released_at(i64::MAX),
            u64::MAX
        );
    }

    #[test]
    fn pool_discriminator_matches_anchor_account_name() {
        use sha2::{Digest, Sha256};
        let digest = Sha256::digest(b"account:TransferHookPool");
        assert_eq!(dbc_pool::DISCRIMINATOR, digest[..8]);
    }

    #[test]
    fn pace_state_size_is_stable() {
        // 4 pubkeys + 2 i64 + 9 u64 + 2 u32 + u8
        assert_eq!(PaceState::INIT_SPACE, 4 * 32 + 2 * 8 + 9 * 8 + 2 * 4 + 1);
    }

    #[test]
    fn burst_refills_at_clock_rate_up_to_capacity() {
        let mut s = state(500, 10);
        s.burst_capacity = 100;
        s.burst_level = 0;
        s.burst_updated_ts = 1_000;
        assert_eq!(s.burst_level_at(1_000), 0);
        assert_eq!(s.burst_level_at(1_005), 50);
        assert_eq!(s.burst_level_at(1_100), 100);
        assert_eq!(s.burst_level_at(900), 0);
    }
}
