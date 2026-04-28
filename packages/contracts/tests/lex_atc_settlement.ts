import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { LexAtcSettlement } from "../target/types/lex_atc_settlement";

describe("lex_atc_settlement", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.LexAtcSettlement as Program<LexAtcSettlement>;
  
  const [channelPda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("channel"), program.provider.publicKey.toBuffer(), anchor.web3.SystemProgram.programId.toBuffer()],
    program.programId
  );

  it("Initializes and submits a state channel snapshot", async () => {
    const stateHash = "QmTestHash1234567890abcdef";
    const nonce = new anchor.BN(1);

    await program.methods
      .submitSnapshot(nonce, stateHash)
      .accounts({
        channel: channelPda,
        authority: program.provider.publicKey,
        treasury: anchor.web3.SystemProgram.programId, // Using SystemProgram as a dummy treasury for test
        ixSysvar: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const channelAccount = await program.account.stateChannel.fetch(channelPda);
    
    assert.ok(channelAccount.lastNonce.eq(nonce));
    assert.equal(channelAccount.stateHash, stateHash);
    assert.deepEqual(channelAccount.status, { active: {} });
  });

  it("Fails when submitting an older or equal nonce (Replay Attack Prevention)", async () => {
    const stateHash = "QmStaleHash123";
    const nonce = new anchor.BN(1);

    try {
      await program.methods
        .submitSnapshot(nonce, stateHash)
        .accounts({
          channel: channelPda,
          authority: program.provider.publicKey,
          treasury: anchor.web3.SystemProgram.programId,
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
        authority: program.provider.publicKey,
        treasury: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const channelAccount = await program.account.stateChannel.fetch(channelPda);
    assert.deepEqual(channelAccount.status, { disputed: {} });
  });

  it("Slashes the channel successfully", async () => {
    const reason = "MALICIOUS_DOUBLE_SPEND";

    await program.methods
      .slash(reason)
      .accounts({
        channel: channelPda,
        authority: program.provider.publicKey,
        treasury: program.provider.publicKey, // Must be signer, using provider as dummy treasury
        escrowTokenAccount: anchor.web3.SystemProgram.programId, // Dummy
        treasuryTokenAccount: anchor.web3.SystemProgram.programId, // Dummy
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const channelAccount = await program.account.stateChannel.fetch(channelPda);
    assert.deepEqual(channelAccount.status, { slashed: {} });
  });
});
