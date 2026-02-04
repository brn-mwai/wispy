/**
 * Reminder Service
 * Handles natural language reminders with notification delivery
 */

import { resolve } from "path";
import { readJSON, writeJSON, ensureDir } from "../utils/file.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("reminders");

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface Reminder {
  id: string;
  message: string;
  createdAt: string;
  triggerAt: string;         // ISO timestamp for when to fire
  recurring?: string;        // Cron expression if recurring
  channel: "cli" | "telegram" | "whatsapp";
  peerId: string;            // User ID for delivery
  delivered: boolean;
  deliveredAt?: string;
}

interface ReminderStore {
  reminders: Reminder[];
  preferences: {
    defaultChannel: "cli" | "telegram" | "whatsapp";
    timezone: string;
  };
}

export type NotificationCallback = (reminder: Reminder) => Promise<boolean>;

// ═══════════════════════════════════════════════════════════════════════════
// Reminder Service
// ═══════════════════════════════════════════════════════════════════════════

export class ReminderService {
  private runtimeDir: string;
  private checkInterval?: ReturnType<typeof setInterval>;
  private notificationCallback?: NotificationCallback;
  private isRunning = false;

  constructor(runtimeDir: string) {
    this.runtimeDir = runtimeDir;
  }

  private getStorePath(): string {
    return resolve(this.runtimeDir, "reminders", "store.json");
  }

  private loadStore(): ReminderStore {
    return readJSON<ReminderStore>(this.getStorePath()) || {
      reminders: [],
      preferences: { defaultChannel: "cli", timezone: "UTC" }
    };
  }

  private saveStore(store: ReminderStore): void {
    ensureDir(resolve(this.runtimeDir, "reminders"));
    writeJSON(this.getStorePath(), store);
  }

  /**
   * Set the notification callback for delivering reminders
   */
  setNotificationCallback(callback: NotificationCallback): void {
    this.notificationCallback = callback;
  }

  /**
   * Start the reminder checker (runs every 30 seconds)
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.checkInterval = setInterval(() => this.checkReminders(), 30000);

    // Initial check
    this.checkReminders();

    log.info("Reminder service started");
  }

  /**
   * Stop the reminder service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
    this.isRunning = false;
    log.info("Reminder service stopped");
  }

  /**
   * Add a new reminder
   */
  addReminder(
    message: string,
    when: string | Date,
    options?: {
      channel?: "cli" | "telegram" | "whatsapp";
      peerId?: string;
      recurring?: string;
    }
  ): Reminder {
    const store = this.loadStore();

    const triggerAt = typeof when === "string"
      ? parseNaturalTime(when)
      : when;

    const reminder: Reminder = {
      id: generateId(),
      message,
      createdAt: new Date().toISOString(),
      triggerAt: triggerAt.toISOString(),
      recurring: options?.recurring,
      channel: options?.channel || store.preferences.defaultChannel,
      peerId: options?.peerId || "cli-user",
      delivered: false,
    };

    store.reminders.push(reminder);
    this.saveStore(store);

    log.info("Reminder added: %s at %s", message, reminder.triggerAt);
    return reminder;
  }

  /**
   * List all reminders
   */
  listReminders(includePast = false): Reminder[] {
    const store = this.loadStore();
    const now = new Date();

    if (includePast) {
      return store.reminders;
    }

    return store.reminders.filter(r =>
      !r.delivered || new Date(r.triggerAt) > now
    );
  }

  /**
   * Delete a reminder
   */
  deleteReminder(id: string): boolean {
    const store = this.loadStore();
    const idx = store.reminders.findIndex(r => r.id === id);

    if (idx < 0) return false;

    store.reminders.splice(idx, 1);
    this.saveStore(store);

    log.info("Reminder deleted: %s", id);
    return true;
  }

  /**
   * Set default channel for reminders
   */
  setDefaultChannel(channel: "cli" | "telegram" | "whatsapp"): void {
    const store = this.loadStore();
    store.preferences.defaultChannel = channel;
    this.saveStore(store);
  }

  /**
   * Check and deliver due reminders
   */
  private async checkReminders(): Promise<void> {
    const store = this.loadStore();
    const now = new Date();
    let updated = false;

    for (const reminder of store.reminders) {
      if (reminder.delivered && !reminder.recurring) continue;

      const triggerTime = new Date(reminder.triggerAt);

      if (triggerTime <= now) {
        // Reminder is due
        const delivered = await this.deliverReminder(reminder);

        if (delivered) {
          if (reminder.recurring) {
            // Calculate next occurrence
            reminder.triggerAt = calculateNextOccurrence(
              reminder.recurring,
              triggerTime
            ).toISOString();
          } else {
            reminder.delivered = true;
            reminder.deliveredAt = new Date().toISOString();
          }
          updated = true;
        }
      }
    }

    if (updated) {
      this.saveStore(store);
    }
  }

  /**
   * Deliver a reminder notification
   */
  private async deliverReminder(reminder: Reminder): Promise<boolean> {
    if (!this.notificationCallback) {
      log.warn("No notification callback set, reminder not delivered: %s", reminder.id);
      return false;
    }

    try {
      const success = await this.notificationCallback(reminder);
      if (success) {
        log.info("Reminder delivered: %s", reminder.message);
      }
      return success;
    } catch (err) {
      log.error({ err }, "Failed to deliver reminder: %s", reminder.id);
      return false;
    }
  }

