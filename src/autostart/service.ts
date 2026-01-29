/**
 * Auto-start service generator.
 *
 * Generates platform-specific service files to start the Wispy gateway
 * automatically when the computer boots.
 *
 * Supports:
 * - Windows: Task Scheduler XML
 * - macOS: launchd plist
 * - Linux: systemd unit
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { execSync } from "child_process";
import { createLogger } from "../infra/logger.js";

const log = createLogger("autostart");

/**
 * Install auto-start for the current platform.
 */
export function installAutoStart(
  rootDir: string,
  runtimeDir: string,
  soulDir: string
): { platform: string; path: string; instructions: string } {
  const platform = process.platform;

  switch (platform) {
    case "win32":
      return installWindows(rootDir, runtimeDir, soulDir);
    case "darwin":
      return installMacOS(rootDir, runtimeDir, soulDir);
    case "linux":
      return installLinux(rootDir, runtimeDir, soulDir);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Remove auto-start for the current platform.
 */
export function removeAutoStart(): void {
  const platform = process.platform;

  try {
    switch (platform) {
      case "win32":
        execSync('schtasks /Delete /TN "WispyGateway" /F', { stdio: "ignore" });
        break;
      case "darwin":
        execSync("launchctl unload ~/Library/LaunchAgents/cc.wispy.gateway.plist", {
          stdio: "ignore",
        });
        break;
      case "linux":
        execSync("systemctl --user disable wispy-gateway", { stdio: "ignore" });
        break;
    }
    log.info("Auto-start removed");
  } catch {
    log.warn("Failed to remove auto-start");
  }
}

// ─── Windows ────────────────────────────────────────────────

function installWindows(
  rootDir: string,
  runtimeDir: string,
  soulDir: string
): { platform: string; path: string; instructions: string } {
  const nodeExe = process.execPath;
  const entryPoint = resolve(rootDir, "src", "cli", "program.ts");

  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Wispy AI Agent Gateway</Description>
    <Author>Wispy</Author>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions>
    <Exec>
      <Command>npx</Command>
      <Arguments>tsx "${entryPoint}" gateway</Arguments>
      <WorkingDirectory>${rootDir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>`;

  const xmlPath = resolve(runtimeDir, "wispy-gateway.xml");
  writeFileSync(xmlPath, xml, "utf16le");

  try {
    execSync(`schtasks /Create /TN "WispyGateway" /XML "${xmlPath}" /F`, {
      stdio: "ignore",
    });
    log.info("Windows Task Scheduler entry created");
  } catch {
    log.warn("Failed to create scheduled task. Run as administrator.");
  }

  return {
    platform: "windows",
    path: xmlPath,
    instructions: 'Task "WispyGateway" created in Task Scheduler. It will start on login.',
  };
}

// ─── macOS ──────────────────────────────────────────────────

function installMacOS(
  rootDir: string,
  runtimeDir: string,
  soulDir: string
): { platform: string; path: string; instructions: string } {
  const entryPoint = resolve(rootDir, "src", "cli", "program.ts");

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>cc.wispy.gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>npx</string>
    <string>tsx</string>
    <string>${entryPoint}</string>
    <string>gateway</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${rootDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${runtimeDir}/gateway.log</string>
  <key>StandardErrorPath</key>
  <string>${runtimeDir}/gateway.err</string>
</dict>
</plist>`;

  const plistPath = resolve(
    process.env.HOME || "~",
    "Library",
    "LaunchAgents",
    "cc.wispy.gateway.plist"
  );
  mkdirSync(dirname(plistPath), { recursive: true });
  writeFileSync(plistPath, plist, "utf8");

  try {
    execSync(`launchctl load "${plistPath}"`, { stdio: "ignore" });
    log.info("macOS launchd agent loaded");
  } catch {
    log.warn("Failed to load launchd agent");
  }

  return {
    platform: "macos",
    path: plistPath,
    instructions: "LaunchAgent installed. Gateway starts on login.",
  };
}

// ─── Linux ──────────────────────────────────────────────────

function installLinux(
  rootDir: string,
  runtimeDir: string,
  soulDir: string
): { platform: string; path: string; instructions: string } {
  const entryPoint = resolve(rootDir, "src", "cli", "program.ts");

  const unit = `[Unit]
Description=Wispy AI Agent Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=${rootDir}
ExecStart=npx tsx ${entryPoint} gateway
Restart=on-failure
RestartSec=5
StandardOutput=append:${runtimeDir}/gateway.log
StandardError=append:${runtimeDir}/gateway.err
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;

  const unitDir = resolve(
    process.env.HOME || "~",
    ".config",
    "systemd",
    "user"
  );
  mkdirSync(unitDir, { recursive: true });
  const unitPath = resolve(unitDir, "wispy-gateway.service");
  writeFileSync(unitPath, unit, "utf8");

  try {
    execSync("systemctl --user daemon-reload", { stdio: "ignore" });
    execSync("systemctl --user enable wispy-gateway", { stdio: "ignore" });
    log.info("systemd user service enabled");
  } catch {
    log.warn("Failed to enable systemd service");
  }

  return {
    platform: "linux",
    path: unitPath,
    instructions: "systemd user service installed. Run: systemctl --user start wispy-gateway",
  };
}
