/**
 * Browser Tools
 * Tools for the agent to control the browser
 */

import { getBrowser, type BrowserController } from "./controller.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("browser-tools");

/**
 * Tool definitions for browser control
 */
export const browserToolDefinitions = [
  {
    name: "browser_navigate",
    description: "Navigate the browser to a URL. Use this to open web pages for research, testing, or automation.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to (e.g., https://example.com)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_click",
    description: "Click on an element in the browser. Use CSS selectors or text content to identify elements.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector or XPath to the element (e.g., 'button.submit', '#login-btn', 'text=Sign In')",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_type",
    description: "Type text into an input field in the browser.",
    parameters: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "CSS selector for the input field (e.g., 'input[name=email]', '#search')",
        },
        text: {
          type: "string",
          description: "The text to type into the field",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a screenshot of the current browser page.",
    parameters: {
      type: "object",
      properties: {
        fullPage: {
          type: "boolean",
          description: "Whether to capture the full scrollable page (default: false)",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_snapshot",
    description: "Get a snapshot of the current page including URL, title, visible text content, and a screenshot. Useful for understanding what's on the page.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser_scroll",
    description: "Scroll the browser page.",
    parameters: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["up", "down", "top", "bottom"],
          description: "Direction to scroll",
        },
      },
      required: ["direction"],
    },
  },
  {
    name: "browser_tabs",
    description: "List all open browser tabs.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser_new_tab",
    description: "Open a new browser tab, optionally with a URL.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Optional URL to open in the new tab",
        },
      },
      required: [],
    },
  },
  {
    name: "browser_close_tab",
    description: "Close the current browser tab.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "browser_press_key",
    description: "Press a keyboard key in the browser (e.g., Enter, Escape, Tab).",
    parameters: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description: "The key to press (e.g., 'Enter', 'Escape', 'Tab', 'ArrowDown')",
        },
      },
      required: ["key"],
    },
  },
];

/**
 * Execute a browser tool
 */
export async function executeBrowserTool(
  runtimeDir: string,
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  const browser = getBrowser(runtimeDir);

  // Check if browser is connected
  const status = await browser.getStatus();
  if (!status.connected) {
    // Try to connect
    const connected = await browser.connect();
    if (!connected) {
      return JSON.stringify({
        error: "Browser not connected. Please ensure Chrome is running with --remote-debugging-port=9222 or configure browser.cdpUrl in your config.",
      });
    }
  }

  try {
    switch (toolName) {
      case "browser_navigate": {
        const result = await browser.navigate(args.url);
        return JSON.stringify(result);
      }

      case "browser_click": {
        const result = await browser.click(args.selector);
        return JSON.stringify(result);
      }

      case "browser_type": {
        const result = await browser.type(args.selector, args.text);
        return JSON.stringify(result);
      }

      case "browser_screenshot": {
        const path = await browser.screenshot(args.fullPage || false);
        return JSON.stringify({ success: true, path });
      }

      case "browser_snapshot": {
        const snapshot = await browser.snapshot();
        // Truncate content for readability
        const truncatedContent = snapshot.content.slice(0, 10000);
        return JSON.stringify({
          url: snapshot.url,
          title: snapshot.title,
          content: truncatedContent + (snapshot.content.length > 10000 ? "\n...[truncated]" : ""),
          screenshotPath: snapshot.imagePath,
        });
      }

      case "browser_scroll": {
        await browser.scroll(args.direction);
        return JSON.stringify({ success: true, direction: args.direction });
      }

      case "browser_tabs": {
        const tabs = await browser.listTabs();
        return JSON.stringify({ tabs });
      }

      case "browser_new_tab": {
        const success = await browser.newTab(args.url);
        return JSON.stringify({ success, url: args.url || "about:blank" });
      }

      case "browser_close_tab": {
        const success = await browser.closeTab();
        return JSON.stringify({ success });
      }

      case "browser_press_key": {
        const success = await browser.pressKey(args.key);
        return JSON.stringify({ success, key: args.key });
      }

      default:
        return JSON.stringify({ error: `Unknown browser tool: ${toolName}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err, toolName, args }, "Browser tool execution failed");
    return JSON.stringify({ error: msg });
  }
}

/**
 * Check if a tool is a browser tool
 */
export function isBrowserTool(toolName: string): boolean {
  return toolName.startsWith("browser_");
}