  /**
   * Get upcoming reminders (next 24 hours)
   */
  getUpcoming(): Reminder[] {
    const store = this.loadStore();
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return store.reminders
      .filter(r => !r.delivered)
      .filter(r => {
        const trigger = new Date(r.triggerAt);
        return trigger >= now && trigger <= tomorrow;
      })
      .sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime());
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Natural Language Time Parser
// ═══════════════════════════════════════════════════════════════════════════

export function parseNaturalTime(input: string): Date {
  const now = new Date();
  const lower = input.toLowerCase().trim();

  // "in X minutes/hours/days"
  const inMatch = lower.match(/in\s+(\d+)\s+(minute|hour|day|week|month)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const result = new Date(now);

    switch (unit) {
      case "minute":
        result.setMinutes(result.getMinutes() + amount);
        break;
      case "hour":
        result.setHours(result.getHours() + amount);
        break;
      case "day":
        result.setDate(result.getDate() + amount);
        break;
      case "week":
        result.setDate(result.getDate() + amount * 7);
        break;
      case "month":
        result.setMonth(result.getMonth() + amount);
        break;
    }
    return result;
  }

  // "at X:XX" or "at Xam/pm"
  const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (atMatch) {
    let hours = parseInt(atMatch[1]);
    const minutes = atMatch[2] ? parseInt(atMatch[2]) : 0;
    const meridiem = atMatch[3];

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    const result = new Date(now);
    result.setHours(hours, minutes, 0, 0);

    // If the time has passed today, schedule for tomorrow
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // "tomorrow at X"
  const tomorrowMatch = lower.match(/tomorrow(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/);
  if (tomorrowMatch) {
    let hours = tomorrowMatch[1] ? parseInt(tomorrowMatch[1]) : 9; // Default 9am
    const minutes = tomorrowMatch[2] ? parseInt(tomorrowMatch[2]) : 0;
    const meridiem = tomorrowMatch[3];

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    const result = new Date(now);
    result.setDate(result.getDate() + 1);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  // "next monday/tuesday/etc at X"
  const nextDayMatch = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?/);
  if (nextDayMatch) {
    const days: Record<string, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const targetDay = days[nextDayMatch[1]];
    let hours = nextDayMatch[2] ? parseInt(nextDayMatch[2]) : 9;
    const minutes = nextDayMatch[3] ? parseInt(nextDayMatch[3]) : 0;
    const meridiem = nextDayMatch[4];

    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;

    const result = new Date(now);
    const currentDay = result.getDay();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) daysToAdd += 7;

    result.setDate(result.getDate() + daysToAdd);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  // "tonight" / "this evening"
  if (lower.includes("tonight") || lower.includes("this evening")) {
    const result = new Date(now);
    result.setHours(20, 0, 0, 0); // 8 PM
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // "this afternoon"
  if (lower.includes("this afternoon")) {
    const result = new Date(now);
    result.setHours(14, 0, 0, 0); // 2 PM
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // "this morning"
  if (lower.includes("this morning")) {
    const result = new Date(now);
    result.setHours(9, 0, 0, 0); // 9 AM
    if (result <= now) {
      result.setDate(result.getDate() + 1);
    }
    return result;
  }

  // Try parsing as ISO date
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Default: 1 hour from now
  const fallback = new Date(now);
  fallback.setHours(fallback.getHours() + 1);
  return fallback;
}

/**
 * Calculate next occurrence for recurring reminder
 */
function calculateNextOccurrence(cron: string, lastOccurrence: Date): Date {
  // Simple implementation for common patterns
  const result = new Date(lastOccurrence);

  if (cron.startsWith("*/")) {
    // Every X minutes
    const minutes = parseInt(cron.split("/")[1]);
    result.setMinutes(result.getMinutes() + minutes);
  } else if (cron.includes("* * *")) {
    // Daily
    result.setDate(result.getDate() + 1);
  } else if (cron.includes("* * 1-5")) {
    // Weekdays
    do {
      result.setDate(result.getDate() + 1);
    } while (result.getDay() === 0 || result.getDay() === 6);
  } else {
    // Default: add 1 day
    result.setDate(result.getDate() + 1);
  }

  return result;
}

function generateId(): string {
  return `rem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Format a reminder for display
 */
export function formatReminder(reminder: Reminder): string {
  const trigger = new Date(reminder.triggerAt);
  const now = new Date();
  const diff = trigger.getTime() - now.getTime();

  let timeStr: string;
  if (diff < 0) {
    timeStr = "overdue";
  } else if (diff < 60000) {
    timeStr = "in less than a minute";
  } else if (diff < 3600000) {
    timeStr = `in ${Math.round(diff / 60000)} minutes`;
  } else if (diff < 86400000) {
    timeStr = `in ${Math.round(diff / 3600000)} hours`;
  } else {
    timeStr = trigger.toLocaleString();
  }

  return `⏰ ${reminder.message} (${timeStr})`;
}
