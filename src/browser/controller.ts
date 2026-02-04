/**
 * Browser Controller
 * CDP-based browser automation for Wispy
 */

import { chromium, Browser, Page, BrowserContext } from "playwright-core";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { createLogger } from "../infra/logger.js";

const log = createLogger("browser");

export interface BrowserStatus {
  connected: boolean;
  url?: string;
  title?: string;
  tabCount?: number;
}

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
}

export interface SnapshotResult {
  url: string;
  title: string;
  content: string;
  imagePath?: string;
}

export interface NavigateResult {
  url: string;
  title: string;
  success: boolean;
}

export interface ClickResult {
  success: boolean;
  message?: string;
}

export interface TypeResult {
  success: boolean;
  message?: string;
}

export class BrowserController {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private runtimeDir: string;
  private screenshotDir: string;
  private connected: boolean = false;

  constructor(runtimeDir: string) {
    this.runtimeDir = runtimeDir;
    this.screenshotDir = resolve(runtimeDir, "screenshots");

    if (!existsSync(this.screenshotDir)) {
      mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  /**
   * Connect to an existing browser via CDP or launch a new one
   */
  async connect(cdpUrl?: string): Promise<boolean> {
    try {
      if (cdpUrl) {
        // Connect to existing browser via CDP
        log.info("Connecting to browser via CDP: %s", cdpUrl);
        this.browser = await chromium.connectOverCDP(cdpUrl);
      } else {
        // Launch a new browser
        log.info("Launching new browser instance");
        this.browser = await chromium.launch({
          headless: false, // Show browser for user interaction
          args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
          ],
        });
      }

      // Get or create context
      const contexts = this.browser.contexts();
      this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext();

      // Get or create page
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

      this.connected = true;
      log.info("Browser connected successfully");
      return true;
    } catch (err) {
      log.error({ err }, "Failed to connect to browser");
      this.connected = false;
      return false;
    }
  }

  /**
   * Disconnect from browser
   */
  async disconnect(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.connected = false;
      log.info("Browser disconnected");
    }
  }

  /**
   * Get browser status
   */
  async getStatus(): Promise<BrowserStatus> {
    if (!this.connected || !this.page) {
      return { connected: false };
    }

    try {
      const url = this.page.url();
      const title = await this.page.title();
      const tabCount = this.context?.pages().length || 0;

      return {
        connected: true,
        url,
        title,
        tabCount,
      };
    } catch (err) {
      log.warn({ err }, "Failed to get browser status");
      return { connected: false };
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(url: string): Promise<NavigateResult> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      log.info("Navigating to: %s", url);
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const title = await this.page.title();

      return {
        url: this.page.url(),
        title,
        success: true,
      };
    } catch (err: any) {
      // If page/browser closed, try to reconnect
      if (err.message?.includes("closed") || err.message?.includes("Target")) {
        log.warn("Browser connection lost during navigation, attempting to reconnect...");
        this.connected = false;
        const reconnected = await this.connect();
        if (reconnected) {
          log.info("Browser reconnected, retrying navigation...");
          return this.navigate(url);
        }
      }
      log.error({ err }, "Navigation failed");
      return {
        url,
        title: "",
        success: false,
      };
    }
  }

