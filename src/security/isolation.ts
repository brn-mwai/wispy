export type SessionType = "main" | "cron" | "group" | "sub" | "heartbeat";

export interface SessionPermissions {
  canAccessMemory: boolean;
  canAccessMainHistory: boolean;
  canUseWallet: boolean;
  canSendExternal: boolean;
  canAccessPersonalInfo: boolean;
}

const PERMISSIONS: Record<SessionType, SessionPermissions> = {
  main: {
    canAccessMemory: true,
    canAccessMainHistory: true,
    canUseWallet: true,
    canSendExternal: true,
    canAccessPersonalInfo: true,
  },
  cron: {
    canAccessMemory: false,
    canAccessMainHistory: false,
    canUseWallet: false,
    canSendExternal: true,
    canAccessPersonalInfo: false,
  },
  group: {
    canAccessMemory: false,
    canAccessMainHistory: false,
    canUseWallet: false,
    canSendExternal: true,
    canAccessPersonalInfo: false,
  },
  sub: {
    canAccessMemory: false,
    canAccessMainHistory: false,
    canUseWallet: false,
    canSendExternal: false,
    canAccessPersonalInfo: false,
  },
  heartbeat: {
    canAccessMemory: true,
    canAccessMainHistory: false,
    canUseWallet: false,
    canSendExternal: false,
    canAccessPersonalInfo: false,
  },
};

export function getPermissions(sessionType: SessionType): SessionPermissions {
  return PERMISSIONS[sessionType];
}

export function buildSessionKey(
  agentId: string,
  sessionType: SessionType,
  peerId: string
): string {
  return `agent:${agentId}:${sessionType}:${peerId}`;
}
