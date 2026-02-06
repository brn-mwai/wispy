/**
 * Setup script for Wispy integrations
 * Creates wallets, tests connections, and configures services
 */

import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setup() {
  console.log("=== WISPY INTEGRATIONS SETUP ===\n");

  const configPath = path.join(__dirname, ".wispy", "integrations.json");
  let config = {};

  // Load existing config if exists
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    console.log("Loaded existing config\n");
  }

  // === 1. Create ERC-8004 / x402 Wallet ===
  console.log("1. Setting up blockchain wallet...\n");

  if (!config.wallet) {
    const wallet = ethers.Wallet.createRandom();
    config.wallet = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase,
      createdAt: new Date().toISOString()
    };
    console.log("   ✓ Created new wallet");
  } else {
    console.log("   ✓ Using existing wallet");
  }

  console.log(`   Address: ${config.wallet.address}`);
  console.log(`   \n   ⚠️  Fund this address with Base Sepolia ETH:`);
  console.log(`   https://www.alchemy.com/faucets/base-sepolia`);
  console.log(`   https://faucet.quicknode.com/base/sepolia\n`);

  // === 2. Test Base Sepolia Connection ===
  console.log("2. Testing Base Sepolia connection...\n");

  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  try {
    const blockNumber = await provider.getBlockNumber();
    console.log(`   ✓ Connected to Base Sepolia (block: ${blockNumber})`);

    const balance = await provider.getBalance(config.wallet.address);
    const ethBalance = ethers.formatEther(balance);
    console.log(`   Wallet balance: ${ethBalance} ETH`);

    if (parseFloat(ethBalance) < 0.001) {
      console.log(`   ⚠️  Need ETH for gas - use faucet above\n`);
    } else {
      console.log(`   ✓ Wallet has funds\n`);
    }
  } catch (err) {
    console.log(`   ✗ Connection failed: ${err.message}\n`);
  }

  // === 3. Check x402 / CDP Configuration ===
  console.log("3. Checking x402 (Coinbase CDP) configuration...\n");

  const cdpKeyId = process.env.CDP_API_KEY_ID;
  const cdpKeySecret = process.env.CDP_API_KEY_SECRET;

  if (cdpKeyId && cdpKeySecret) {
    console.log("   ✓ CDP credentials found in environment");
    config.x402 = { configured: true };
  } else {
    console.log("   ⚠️  CDP credentials not found");
    console.log("   Set these environment variables:");
    console.log("     CDP_API_KEY_ID=your_key_id");
    console.log("     CDP_API_KEY_SECRET=your_key_secret");
    console.log("   Get them from: https://portal.cdp.coinbase.com/\n");
    config.x402 = { configured: false };
  }

  // === 4. ERC-8004 Contract Addresses ===
  console.log("4. ERC-8004 contract configuration...\n");

  config.erc8004 = {
    network: "base-sepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    contracts: {
      identityRegistry: "0x0000000000000000000000000000000000000000",
      reputationRegistry: "0x0000000000000000000000000000000000000000",
      validationRegistry: "0x0000000000000000000000000000000000000000"
    },
    note: "Using mock mode for hackathon demo"
  };

  console.log("   Network: Base Sepolia (chainId: 84532)");
  console.log("   ⚠️  ERC-8004 contracts need deployment");
  console.log("   For hackathon demo, we can use mock mode\n");

  // === 5. A2A Protocol Configuration ===
  console.log("5. A2A Protocol configuration...\n");

  config.a2a = {
    enabled: true,
    selfTestUrl: "http://localhost:3000",
    agentCard: {
      name: "Wispy Agent",
      description: "Autonomous AI Agent powered by Gemini",
      version: "0.7.0"
    }
  };

  console.log("   ✓ A2A protocol configured");
  console.log("   Can test with: wispy gateway (starts A2A server)\n");

  // === 6. Vertex AI Configuration ===
  console.log("6. Vertex AI configuration...\n");

  const credPath = path.join(__dirname, "gen-lang-client-0425796557-1844e79149d1.json");
  if (fs.existsSync(credPath)) {
    config.vertexai = {
      configured: true,
      credentialsPath: credPath,
      project: "gen-lang-client-0425796557",
      location: "us-central1",
      models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"]
    };
    console.log("   ✓ Vertex AI configured");
    console.log(`   Project: ${config.vertexai.project}`);
    console.log(`   Models: ${config.vertexai.models.join(", ")}\n`);
  } else {
    console.log("   ✗ Vertex AI credentials not found\n");
  }

  // === Save Configuration ===
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

  console.log("=== SETUP COMPLETE ===\n");
  console.log("Configuration saved to: .wispy/integrations.json\n");

  // Summary
  console.log("INTEGRATION STATUS:");
  console.log("─".repeat(50));
  console.log(`  Vertex AI:    ${config.vertexai?.configured ? "✓ Ready" : "✗ Not configured"}`);
  console.log(`  Wallet:       ✓ ${config.wallet.address.slice(0, 10)}...`);
  console.log(`  x402/CDP:     ${config.x402?.configured ? "✓ Ready" : "⚠️  Need credentials"}`);
  console.log(`  ERC-8004:     ⚠️  Mock mode (contracts not deployed)`);
  console.log(`  A2A Protocol: ✓ Ready for testing`);
  console.log("─".repeat(50));

  console.log("\nNEXT STEPS:");
  console.log("  1. Fund wallet with Base Sepolia ETH (faucet links above)");
  console.log("  2. Get CDP credentials from portal.cdp.coinbase.com");
  console.log("  3. Run: node test-integrations.js");

  return config;
}

setup().catch(console.error);
