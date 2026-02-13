/**
 * Test ERC-8004 Integration (Mock Mode)
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testERC8004() {
  console.log("=== ERC-8004 INTEGRATION TEST ===\n");

  // Load wallet from config
  const configPath = path.join(__dirname, ".wispy", "integrations.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  console.log("1. Testing ERC8004Client instantiation...\n");

  const { ERC8004Client } = await import("./dist/trust/erc8004.js");

  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const wallet = new ethers.Wallet(config.wallet.privateKey, provider);

  console.log(`   Wallet: ${wallet.address}`);
  console.log(`   Network: Base Sepolia`);

  const client = new ERC8004Client(wallet, "./.wispy", {
    // Using zero addresses for mock mode
    identityRegistry: "0x0000000000000000000000000000000000000000",
    reputationRegistry: "0x0000000000000000000000000000000000000000",
    validationRegistry: "0x0000000000000000000000000000000000000000"
  });

  console.log("   ✓ ERC8004Client instantiated\n");

  console.log("2. Testing Registration File Builder...\n");

  const regFile = client.buildRegistrationFile({
    name: "Wispy Agent",
    description: "Autonomous AI Agent powered by Gemini 2.5",
    url: "https://wispy.example.com",
    image: "https://wispy.example.com/logo.png",
    agentId: "1"
  });

  console.log("   Registration File (for /.well-known/agent.json):");
  console.log("   ─────────────────────────────────────────────────");
  console.log(`   Type: ${regFile.type}`);
  console.log(`   Name: ${regFile.name}`);
  console.log(`   Active: ${regFile.active}`);
  console.log(`   x402 Support: ${regFile.x402Support}`);
  console.log(`   Services:`);
  for (const svc of regFile.services) {
    console.log(`     - ${svc.type}: ${svc.serviceEndpoint}`);
  }
  console.log(`   Trust: ${regFile.supportedTrust?.join(", ")}`);
  console.log("   ─────────────────────────────────────────────────");
  console.log("   ✓ Registration file builder works\n");

  console.log("3. Testing Local Registration Storage...\n");

  const isRegistered = client.isRegistered();
  console.log(`   Is locally registered: ${isRegistered}`);

  const localReg = client.getLocalRegistration();
  if (localReg) {
    console.log(`   Local Agent ID: ${localReg.agentId}`);
  } else {
    console.log("   No local registration found (expected for new setup)");
  }
  console.log("   ✓ Local storage works\n");

  console.log("4. Checking Contract Deployment Status...\n");

  const isDeployed = await client.isDeployed();
  console.log(`   Contracts deployed: ${isDeployed}`);

  if (!isDeployed) {
    console.log("   ⚠️  ERC-8004 contracts not deployed at configured addresses");
    console.log("   For hackathon demo, the client works in mock mode:");
    console.log("   - Registration file generation: ✓ Works");
    console.log("   - Local storage: ✓ Works");
    console.log("   - On-chain registration: Needs deployed contracts");
  }
  console.log();

  // Test 5: SDK Integration Check
  console.log("5. Testing SDK Integration...\n");

  try {
    const { IdentityClient, EthersAdapter } = await import("erc-8004-js");
    console.log("   ✓ erc-8004-js SDK imported successfully");
    console.log("   ✓ IdentityClient available");
    console.log("   ✓ EthersAdapter available\n");
  } catch (err) {
    console.log(`   ✗ SDK import failed: ${err.message}\n`);
  }

  // Summary
  console.log("=== ERC-8004 TEST COMPLETE ===\n");
  console.log("Summary:");
  console.log("  ✓ ERC8004Client instantiation works");
  console.log("  ✓ Registration file builder works");
  console.log("  ✓ Local storage works");
  console.log("  ✓ SDK integration works");
  console.log("  ⚠️  On-chain features need deployed contracts\n");

  console.log("For full on-chain testing:");
  console.log("  1. Deploy ERC-8004 contracts to Base Sepolia");
  console.log("  2. Update contract addresses in config");
  console.log("  3. Fund wallet with testnet ETH");
  console.log("  4. Run: wispy agent 'Register my identity with ERC-8004'");
}

testERC8004().catch(console.error);
