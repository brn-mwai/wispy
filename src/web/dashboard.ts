/**
 * Web Dashboard for Marathon Monitoring
 * Serves a real-time dashboard for monitoring autonomous marathon execution
 */

import express, { Router } from "express";
import type { MarathonService } from "../marathon/service.js";
import type { MarathonState } from "../marathon/types.js";
import { createLogger } from "../infra/logger.js";

const log = createLogger("dashboard");

export function createDashboardRouter(marathonService: MarathonService): Router {
  const router = Router();

  // Serve the dashboard HTML
  router.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(getDashboardHTML());
  });

  // API: Get all marathons
  router.get("/api/marathons", (_req, res) => {
    const marathons = marathonService.listMarathons();
    res.json({ marathons });
  });

  // API: Get marathon by ID
  router.get("/api/marathons/:id", (req, res) => {
    const state = marathonService.getStatus(req.params.id);
    if (!state) {
      res.status(404).json({ error: "Marathon not found" });
      return;
    }
    res.json(state);
  });

  // API: Pause marathon
  router.post("/api/marathons/pause", (_req, res) => {
    marathonService.pause();
    res.json({ ok: true, message: "Marathon paused" });
  });

  // API: Abort marathon
  router.post("/api/marathons/abort", (_req, res) => {
    marathonService.abort();
    res.json({ ok: true, message: "Marathon aborted" });
  });

  // API: Get active marathon status
  router.get("/api/status", (_req, res) => {
    const state = marathonService.getStatus();
    if (!state) {
      res.json({ active: false });
      return;
    }
    res.json({
      active: true,
      marathon: formatMarathonForDashboard(state),
    });
  });

  return router;
}

