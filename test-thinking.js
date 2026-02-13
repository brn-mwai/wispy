/**
 * Test Gemini 2.5 thinking mode for Marathon agent
 */

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\Windows\\Downloads\\wispy\\gen-lang-client-0425796557-1844e79149d1.json";

async function testThinking() {
  console.log("=== TESTING GEMINI 2.5 THINKING MODE ===\n");

  const { initGemini, generate } = await import("./dist/ai/gemini.js");

  initGemini({
    vertexai: true,
    project: "gen-lang-client-0425796557",
    location: "us-central1"
  });

  console.log("1. Testing Gemini 2.5 Flash with thinking...");
  try {
    const result = await generate({
      model: "gemini-2.5-flash",
      messages: [{
        role: "user",
        content: "Think carefully step by step: If I have 3 apples and give away 1, then buy 5 more, how many do I have? Show your reasoning."
      }],
      thinkingLevel: "medium",
      maxTokens: 500
    });
    console.log("\n   Response:", result.text);
    if (result.thinking) {
      console.log("\n   [Thinking]:", result.thinking.slice(0, 200) + "...");
    }
    console.log("\n   ✓ Gemini 2.5 Flash thinking works!");
    console.log("   Tokens used:", result.usage);
  } catch (err) {
    console.log("   ✗ Failed:", err.message);
  }

  console.log("\n\n2. Testing Gemini 2.5 Pro with thinking...");
  try {
    const result = await generate({
      model: "gemini-2.5-pro",
      messages: [{
        role: "user",
        content: "Think carefully: What's the best strategy for a marathon agent that needs to work autonomously for multiple days?"
      }],
      thinkingLevel: "high",
      maxTokens: 1000
    });
    console.log("\n   Response:", result.text.slice(0, 500) + "...");
    if (result.thinking) {
      console.log("\n   [Thinking]:", result.thinking.slice(0, 200) + "...");
    }
    console.log("\n   ✓ Gemini 2.5 Pro thinking works!");
  } catch (err) {
    console.log("   ✗ Failed:", err.message);
  }

  console.log("\n\n3. Testing tool calling with Gemini 2.5 Flash...");
  try {
    const tools = [{
      functionDeclarations: [{
        name: "get_weather",
        description: "Get the weather for a location",
        parameters: {
          type: "object",
          properties: {
            location: { type: "string", description: "City name" }
          },
          required: ["location"]
        }
      }]
    }];

    const result = await generate({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "What's the weather in Tokyo?" }],
      tools,
      maxTokens: 200
    });

    console.log("   Response:", result.text || "(tool call)");
    if (result.toolCalls && result.toolCalls.length > 0) {
      console.log("   Tool calls:", JSON.stringify(result.toolCalls, null, 2));
      console.log("\n   ✓ Tool calling works!");
    } else {
      console.log("   (No tool calls returned)");
    }
  } catch (err) {
    console.log("   ✗ Failed:", err.message);
  }

  console.log("\n=== THINKING MODE TEST COMPLETE ===");
}

testThinking();
