import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { LexAtcSettlement } from "../target/types/lex_atc_settlement";
import { createMint, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import fs from "fs";
import os from "os";
import path from "path";

describe("lex_atc_settlement", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LexAtcSettlement as Program<LexAtcSettlement>;

  const authorityKeypair =
    (provider.wallet as any)?.payer ??
    anchor.web3.Keypair.fromSecretKey(
      Uint8Array.from(
        JSON.parse(
          fs.readFileSync(
            process.env.ANCHOR_WALLET ?? path.join(os.homedir(), ".config/solana/id.json"),
            "utf8",
          ),
        ),
      ),
    );

  const treasuryKeypair = anchor.web3.Keypair.generate();

  const [channelPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("channel"), authorityKeypair.publicKey.toBuffer(), treasuryKeypair.publicKey.toBuffer()],
    program.programId,
  );

  const createEd25519Ix = (signer: anchor.web3.Keypair, message: Buffer) =>
    anchor.web3.Ed25519Program.createInstructionWithPrivateKey({
      privateKey: signer.secretKey,
      message,
    });

  it("Initializes and submits a state channel snapshot", async () => {
    const nonce = new anchor.BN(1);
    const stateHash = Buffer.alloc(32, 1);

    await program.methods
      .submitSnapshot(nonce, stateHash)
      .accounts({
        channel: channelPda,
        authority: authorityKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .preInstructions([
        createEd25519Ix(authorityKeypair, stateHash),
        createEd25519Ix(treasuryKeypair, stateHash),
      ])
      .rpc();

    const channelAccount = await program.account.stateChannel.fetch(channelPda);
    
    assert.ok(channelAccount.lastNonce.eq(nonce));
    assert.deepEqual(channelAccount.status, { active: {} });
    const storedHash = Array.isArray(channelAccount.stateHash)
      ? channelAccount.stateHash
      : Array.from(channelAccount.stateHash as any);
    assert.deepEqual(storedHash, Array.from(stateHash));
  });

  it("Fails when submitting an older or equal nonce (Replay Attack Prevention)", async () => {
    const nonce = new anchor.BN(1);
    const stateHash = Buffer.alloc(32, 2);

    try {
      await program.methods
        .submitSnapshot(nonce, stateHash)
        .accounts({
          channel: channelPda,
          authority: authorityKeypair.publicKey,
          treasury: treasuryKeypair.publicKey,
          ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      
      assert.fail("The transaction should have failed with StaleNonce error");
    } catch (err: any) {
      assert.include(err.message, "StaleNonce");
    }
  });

  it("Opens a dispute successfully", async () => {
    const targetNonce = new anchor.BN(1);

    await program.methods
      .openDispute(targetNonce)
      .accounts({
        channel: channelPda,
        authority: authorityKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
      })
      .rpc();

    const channelAccount = await program.account.stateChannel.fetch(channelPda);
    assert.deepEqual(channelAccount.status, { disputed: {} });
  });

  it("Slashes the channel successfully", async () => {
    const reason = "MALICIOUS_DOUBLE_SPEND";

    const mint = await createMint(
      provider.connection,
      authorityKeypair,
      authorityKeypair.publicKey,
      null,
      6,
    );

    const escrowTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authorityKeypair,
      mint,
      channelPda,
      true,
    );

    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authorityKeypair,
      mint,
      treasuryKeypair.publicKey,
    );

    // Wait for the dispute window to pass (60 seconds)
    console.log("Waiting for 62 seconds to bypass dispute window...");
    await new Promise(resolve => setTimeout(resolve, 62000));

    await program.methods
      .slash(reason)
      .accounts({
        channel: channelPda,
        authority: authorityKeypair.publicKey,
        treasury: treasuryKeypair.publicKey,
        escrowTokenAccount: escrowTokenAccount.address,
        treasuryTokenAccount: treasuryTokenAccount.address,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([treasuryKeypair])
      .rpc();

    const channelAccount = await program.account.stateChannel.fetch(channelPda);
    assert.deepEqual(channelAccount.status, { slashed: {} });
  });
});
