//! Pacer — an issuance clock for Meteora Dynamic Bonding Curve (DBC) launches.
//!
//! Pacer is a Token-2022 transfer hook. DBC runs it on every transfer of the base token
//! while the token sits on the bonding curve, and revokes it automatically when the curve
//! completes. Pacer only constrains one thing: how much supply may leave the curve vault
//! by time `t`:
//!
//!     net_out(t) <= opening_tranche + release_per_second * (t - start_ts)
//!
//! A buyer (or bot) can never take more than the clock has released, so a one-block sweep
//! of the curve reverts and price discovery is spread over a schedule the creator publishes
//! at launch. Sells return supply to the vault and free allowance; wallet-to-wallet
//! transfers are never touched.

use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    self,
    extension::{
        transfer_hook::{self as hook_ext, TransferHookAccount},
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::{Account as SplTokenAccount, Mint as SplMint},
};
use spl_tlv_account_resolution::{account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList};
use spl_discriminator::SplDiscriminate;
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
}

#[program]
pub mod pacer {
    use super::*;

    /// Attach an issuance clock to a freshly created DBC transfer-hook pool.
    /// Must be signed by the pool creator; usually sent in the same transaction as
    /// `initialize_virtual_pool_with_token2022_transfer_hook`.
    pub fn initialize_pace(ctx: Context<InitializePace>, params: PaceParams) -> Result<()> {
        require!(
            params.opening_tranche > 0 || params.release_per_second > 0,
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
        require_keys_eq!(base_mint, ctx.accounts.mint.key(), PacerError::InvalidPool);
        require_keys_eq!(creator, ctx.accounts.creator.key(), PacerError::NotPoolCreator);

        // The only extra account Pacer needs is its own state PDA, derived from the mint.
        // Nothing depends on the trader's wallet, so generic hook resolvers (including the
        // DBC SDK, which resolves with placeholder keys) produce the right accounts.
        let metas = [ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal { bytes: PACE_SEED.to_vec() },
                Seed::AccountKey { index: 1 }, // mint
            ],
            false,
            true,
        )?];
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
        });
        Ok(())
    }

    /// Token-2022 transfer hook entrypoint.
    #[instruction(discriminator = ExecuteInstruction::SPL_DISCRIMINATOR_SLICE)]
    pub fn execute(ctx: Context<Execute>, amount: u64) -> Result<()> {
        // Only Token-2022 may drive this hook: it sets `transferring` on the source account
        // for the duration of a real transfer. Direct calls cannot move the clock.
        assert_is_transferring(&ctx.accounts.source_token.to_account_info())?;

        let pace = &mut ctx.accounts.pace_state;
        let source = ctx.accounts.source_token.key();
        let destination = ctx.accounts.destination_token.key();

        if source == pace.base_vault {
            // Buy: supply leaves the curve. Enforce the clock.
            let now = Clock::get()?.unix_timestamp;
            let released = pace.released_at(now);
            if pace.max_per_buy > 0 {
                require!(amount <= pace.max_per_buy, PacerError::ExceedsMaxPerBuy);
            }
            let net_out = pace
                .net_out
                .checked_add(amount)
                .ok_or(PacerError::MathOverflow)?;
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
        } else if destination == pace.base_vault {
            // Sell: supply returns to the curve and frees allowance.
            pace.net_out = pace.net_out.saturating_sub(amount);
            pace.total_sold = pace.total_sold.saturating_add(amount);
            pace.sells = pace.sells.saturating_add(1);
            emit!(PacedSell {
                mint: pace.mint,
                amount,
                net_out: pace.net_out,
            });
        }
        // Wallet-to-wallet transfers pass untouched.
        Ok(())
    }
}

fn read_pubkey(data: &[u8], offset: usize) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes.copy_from_slice(&data[offset..offset + 32]);
    Pubkey::new_from_array(bytes)
}

fn assert_is_transferring(account: &AccountInfo) -> Result<()> {
    let data = account.try_borrow_data()?;
    let state = StateWithExtensions::<SplTokenAccount>::unpack(&data)?;
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
    /// Net base units that have left the curve vault (bought minus sold).
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
        space = ExtraAccountMetaList::size_of(1).unwrap(),
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
        has_one = mint
    )]
    pub pace_state: Account<'info, PaceState>,
}

#[event]
pub struct PaceInitialized {
    pub mint: Pubkey,
    pub pool: Pubkey,
    pub start_ts: i64,
    pub opening_tranche: u64,
    pub release_per_second: u64,
    pub max_per_buy: u64,
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
