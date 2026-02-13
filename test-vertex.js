/**
 * Test Vertex AI / Gemini 3 connection
 */

// Set credentials path BEFORE importing
process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\Windows\\Downloads\\wispy\\gen-lang-client-0425796557-1844e79149d1.json";

async function testVertexAI() {
  console.log("=== VERTEX AI / GEMINI 3 TEST ===\n");

  console.log("1. Setting up credentials...");
  console.log("   GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);

  try {
    console.log("\n2. Importing Gemini module...");
    const { initGemini, generate, listModels } = await import("./dist/ai/gemini.js");

    console.log("\n3. Initializing Vertex AI client...");
    initGemini({
      vertexai: true,
      project: "gen-lang-client-0425796557",
      location: "us-central1"
    });
    console.log("   ✓ Client initialized");

    console.log("\n4. Testing simple generation with Gemini 2.0 Flash...");
    const result = await generate({
      model: "gemini-2.0-flash",
      messages: [{ role: "user", content: "Say 'Hello from Vertex AI!' and nothing else." }],
      maxTokens: 50
    });
    console.log("   Response:", result.text);
    console.log("   ✓ Generation works!");

    console.log("\n5. Testing Gemini 2.5 Flash (latest)...");
    try {
      const result25 = await generate({
        model: "gemini-2.5-flash-preview-05-20",
        messages: [{ role: "user", content: "What is 2+2? Answer with just the number." }],
        maxTokens: 10
      });
      console.log("   Response:", result25.text);
      console.log("   ✓ Gemini 2.5 Flash works!");
    } catch (err) {
      console.log("   ✗ Gemini 2.5 Flash failed:", err.message);
    }

    console.log("\n6. Testing with thinking (for Marathon mode)...");
    try {
      const thinkingResult = await generate({
        model: "gemini-2.5-flash-preview-05-20",
        messages: [{ role: "user", content: "Think step by step: What is the square root of 144?" }],
        thinkingLevel: "low",
        maxTokens: 200
      });
      console.log("   Response:", thinkingResult.text.slice(0, 100) + "...");
      if (thinkingResult.thinking) {
        console.log("   Thinking:", thinkingResult.thinking.slice(0, 100) + "...");
      }
      console.log("   ✓ Thinking mode works!");
    } catch (err) {
      console.log("   ✗ Thinking mode failed:", err.message);
    }

    console.log("\n=== TEST COMPLETE ===");
    console.log("Vertex AI is working! You can use Gemini 3 models for Marathon mode.");

  } catch (err) {
    console.error("\n✗ FAILED:", err.message);
    console.error("\nFull error:", err);
    process.exit(1);
  }
}

testVertexAI();
