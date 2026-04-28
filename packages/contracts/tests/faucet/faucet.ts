import * as anchor from "@coral-xyz/anchor";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";

export async function setupFaucet(provider: anchor.AnchorProvider, decimals: number = 6) {
    const walletPayer = (provider.wallet as any)?.payer;
    const payer =
        walletPayer?.publicKey && walletPayer?.secretKey
            ? walletPayer
            : anchor.web3.Keypair.fromSecretKey(
                  Uint8Array.from(
                      JSON.parse(
                          fs.readFileSync(
                              process.env.ANCHOR_WALLET ??
                                  path.join(os.homedir(), ".config/solana/id.json"),
                              "utf8",
                          ),
                      ),
                  ),
              );
    
    const mint = await createMint(
        provider.connection,
        payer,
        payer.publicKey,
        null,
        decimals,
        anchor.web3.Keypair.generate(), // Add explicitly a new keypair for mint
        undefined,
        anchor.utils.token.TOKEN_PROGRAM_ID
    );
    
    return {
        mint,
        airdrop: async (targetPubkey: anchor.web3.PublicKey, amount: number) => {
            const ata = await getOrCreateAssociatedTokenAccount(
                provider.connection,
                payer,
                mint,
                targetPubkey,
                false,
                "confirmed",
                undefined,
                anchor.utils.token.TOKEN_PROGRAM_ID,
                anchor.utils.token.ASSOCIATED_PROGRAM_ID
            );
            
            // Wait for the ATA to be confirmed in the network before minting
            await new Promise(resolve => setTimeout(resolve, 1000));

            await mintTo(
                provider.connection,
                payer,
                mint,
                ata.address,
                payer, // Important: use Keypair payer instead of payer.publicKey
                amount,
                [],
                undefined,
                anchor.utils.token.TOKEN_PROGRAM_ID
            );
            
            return ata.address;
        }
    };
}
