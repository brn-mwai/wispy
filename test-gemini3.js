/**
 * Test Gemini 3 models on Vertex AI
 */

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\Windows\\Downloads\\wispy\\gen-lang-client-0425796557-1844e79149d1.json";

async function testGemini3() {
  console.log("=== TESTING GEMINI 3 MODELS ===\n");

  const { initGemini, generate } = await import("./dist/ai/gemini.js");

  initGemini({
    vertexai: true,
    project: "gen-lang-client-0425796557",
    location: "us-central1"
  });

  // Gemini 3 model candidates
  const models = [
    // Gemini 3 naming patterns
    "gemini-3.0-flash",
    "gemini-3.0-pro",
    "gemini-3-flash",
    "gemini-3-pro",
    "gemini-3.0-flash-preview",
    "gemini-3.0-pro-preview",
    "gemini-3-flash-preview",
    "gemini-3-pro-preview",
    // Experimental
    "gemini-3.0-flash-exp",
    "gemini-3.0-pro-exp",
    "gemini-exp-1206",
    "gemini-exp-1219",
    "gemini-exp-0121",
    "gemini-exp-0206",
    // Latest stable (these worked earlier)
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ];

  const working = [];

  for (const model of models) {
    process.stdout.write(`Testing ${model}... `);
    try {
      const result = await generate({
        model,
        messages: [{ role: "user", content: "Say hello" }],
        maxTokens: 10
      });
      console.log("✓ WORKS");
      working.push(model);
    } catch (err) {
      console.log("✗");
    }
  }

  console.log("\n=== AVAILABLE MODELS ===");
  working.forEach(m => console.log("  ✓", m));

  if (working.length > 0) {
    console.log("\n=== RECOMMENDED FOR MARATHON ===");
    console.log("  Best model:", working[0]);
  }
}

testGemini3();
