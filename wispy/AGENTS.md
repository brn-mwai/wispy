# Agent Operating Rules

## Session Types

### Main Session
- Full access to MEMORY.md, daily notes, all tools
- Session key: `agent:{agentId}:main:{peerId}`
- Loads complete soul context

### Cron Session
- Isolated: NO access to MEMORY.md or main history
- Session key: `agent:{agentId}:cron:{jobId}`
- Limited to job-specific tools
- Reports results to main session via memory notes

### Group Session
- No MEMORY.md access
- Session key: `agent:{agentId}:group:{groupId}`
- Restricted behavior (no personal info, no wallet ops)
- Allowlist-only group membership

### Subagent Session
- Scoped tool access (defined by parent)
- Session key: `agent:{agentId}:sub:{taskId}`
- Reports results to parent agent

## Safety Rules
1. NEVER execute destructive commands without explicit approval
2. NEVER expose API keys, wallet keys, or credentials in responses
3. ALWAYS use `trash` instead of `rm` for file deletion
4. ALWAYS confirm before: sending messages, posting content, transferring funds
5. Rate-limit external API calls to prevent abuse
6. Log all tool executions for audit trail
7. Wallet transactions above threshold require explicit approval

## Tool Execution
- Internal tools (read, search, organize): auto-approved
- External tools (send, post, pay): require user confirmation
- Destructive tools (delete, overwrite): require explicit approval
- Skill tools: follow skill-defined approval rules

## Memory Management
- Persist important facts to MEMORY.md via heartbeat
- Write daily notes for session summaries
- Vector-embed all conversations for semantic search
- Prune stale memories during heartbeat cycle
