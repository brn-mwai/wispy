/**
 * Test available Gemini models on Vertex AI
 */

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\Windows\\Downloads\\wispy\\gen-lang-client-0425796557-1844e79149d1.json";

async function testModels() {
  console.log("=== TESTING AVAILABLE GEMINI MODELS ===\n");

  const { initGemini, generate } = await import("./dist/ai/gemini.js");

  initGemini({
    vertexai: true,
    project: "gen-lang-client-0425796557",
    location: "us-central1"
  });

  // Models to test
  const models = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.0-flash-exp",
    "gemini-2.0-pro",
    "gemini-2.0-pro-exp",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-pro-preview",
    "gemini-2.5-flash-preview",
    "gemini-exp-1206",
    "gemini-2.0-flash-thinking-exp-1219",
    "gemini-2.0-flash-thinking-exp",
  ];

  const working = [];
  const failed = [];

  for (const model of models) {
    process.stdout.write(`Testing ${model}... `);
    try {
      const result = await generate({
        model,
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 5
      });
      console.log("✓ WORKS -", result.text.slice(0, 30));
      working.push(model);
    } catch (err) {
      console.log("✗ FAILED");
      failed.push(model);
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log("\nWorking models:");
  working.forEach(m => console.log("  ✓", m));
  console.log("\nFailed models:");
  failed.forEach(m => console.log("  ✗", m));
}

testModels();
