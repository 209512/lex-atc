import * as anchor from "@coral-xyz/anchor";
import { setupFaucet } from "./faucet";
import { assert } from "chai";

describe("LEX Token Faucet", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  it("mints LEX tokens to a target pubkey", async () => {
    // 1. Get payer from wallet (fallback to env)
    const payer =
      (provider.wallet as any)?.payer ??
      anchor.web3.Keypair.fromSecretKey(
        Uint8Array.from(
          JSON.parse(
            require("fs").readFileSync(
              process.env.ANCHOR_WALLET ?? require("path").join(require("os").homedir(), ".config/solana/id.json"),
              "utf8",
            ),
          ),
        ),
      );

    // 2. Airdrop SOL to the payer if needed (localnet only)
    try {
      const sigPayer = await provider.connection.requestAirdrop(payer.publicKey, 1000000000);
      const latestBlockHashPayer = await provider.connection.getLatestBlockhash();
      await provider.connection.confirmTransaction({
        blockhash: latestBlockHashPayer.blockhash,
        lastValidBlockHeight: latestBlockHashPayer.lastValidBlockHeight,
        signature: sigPayer,
      }, "confirmed");
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      // Ignore airdrop errors (might not be needed or supported on mainnet/devnet)
    }

    const faucet = await setupFaucet(provider, 6);
    assert.isNotNull(faucet.mint);

    const dummyUser = anchor.web3.Keypair.generate();
    
    // Airdrop SOL to dummy user for rent
    try {
      const sig = await provider.connection.requestAirdrop(dummyUser.publicKey, 1000000000);
      const latestBlockHash = await provider.connection.getLatestBlockhash();
      await provider.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: sig,
      }, "confirmed");
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e) {
      console.log("Airdrop to dummy user failed, proceeding anyway");
    }

    // Use faucet to mint LEX tokens
    const ataAddress = await faucet.airdrop(dummyUser.publicKey, 5000);
    
    const balance = await provider.connection.getTokenAccountBalance(ataAddress);
    assert.equal(balance.value.amount, "5000");
  });
});
