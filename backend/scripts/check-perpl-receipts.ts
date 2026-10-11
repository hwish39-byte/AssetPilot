import "dotenv/config";
import { ReceiptService } from "../src/receipts/receiptService.js";

async function main() {
  const service = new ReceiptService();
  await service.initialize();
  const chain = service.verifyChain();
  const signing = service.getSigningStatus();
  const shortHash = chain.lastReceiptHash ? `${chain.lastReceiptHash.slice(0, 10)}...${chain.lastReceiptHash.slice(-6)}` : "none";
  console.log(`perpl receipts: store=ok count=${chain.receiptCount} chain_valid=${chain.valid}`);
  console.log(`perpl receipts: latest_sequence=${chain.lastSequence ?? 0} latest_hash=${shortHash}`);
  console.log(`perpl receipts: signing_enabled=${signing.enabled} signing_key=${signing.keyId ?? "none"}`);
  console.log("perpl receipts: onchain_anchoring=disabled");
  if (!chain.valid) {
    console.log(`perpl receipts: errors=${chain.errors.length}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`perpl receipts: failed ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
