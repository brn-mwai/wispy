/**
 * Test Marathon Agent with Gemini 2.5 Pro
 */

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\Windows\\Downloads\\wispy\\gen-lang-client-0425796557-1844e79149d1.json";

async function testMarathon() {
  console.log("=== TESTING MARATHON AGENT WITH GEMINI 2.5 PRO ===\n");

  const { initGemini, generateWithThinking } = await import("./dist/ai/gemini.js");
  const { createMarathonPlan, formatPlanSummary } = await import("./dist/marathon/planner.js");

  // Initialize with Vertex AI
  const vertexConfig = {
    vertexai: true,
    project: "gen-lang-client-0425796557",
    location: "us-central1"
  };

  initGemini(vertexConfig);

  console.log("1. Testing generateWithThinking (ultra level)...\n");

  try {
    const thinkingResult = await generateWithThinking(
      "Plan the architecture for a simple todo app with React frontend and Node.js backend. Think deeply about the folder structure, key components, and API endpoints needed.",
      "ultra",
      vertexConfig,
      "gemini-2.5-pro"
    );

    console.log("   Response preview:");
    console.log("   " + thinkingResult.slice(0, 500).replace(/\n/g, '\n   ') + "...\n");
    console.log("   ✓ generateWithThinking works!\n");
  } catch (err) {
    console.log("   ✗ Failed:", err.message, "\n");
  }

  console.log("2. Testing createMarathonPlan...\n");

  try {
    const plan = await createMarathonPlan(
      "Create a simple CLI calculator that supports add, subtract, multiply, divide",
      "Working directory: /tmp/calculator-test",
      vertexConfig
    );

    console.log("   Plan created successfully!");
    console.log("   Goal:", plan.goal);
    console.log("   Milestones:", plan.milestones.length);
    console.log("   Estimated time:", plan.estimatedTotalMinutes, "minutes\n");

    console.log("   Milestones:");
    for (const m of plan.milestones) {
      console.log(`     - ${m.title} (${m.estimatedMinutes}m)`);
    }

    console.log("\n   ✓ Marathon planning works!\n");
  } catch (err) {
    console.log("   ✗ Failed:", err.message, "\n");
    console.log("   Full error:", err);
  }

  console.log("=== MARATHON TEST COMPLETE ===");
}

testMarathon();
