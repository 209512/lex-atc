import * as anchor from "@coral-xyz/anchor";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createMint,
    getAssociatedTokenAddressSync,
    mintTo,
} from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";

async function waitForAccountInfo(
    connection: anchor.web3.Connection,
    pubkey: anchor.web3.PublicKey,
    commitment: anchor.web3.Commitment,
) {
    for (let i = 0; i < 40; i++) {
        const info = await connection.getAccountInfo(pubkey, commitment);
        if (info) return;
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Account not found: ${pubkey.toBase58()}`);
}

async function waitForTokenAccountBalance(
    connection: anchor.web3.Connection,
    pubkey: anchor.web3.PublicKey,
    expectedAmount: string,
    commitment: anchor.web3.Commitment,
) {
    for (let i = 0; i < 40; i++) {
        try {
            const bal = await connection.getTokenAccountBalance(pubkey, commitment);
            if (bal.value.amount === expectedAmount) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Token balance not reached for: ${pubkey.toBase58()}`);
}

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
        { commitment: "confirmed" },
        TOKEN_PROGRAM_ID
    );
    
    return {
        mint,
        airdrop: async (targetPubkey: anchor.web3.PublicKey, amount: number) => {
            const ataAddress = getAssociatedTokenAddressSync(
                mint,
                targetPubkey,
                false,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID,
            );

            const existing = await provider.connection.getAccountInfo(ataAddress, "confirmed");
            if (!existing) {
                const createAtaIx = createAssociatedTokenAccountInstruction(
                    payer.publicKey,
                    ataAddress,
                    targetPubkey,
                    mint,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID,
                );

                const tx = new anchor.web3.Transaction().add(createAtaIx);
                await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [payer], {
                    commitment: "confirmed",
                });
            }

            await waitForAccountInfo(provider.connection, ataAddress, "confirmed");

            await mintTo(
                provider.connection,
                payer,
                mint,
                ataAddress,
                payer, // Important: use Keypair payer instead of payer.publicKey
                amount,
                [],
                { commitment: "confirmed" },
                TOKEN_PROGRAM_ID
            );

            await waitForTokenAccountBalance(
                provider.connection,
                ataAddress,
                String(amount),
                "confirmed",
            );
            
            return ataAddress;
        }
    };
}
