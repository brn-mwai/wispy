/**
 * Test script for hackathon components
 * Run: node test-hackathon.js
 */

async function testComponents() {
  console.log("=== WISPY HACKATHON COMPONENT TESTS ===\n");

  const results = {
    passed: [],
    failed: []
  };

  // Test 1: Trust Controller
  console.log("1. Testing Trust Controller...");
  try {
    const { TrustController } = await import("./dist/trust/controller.js");
    const controller = new TrustController({ defaultLevel: "notify" });
    console.log("   - TrustController instantiated");

    // Test rule setting (method is addRule, not setRule)
    controller.addRule({ action: "test_action", level: "approve" });
    console.log("   - addRule() works");

    // Test getting level
    const level = controller.getLevel("file_read");
    console.log("   - getLevel('file_read'):", level);

    // Test creating approval
    const { id, level: approvalLevel } = await controller.createApproval({
      action: "test_action",
      description: "Test approval request",
      channel: "test",
      userId: "test_user"
    });
    console.log("   - createApproval() returned ID:", id, "level:", approvalLevel);

    // Check pending
    const pending = controller.listPending();
    console.log("   - listPending() returned:", pending.length, "request(s)");

    results.passed.push("Trust Controller");
    console.log("   ✓ PASSED\n");
  } catch (err) {
    results.failed.push({ name: "Trust Controller", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 2: x402 Client (structure only - needs private key for full test)
  console.log("2. Testing x402 Client...");
  try {
    const x402Module = await import("./dist/wallet/x402-client.js");
    console.log("   - x402-client module loaded");
    console.log("   - Exports:", Object.keys(x402Module));

    // Check X402Client class exists
    if (x402Module.X402Client) {
      console.log("   - X402Client class exists");
      console.log("   - Has static create method:", typeof x402Module.X402Client.create === "function");
    }

    // Check global client functions
    console.log("   - getX402Client function:", typeof x402Module.getX402Client === "function");
    console.log("   - setX402Client function:", typeof x402Module.setX402Client === "function");

    results.passed.push("x402 Client (module structure)");
    console.log("   ✓ PASSED (note: full test requires wallet credentials)\n");
  } catch (err) {
    results.failed.push({ name: "x402 Client", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 3: ERC-8004 Client
  console.log("3. Testing ERC-8004 Client...");
  try {
    const { ERC8004Client } = await import("./dist/trust/erc8004.js");
    const { ethers } = await import("ethers");

    // Create a mock provider/signer for testing
    const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
    const wallet = ethers.Wallet.createRandom().connect(provider);

    const client = new ERC8004Client(wallet, "./.wispy");
    console.log("   - ERC8004Client instantiated");

    // Test registration file builder
    const regFile = client.buildRegistrationFile({
      name: "Test Agent",
      description: "A test agent",
      url: "https://test.example.com"
    });
    console.log("   - buildRegistrationFile() returned type:", regFile.type);
    console.log("   - Registration file has services:", regFile.services.length);

    // Test local registration check
    const isRegistered = client.isRegistered();
    console.log("   - isRegistered():", isRegistered);

    results.passed.push("ERC-8004 Client");
    console.log("   ✓ PASSED\n");
  } catch (err) {
    results.failed.push({ name: "ERC-8004 Client", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 4: A2A Protocol
  console.log("4. Testing A2A Protocol...");
  try {
    const { A2AClient, createAgentCard } = await import("./dist/a2a/protocol.js");

    // Test agent card creation
    const card = createAgentCard({
      name: "Test Agent",
      description: "A test agent",
      url: "https://test.example.com",
      version: "1.0.0"
    });
    console.log("   - createAgentCard() returned:", card.name);
    console.log("   - capabilities:", Object.keys(card.capabilities));
    console.log("   - skills count:", card.skills.length);

    // Test client instantiation
    const client = new A2AClient("https://example.com");
    console.log("   - A2AClient instantiated");

    results.passed.push("A2A Protocol");
    console.log("   ✓ PASSED\n");
  } catch (err) {
    results.failed.push({ name: "A2A Protocol", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 5: CRE Workflows
  console.log("5. Testing CRE Workflows...");
  try {
    const {
      createDeFiMonitorWorkflow,
      createPriceAlertWorkflow,
      createTrustBridgeWorkflow,
      generateCREConfig,
      simulateWorkflow
    } = await import("./dist/cre/workflows.js");

    // Test DeFi monitor workflow with correct params
    const defiWorkflow = createDeFiMonitorWorkflow({
      schedule: "*/15 * * * *",
      subgraphUrl: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
      walletAddress: "0x1234567890123456789012345678901234567890",
      ilThreshold: 0.1,
      wispyApiUrl: "http://localhost:3000"
    });
    console.log("   - createDeFiMonitorWorkflow() returned trigger type:", defiWorkflow.trigger.type);

    // Test price alert workflow with correct params
    const priceWorkflow = createPriceAlertWorkflow({
      feedAddress: "0x1234567890123456789012345678901234567890",
      targetPrice: 3000,
      direction: "above",
      chainId: 8453,
      wispyApiUrl: "http://localhost:3000"
    });
    console.log("   - createPriceAlertWorkflow() returned trigger type:", priceWorkflow.trigger.type);

    // Test trust bridge workflow
    const bridgeWorkflow = createTrustBridgeWorkflow({
      wispyApiUrl: "http://localhost:3000"
    });
    console.log("   - createTrustBridgeWorkflow() returned trigger type:", bridgeWorkflow.trigger.type);

    // Test CRE config generator
    const creConfig = generateCREConfig({
      projectName: "test-project",
      wispyApiUrl: "http://localhost:3000",
      walletAddress: "0x1234567890123456789012345678901234567890"
    });
    console.log("   - generateCREConfig() returned project:", creConfig.projectName);
    console.log("   - Workflows configured:", creConfig.workflows.length);

    results.passed.push("CRE Workflows");
    console.log("   ✓ PASSED\n");
  } catch (err) {
    results.failed.push({ name: "CRE Workflows", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 6: Tool Declarations
  console.log("6. Testing Tool Declarations...");
  try {
    const { BUILT_IN_TOOLS, getToolDeclarations } = await import("./dist/ai/tools.js");

    const hackathonTools = [
      "trust_request",
      "trust_list_pending",
      "x402_fetch",
      "x402_balance",
      "erc8004_register",
      "erc8004_verify",
      "erc8004_reputation",
      "erc8004_feedback",
      "a2a_discover",
      "a2a_delegate",
      "a2a_delegate_stream",
      "cre_simulate",
      "cre_deploy"
    ];

    const foundTools = [];
    const missingTools = [];

    for (const toolName of hackathonTools) {
      const found = BUILT_IN_TOOLS.find(t => t.name === toolName);
      if (found) {
        foundTools.push(toolName);
      } else {
        missingTools.push(toolName);
      }
    }

    console.log("   - Total BUILT_IN_TOOLS:", BUILT_IN_TOOLS.length);
    console.log("   - Found hackathon tools:", foundTools.length + "/" + hackathonTools.length);

    if (missingTools.length > 0) {
      console.log("   - Missing tools:", missingTools.join(", "));
    }

    // Test getToolDeclarations
    const declarations = getToolDeclarations(true, [], [], []);
    console.log("   - getToolDeclarations() returns array:", Array.isArray(declarations));

    if (missingTools.length === 0) {
      results.passed.push("Tool Declarations");
      console.log("   ✓ PASSED\n");
    } else {
      results.failed.push({ name: "Tool Declarations", error: "Missing: " + missingTools.join(", ") });
      console.log("   ✗ FAILED\n");
    }
  } catch (err) {
    results.failed.push({ name: "Tool Declarations", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 7: Tool Executor (hackathon tools)
  console.log("7. Testing Tool Executor integration...");
  try {
    const toolExecutor = await import("./dist/agents/tool-executor.js");
    console.log("   - tool-executor module loaded");
    console.log("   - Exports:", Object.keys(toolExecutor).slice(0, 5), "...");

    if (toolExecutor.executeBuiltInTool) {
      console.log("   - executeBuiltInTool function exists");
    }

    results.passed.push("Tool Executor");
    console.log("   ✓ PASSED\n");
  } catch (err) {
    results.failed.push({ name: "Tool Executor", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Test 8: Telegram Handler
  console.log("8. Testing Telegram Trust Handler...");
  try {
    const telegramHandler = await import("./dist/trust/telegram-handler.js");
    console.log("   - telegram-handler module loaded");
    console.log("   - Exports:", Object.keys(telegramHandler));

    if (telegramHandler.createApprovalKeyboard) {
      console.log("   - createApprovalKeyboard function exists");
    }

    if (telegramHandler.handleTrustCallback) {
      console.log("   - handleTrustCallback function exists");
    }

    results.passed.push("Telegram Trust Handler");
    console.log("   ✓ PASSED\n");
  } catch (err) {
    results.failed.push({ name: "Telegram Trust Handler", error: err.message });
    console.log("   ✗ FAILED:", err.message, "\n");
  }

  // Summary
  console.log("=== TEST SUMMARY ===\n");
  console.log("Passed:", results.passed.length);
  for (const p of results.passed) {
    console.log("  ✓", p);
  }
  console.log("\nFailed:", results.failed.length);
  for (const f of results.failed) {
    console.log("  ✗", f.name, "-", f.error);
  }

  console.log("\n" + "=".repeat(50));
  if (results.failed.length === 0) {
    console.log("ALL TESTS PASSED!");
    return 0;
  } else {
    console.log("SOME TESTS FAILED - See errors above");
    return 1;
  }
}

testComponents().then(code => process.exit(code)).catch(err => {
  console.error("Test script error:", err);
  process.exit(1);
});