function formatMarathonForDashboard(state: MarathonState) {
  const completedMilestones = state.plan.milestones.filter(m => m.status === "completed").length;
  const totalMilestones = state.plan.milestones.length;
  const progress = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  return {
    id: state.id,
    goal: state.plan.goal,
    status: state.status,
    progress,
    completedMilestones,
    totalMilestones,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    pausedAt: state.pausedAt,
    totalTokensUsed: state.totalTokensUsed,
    totalCost: state.totalCost,
    milestones: state.plan.milestones.map(m => ({
      id: m.id,
      title: m.title,
      status: m.status,
      estimatedMinutes: m.estimatedMinutes,
    })),
    recentLogs: state.logs.slice(-10),
    artifacts: state.artifacts,
  };
}

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wispy Dashboard - Marathon Monitor</title>
  <style>
    :root {
      --bg-primary: #0f0f0f;
      --bg-secondary: #1a1a1a;
      --bg-tertiary: #252525;
      --accent: #7c3aed;
      --accent-glow: rgba(124, 58, 237, 0.3);
      --success: #22c55e;
      --warning: #eab308;
      --error: #ef4444;
      --text-primary: #ffffff;
      --text-secondary: #a0a0a0;
      --border: #333;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--border);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .logo-icon {
      font-size: 2rem;
    }

    .logo-text {
      font-size: 1.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent) 0%, #a855f7 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .status-badge {
      padding: 0.5rem 1rem;
      border-radius: 999px;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-executing { background: var(--warning); color: #000; }
    .status-completed { background: var(--success); color: #000; }
    .status-failed { background: var(--error); color: #fff; }
    .status-paused { background: var(--bg-tertiary); color: var(--text-secondary); }
    .status-planning { background: var(--accent); color: #fff; }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--bg-secondary);
      border-radius: 16px;
      padding: 1.5rem;
      border: 1px solid var(--border);
    }

    .card-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 1rem;
    }

    .goal-text {
      font-size: 1.25rem;
      font-weight: 500;
      line-height: 1.4;
      color: var(--text-primary);
    }

    .progress-container {
      margin: 1.5rem 0;
    }

    .progress-bar {
      height: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent) 0%, #a855f7 100%);
      border-radius: 4px;
      transition: width 0.5s ease;
    }

    .progress-text {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
    }

    .stat {
      text-align: center;
      padding: 1rem;
      background: var(--bg-tertiary);
      border-radius: 12px;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    .milestones-list {
      list-style: none;
      max-height: 300px;
      overflow-y: auto;
    }

    .milestone {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem;
      border-radius: 8px;
      margin-bottom: 0.5rem;
      background: var(--bg-tertiary);
    }

    .milestone-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      flex-shrink: 0;
    }

    .milestone-icon.pending { background: var(--bg-secondary); color: var(--text-secondary); }
    .milestone-icon.in_progress { background: var(--warning); color: #000; }
    .milestone-icon.completed { background: var(--success); color: #000; }
    .milestone-icon.failed { background: var(--error); color: #fff; }

    .milestone-title {
      flex: 1;
      font-size: 0.875rem;
    }

    .milestone-time {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .logs-container {
      grid-column: 1 / -1;
    }

    .logs-list {
      max-height: 200px;
      overflow-y: auto;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.8125rem;
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 1rem;
    }

    .log-entry {
      margin-bottom: 0.5rem;
      display: flex;
      gap: 0.5rem;
    }

    .log-time {
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .log-level {
      font-weight: 600;
      width: 50px;
      flex-shrink: 0;
    }

    .log-level.info { color: #60a5fa; }
    .log-level.warn { color: var(--warning); }
    .log-level.error { color: var(--error); }
    .log-level.success { color: var(--success); }
    .log-level.thinking { color: #c084fc; }

    .controls {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }

    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
    }

    .btn-primary:hover {
      background: #6d28d9;
      box-shadow: 0 0 20px var(--accent-glow);
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--bg-secondary);
    }

    .btn-danger {
      background: var(--error);
      color: #fff;
    }

    .btn-danger:hover {
      background: #dc2626;
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-secondary);
    }

    .empty-state h2 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
      color: var(--text-primary);
    }

    .empty-state p {
      margin-bottom: 1.5rem;
    }

    .empty-state code {
      background: var(--bg-tertiary);
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-family: 'SF Mono', monospace;
    }

    .refresh-indicator {
      font-size: 0.75rem;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }

    .marathon-list {
      list-style: none;
    }

    .marathon-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem;
      background: var(--bg-tertiary);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .marathon-item:hover {
      background: var(--bg-secondary);
      border: 1px solid var(--accent);
    }

    .marathon-item-info {
      flex: 1;
    }

    .marathon-item-goal {
      font-weight: 500;
      margin-bottom: 0.25rem;
    }

    .marathon-item-meta {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.875rem;
    }

    footer a {
      color: var(--accent);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">
        <span class="logo-icon">&#9729;&#65039;</span>
        <span class="logo-text">Wispy Dashboard</span>
      </div>
      <div class="refresh-indicator">
        <span class="pulse"></span>
        Auto-refreshing every 5s
      </div>
    </header>

    <main id="main-content">
      <div class="empty-state">
        <h2>No Active Marathons</h2>
        <p>Start a marathon from the CLI to see it here</p>
        <code>wispy marathon "Build a web scraper"</code>
      </div>
    </main>

    <footer>
      <p>
        Wispy v0.6.1 - Autonomous AI Agent Platform |
        <a href="https://github.com/brn-mwai/wispy" target="_blank">GitHub</a> |
        Built for the Google Gemini 3 Hackathon
      </p>
    </footer>
  </div>

  <script>
    async function fetchStatus() {
      try {
        const response = await fetch('/dashboard/api/status');
        const data = await response.json();
        renderDashboard(data);
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }

    function renderDashboard(data) {
      const main = document.getElementById('main-content');

      if (!data.active) {
        main.innerHTML = \`
          <div class="empty-state">
            <h2>No Active Marathons</h2>
            <p>Start a marathon from the CLI to see it here</p>
            <code>wispy marathon "Build a web scraper"</code>
          </div>
        \`;
        fetchMarathonHistory();
        return;
      }

      const m = data.marathon;
      const statusClass = 'status-' + m.status;

      main.innerHTML = \`
        <div class="grid">
          <div class="card">
            <div class="card-title">Current Goal</div>
            <p class="goal-text">\${escapeHtml(m.goal)}</p>
            <div style="margin-top: 1rem;">
              <span class="status-badge \${statusClass}">\${m.status}</span>
            </div>
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" style="width: \${m.progress}%"></div>
              </div>
              <div class="progress-text">
                <span>\${m.completedMilestones}/\${m.totalMilestones} milestones</span>
                <span>\${m.progress}%</span>
              </div>
            </div>
            <div class="controls">
              <button class="btn btn-secondary" onclick="pauseMarathon()">Pause</button>
              <button class="btn btn-danger" onclick="abortMarathon()">Abort</button>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Statistics</div>
            <div class="stats-grid">
              <div class="stat">
                <div class="stat-value">\${formatNumber(m.totalTokensUsed)}</div>
                <div class="stat-label">Tokens Used</div>
              </div>
              <div class="stat">
                <div class="stat-value">$\${m.totalCost.toFixed(4)}</div>
                <div class="stat-label">Total Cost</div>
              </div>
              <div class="stat">
                <div class="stat-value">\${formatDuration(m.startedAt)}</div>
                <div class="stat-label">Duration</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-title">Milestones</div>
            <ul class="milestones-list">
              \${m.milestones.map(milestone => \`
                <li class="milestone">
                  <span class="milestone-icon \${milestone.status}">\${getMilestoneIcon(milestone.status)}</span>
                  <span class="milestone-title">\${escapeHtml(milestone.title)}</span>
                  <span class="milestone-time">\${milestone.estimatedMinutes}m</span>
                </li>
              \`).join('')}
            </ul>
          </div>

          <div class="card">
            <div class="card-title">Artifacts (\${m.artifacts.length})</div>
            <ul class="milestones-list">
              \${m.artifacts.length > 0 ? m.artifacts.map(a => \`
                <li class="milestone">
                  <span class="milestone-icon completed">&#128196;</span>
                  <span class="milestone-title">\${escapeHtml(a)}</span>
                </li>
              \`).join('') : '<li style="color: var(--text-secondary); padding: 1rem;">No artifacts created yet</li>'}
            </ul>
          </div>

          <div class="card logs-container">
            <div class="card-title">Recent Activity</div>
            <div class="logs-list">
              \${m.recentLogs.length > 0 ? m.recentLogs.map(log => \`
                <div class="log-entry">
                  <span class="log-time">\${formatTime(log.timestamp)}</span>
                  <span class="log-level \${log.level}">\${log.level}</span>
                  <span>\${escapeHtml(log.message)}</span>
                </div>
              \`).join('') : '<div style="color: var(--text-secondary);">No activity yet</div>'}
            </div>
          </div>
        </div>
      \`;
    }

    async function fetchMarathonHistory() {
      try {
        const response = await fetch('/dashboard/api/marathons');
        const data = await response.json();

        if (data.marathons && data.marathons.length > 0) {
          const main = document.getElementById('main-content');
          const existing = main.querySelector('.empty-state');
          if (existing) {
            const historyHtml = \`
              <div class="card" style="margin-top: 2rem;">
                <div class="card-title">Marathon History</div>
                <ul class="marathon-list">
                  \${data.marathons.map(m => \`
                    <li class="marathon-item" onclick="viewMarathon('\${m.id}')">
                      <div class="marathon-item-info">
                        <div class="marathon-item-goal">\${escapeHtml(m.plan?.goal || 'Unknown')}</div>
                        <div class="marathon-item-meta">\${formatDate(m.startedAt)} | \${m.plan?.milestones?.length || 0} milestones</div>
                      </div>
                      <span class="status-badge status-\${m.status}">\${m.status}</span>
                    </li>
                  \`).join('')}
                </ul>
              </div>
            \`;
            existing.insertAdjacentHTML('afterend', historyHtml);
          }
        }
      } catch (error) {
        console.error('Failed to fetch history:', error);
      }
    }

    async function pauseMarathon() {
      if (confirm('Are you sure you want to pause the marathon?')) {
        await fetch('/dashboard/api/marathons/pause', { method: 'POST' });
        fetchStatus();
      }
    }

    async function abortMarathon() {
      if (confirm('Are you sure you want to abort the marathon? This cannot be undone.')) {
        await fetch('/dashboard/api/marathons/abort', { method: 'POST' });
        fetchStatus();
      }
    }

    function viewMarathon(id) {
      window.location.href = '/dashboard?id=' + id;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function formatNumber(num) {
      if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
      if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
      return num.toString();
    }

    function formatDuration(startedAt) {
      const start = new Date(startedAt);
      const now = new Date();
      const diffMs = now - start;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return diffMins + 'm';
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      if (hours < 24) return hours + 'h ' + mins + 'm';
      const days = Math.floor(hours / 24);
      return days + 'd ' + (hours % 24) + 'h';
    }

    function formatTime(timestamp) {
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    function formatDate(timestamp) {
      return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function getMilestoneIcon(status) {
      const icons = {
        pending: '&#9711;',
        in_progress: '&#9881;',
        completed: '&#10003;',
        failed: '&#10007;',
        skipped: '&#8594;'
      };
      return icons[status] || '?';
    }

    // Initial fetch and auto-refresh
    fetchStatus();
    setInterval(fetchStatus, 5000);
  </script>
</body>
</html>`;
}
