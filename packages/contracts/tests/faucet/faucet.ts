import * as anchor from "@coral-xyz/anchor";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

export async function setupFaucet(provider: anchor.AnchorProvider, decimals: number = 6) {
    const payer = (provider.wallet as anchor.Wallet).payer;
    
    // Create new LEX Token Mint
    const mint = await createMint(
        provider.connection,
        payer,
        payer.publicKey,
        null,
        decimals
    );
    
    return {
        mint,
        airdrop: async (targetPubkey: anchor.web3.PublicKey, amount: number) => {
            const ata = await getOrCreateAssociatedTokenAccount(
                provider.connection,
                payer,
                mint,
                targetPubkey
            );
            
            await mintTo(
                provider.connection,
                payer,
                mint,
                ata.address,
                payer.publicKey,
                amount
            );
            
            return ata.address;
        }
    };
}
