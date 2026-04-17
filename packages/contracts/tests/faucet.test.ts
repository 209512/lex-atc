import * as anchor from "@coral-xyz/anchor";
import { setupFaucet } from "./faucet";
import { assert } from "chai";

describe("LEX Token Faucet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("mints LEX tokens to a target pubkey", async () => {
    const faucet = await setupFaucet(provider, 6);
    assert.isNotNull(faucet.mint);

    const dummyUser = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to dummy user for rent
    const sig = await provider.connection.requestAirdrop(dummyUser.publicKey, 1000000000);
    await provider.connection.confirmTransaction(sig);

    // Use faucet to mint LEX tokens
    const ataAddress = await faucet.airdrop(dummyUser.publicKey, 5000);
    
    const balance = await provider.connection.getTokenAccountBalance(ataAddress);
    assert.equal(balance.value.amount, "5000");
  });
});
