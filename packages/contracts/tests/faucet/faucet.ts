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
