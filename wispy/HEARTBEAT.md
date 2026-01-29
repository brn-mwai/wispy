# Heartbeat

The heartbeat runs periodically (default: every 30 minutes) to maintain agent state.

## Heartbeat Tasks
1. **Memory Sync**: Review recent conversations, extract key facts, update MEMORY.md
2. **Daily Note**: Append summary to today's daily note
3. **Session Cleanup**: Archive old sessions, prune stale data
4. **Health Check**: Verify channel connections, report issues
5. **Cron Review**: Check pending cron jobs, report results

## Heartbeat State
Stored in `wispy/memory/heartbeat-state.json`:
- Last run timestamp
- Last memory sync point
- Pending follow-ups
- Channel health status
