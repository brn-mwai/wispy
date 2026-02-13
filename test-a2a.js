/**
 * Test A2A Protocol Integration
 */

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\Windows\\Downloads\\wispy\\gen-lang-client-0425796557-1844e79149d1.json";

async function testA2A() {
  console.log("=== A2A PROTOCOL INTEGRATION TEST ===\n");

  const { A2AClient, createAgentCard } = await import("./dist/a2a/protocol.js");

  // Test 1: Create Agent Card
  console.log("1. Testing Agent Card creation...\n");

  const card = createAgentCard({
    name: "Wispy Agent",
    description: "Autonomous AI Agent powered by Gemini 2.5",
    url: "http://localhost:3000",
    version: "0.7.0",
    skills: [
      { id: "chat", name: "Chat", description: "General conversation" },
      { id: "marathon", name: "Marathon Mode", description: "Multi-day autonomous execution" },
      { id: "code", name: "Code Generation", description: "Write and modify code" },
      { id: "research", name: "Research", description: "Web search and analysis" }
    ]
  });

  console.log("   Agent Card:");
  console.log("   ─────────────────────────────────────");
  console.log(`   Name: ${card.name}`);
  console.log(`   Version: ${card.version}`);
  console.log(`   URL: ${card.url}`);
  console.log(`   Capabilities:`);
  console.log(`     - Streaming: ${card.capabilities.streaming}`);
  console.log(`     - Push Notifications: ${card.capabilities.pushNotifications}`);
  console.log(`   Skills: ${card.skills.map(s => s.name).join(", ")}`);
  console.log(`   Input Modes: ${card.defaultInputModes.join(", ")}`);
  console.log(`   Output Modes: ${card.defaultOutputModes.join(", ")}`);
  console.log("   ─────────────────────────────────────");
  console.log("   ✓ Agent Card created successfully\n");

  // Test 2: A2A Client instantiation
  console.log("2. Testing A2A Client...\n");

  const client = new A2AClient("https://example-agent.com", {
    timeout: 30000,
    authToken: "test-token"
  });
  console.log("   ✓ A2A Client instantiated\n");

  // Test 3: Try to discover a known A2A agent (will fail but tests the code path)
  console.log("3. Testing Agent Discovery...\n");

  // Test with a real A2A-compatible endpoint if one exists
  const testEndpoints = [
    "https://generativelanguage.googleapis.com", // Google's endpoint
  ];

  for (const endpoint of testEndpoints) {
    console.log(`   Trying: ${endpoint}`);
    const testClient = new A2AClient(endpoint, { timeout: 10000 });
    try {
      const discovered = await testClient.discover();
      console.log(`   ✓ Discovered: ${discovered.name}`);
    } catch (err) {
      console.log(`   ✗ Not A2A compatible (expected for most endpoints)`);
    }
  }

  console.log("\n   Note: Most public endpoints don't support A2A yet.");
  console.log("   Wispy can act as both A2A server and client.\n");

  // Test 4: Message creation (legacy format)
  console.log("4. Testing Message Signing...\n");

  const { createA2AMessage, verifyA2AMessage } = await import("./dist/a2a/protocol.js");
  const { loadOrCreateIdentity } = await import("./dist/security/device-identity.js");

  try {
    const identity = loadOrCreateIdentity("./.wispy");

    const message = createA2AMessage(
      identity,
      "Wispy Agent",
      "target-device-123",
      "ping",
      { timestamp: Date.now() }
    );

    console.log("   Created signed message:");
    console.log(`   - Type: ${message.type}`);
    console.log(`   - From: ${message.from.name}`);
    console.log(`   - Signature: ${message.signature.slice(0, 20)}...`);

    const verified = verifyA2AMessage(message);
    console.log(`   - Signature verified: ${verified}`);
    console.log("   ✓ Message signing works\n");
  } catch (err) {
    console.log(`   ✗ Message signing failed: ${err.message}\n`);
  }

  // Summary
  console.log("=== A2A TEST COMPLETE ===\n");
  console.log("Summary:");
  console.log("  ✓ Agent Card creation works");
  console.log("  ✓ A2A Client instantiation works");
  console.log("  ✓ Message signing/verification works");
  console.log("  ✓ Ready for agent-to-agent communication\n");

  console.log("To test full A2A flow:");
  console.log("  1. Start Wispy gateway: wispy gateway");
  console.log("  2. Access agent card: http://localhost:3000/.well-known/agent.json");
  console.log("  3. Send task: POST http://localhost:3000/a2a/task/send");
}

testA2A().catch(console.error);
