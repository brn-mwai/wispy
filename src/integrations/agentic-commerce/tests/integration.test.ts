import { describe, it, expect } from "vitest";
import AgenticCommerceIntegration from "../index.js";

// Mock context for Integration constructor
const mockCtx = {
  config: {} as never,
  runtimeDir: "/tmp",
  soulDir: "/tmp",
  credentialManager: {
    has: () => false,
    get: async () => null,
  } as never,
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  } as never,
};

describe("AgenticCommerceIntegration", () => {
  it("should have correct manifest ID", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    expect(integration.manifest.id).toBe("agentic-commerce");
  });

  it("should have correct category", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    expect(integration.manifest.category).toBe("tools");
  });

  it("should declare all required tools", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    const toolNames = integration.manifest.tools.map((t) => t.name);

    // x402 tools
    expect(toolNames).toContain("x402_pay_and_fetch");
    expect(toolNames).toContain("x402_check_budget");
    expect(toolNames).toContain("x402_audit_trail");

    // AP2 tools
    expect(toolNames).toContain("ap2_purchase");
    expect(toolNames).toContain("ap2_get_receipts");

    // DeFi tools
    expect(toolNames).toContain("defi_research");
    expect(toolNames).toContain("defi_swap");
    expect(toolNames).toContain("defi_trade_log");

    // BITE tools
    expect(toolNames).toContain("bite_encrypt_payment");
    expect(toolNames).toContain("bite_check_and_execute");
    expect(toolNames).toContain("bite_lifecycle_report");
  });

  it("should have 11 tools total", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    expect(integration.manifest.tools).toHaveLength(11);
  });

  it("should require AGENT_PRIVATE_KEY", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    expect(integration.manifest.requires?.env).toContain("AGENT_PRIVATE_KEY");
  });

  it("should return error when not initialized", async () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    const result = await integration.executeTool("x402_check_budget", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not initialized");
  });

  it("should return error for unknown tool", async () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    const result = await integration.executeTool("nonexistent_tool", {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown tool");
  });

  it("should have tool descriptions with no empty strings", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    for (const tool of integration.manifest.tools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it("should have proper parameter schemas", () => {
    const integration = new AgenticCommerceIntegration(mockCtx);
    for (const tool of integration.manifest.tools) {
      expect(tool.parameters.type).toBe("object");
      expect(tool.parameters.properties).toBeDefined();
    }
  });
});