  /**
   * Click on an element
   */
  async click(selector: string): Promise<ClickResult> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      log.info("Clicking: %s", selector);
      await this.page.click(selector, { timeout: 10000 });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err }, "Click failed");
      return { success: false, message: msg };
    }
  }

  /**
   * Type text into an element
   */
  async type(selector: string, text: string): Promise<TypeResult> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      log.info("Typing into: %s", selector);
      await this.page.fill(selector, text, { timeout: 10000 });
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err }, "Type failed");
      return { success: false, message: msg };
    }
  }

  /**
   * Press a key
   */
  async pressKey(key: string): Promise<boolean> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      log.info("Pressing key: %s", key);
      await this.page.keyboard.press(key);
      return true;
    } catch (err) {
      log.error({ err }, "Key press failed");
      return false;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(fullPage: boolean = false): Promise<string | null> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      const filename = `screenshot-${Date.now()}.png`;
      const filepath = resolve(this.screenshotDir, filename);

      // Use shorter timeout and skip waiting for animations/fonts
      await this.page.screenshot({
        path: filepath,
        fullPage,
        timeout: 10000, // Reduced from 30s to 10s
        animations: "disabled", // Skip CSS animations
      });

      log.info("Screenshot saved: %s", filepath);
      return filepath;
    } catch (err: any) {
      // If page/browser closed, try to reconnect
      if (err.message?.includes("closed") || err.message?.includes("Target")) {
        log.warn("Browser connection lost, attempting to reconnect...");
        this.connected = false;
        const reconnected = await this.connect();
        if (reconnected) {
          log.info("Browser reconnected, retrying screenshot...");
          return this.screenshot(fullPage);
        }
      }

      // On timeout, return null instead of throwing - caller can proceed without screenshot
      if (err.message?.includes("Timeout")) {
        log.warn("Screenshot timed out, continuing without image");
        return null;
      }

      log.error({ err }, "Screenshot failed");
      throw err;
    }
  }

  /**
   * Get page content as text (for AI analysis)
   */
  async getPageContent(): Promise<string> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      // Get visible text content
      const content = await this.page.evaluate(() => {
        // Remove script and style elements
        const clone = document.body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script, style, noscript, iframe").forEach((el) => el.remove());

        // Get text content
        return clone.innerText || clone.textContent || "";
      });

      return content.trim();
    } catch (err) {
      log.error({ err }, "Failed to get page content");
      throw err;
    }
  }

  /**
   * Get page snapshot (text + screenshot)
   * Screenshot is optional - if it fails/times out, we still return content
   */
  async snapshot(): Promise<SnapshotResult> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    const url = this.page.url();
    const title = await this.page.title();
    const content = await this.getPageContent();

    // Screenshot is optional - don't block on it
    let imagePath: string | undefined;
    try {
      const result = await this.screenshot();
      imagePath = result || undefined;
    } catch {
      log.warn("Snapshot continuing without screenshot");
    }

    return {
      url,
      title,
      content: content.slice(0, 50000), // Limit content length
      imagePath,
    };
  }

  /**
   * List all open tabs
   */
  async listTabs(): Promise<BrowserTab[]> {
    if (!this.context) {
      return [];
    }

    const pages = this.context.pages();
    const tabs: BrowserTab[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      try {
        tabs.push({
          id: String(i),
          url: page.url(),
          title: await page.title(),
        });
      } catch {
        // Skip pages that error
      }
    }

    return tabs;
  }

  /**
   * Switch to a tab by index
   */
  async switchTab(index: number): Promise<boolean> {
    if (!this.context) {
      return false;
    }

    const pages = this.context.pages();
    if (index >= 0 && index < pages.length) {
      this.page = pages[index];
      await this.page.bringToFront();
      return true;
    }
    return false;
  }

  /**
   * Open a new tab
   */
  async newTab(url?: string): Promise<boolean> {
    if (!this.context) {
      return false;
    }

    try {
      this.page = await this.context.newPage();
      if (url) {
        await this.page.goto(url, { waitUntil: "domcontentloaded" });
      }
      return true;
    } catch (err) {
      log.error({ err }, "Failed to open new tab");
      return false;
    }
  }

  /**
   * Close current tab
   */
  async closeTab(): Promise<boolean> {
    if (!this.page || !this.context) {
      return false;
    }

    try {
      await this.page.close();
      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : null;
      return true;
    } catch (err) {
      log.error({ err }, "Failed to close tab");
      return false;
    }
  }

  /**
   * Execute JavaScript in the page
   */
  async evaluate<T>(script: string): Promise<T> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    try {
      return await this.page.evaluate(script) as T;
    } catch (err) {
      log.error({ err }, "Evaluate failed");
      throw err;
    }
  }

  /**
   * Wait for an element to appear
   */
  async waitForSelector(selector: string, timeout: number = 30000): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      await this.page.waitForSelector(selector, { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Scroll the page
   */
  async scroll(direction: "up" | "down" | "top" | "bottom"): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not connected");
    }

    const scrollMap = {
      up: "window.scrollBy(0, -500)",
      down: "window.scrollBy(0, 500)",
      top: "window.scrollTo(0, 0)",
      bottom: "window.scrollTo(0, document.body.scrollHeight)",
    };

    await this.page.evaluate(scrollMap[direction]);
  }

  /**
   * Go back in history
   */
  async goBack(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      await this.page.goBack();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Go forward in history
   */
  async goForward(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      await this.page.goForward();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Refresh the page
   */
  async refresh(): Promise<boolean> {
    if (!this.page) {
      return false;
    }

    try {
      await this.page.reload();
      return true;
    } catch {
      return false;
    }
  }
}

// Global browser instance
let globalBrowser: BrowserController | null = null;

/**
 * Get or create the global browser controller
 */
export function getBrowser(runtimeDir: string): BrowserController {
  if (!globalBrowser) {
    globalBrowser = new BrowserController(runtimeDir);
  }
  return globalBrowser;
}
