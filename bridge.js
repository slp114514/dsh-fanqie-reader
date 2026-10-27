/**
 * BlueStacks hidden bridge controller.
 *
 * Starts the already-provisioned BlueStacks instance on an invisible Windows
 * desktop so the user never sees the player or the free-tier promo windows.
 * The script is deliberately local-only; it does not install BlueStacks,
 * change host permissions, or bypass Fanqie login.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLAYER = 'C:\\Program Files\\BlueStacks_nxt\\HD-Player.exe';
const ADB = 'C:\\Program Files\\BlueStacks_nxt\\HD-Adb.exe';
const SCRIPT = path.join(HERE, 'bridge-hidden.ps1');
const INSTANCE = 'Nougat64';
const ADB_ADDRESS = '127.0.0.1:5555';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseClock(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localParts(schedule) {
  try {
    const format = new Intl.DateTimeFormat('en-US', {
      timeZone: schedule.timezone || 'Asia/Shanghai',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = Object.fromEntries(format.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const weekdayMap = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      day: weekdayMap[parts.weekday] || 1,
      minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute || 0),
    };
  } catch {
    const now = new Date();
    return { day: now.getDay() || 7, minute: now.getHours() * 60 + now.getMinutes() };
  }
}

export function isWithinSchedule(schedule) {
  if (!schedule?.enabled) return false;
  const days = Array.isArray(schedule.days) ? schedule.days : [1, 2, 3, 4, 5, 6, 7];
  if (!days.includes(localParts(schedule).day)) return false;
  const start = parseClock(schedule.start);
  const end = parseClock(schedule.end);
  const now = localParts(schedule).minute;
  if (start === end) return true;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

export function createBridge({ getSchedule }) {
  let child = null;
  let pid = null;
  let running = false;
  let manual = false;
  let lastError = '';
  let timer = null;
  let starting = false;

  function hasPlayer() {
    return fs.existsSync(PLAYER);
  }

  function hasScript() {
    return fs.existsSync(SCRIPT);
  }

  async function adb(args, options = {}) {
    return execFileAsync(ADB, args, {
      windowsHide: true,
      timeout: options.timeout ?? 20_000,
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });
  }

  async function connected() {
    try {
      await adb(['connect', ADB_ADDRESS], { timeout: 8_000 });
      const { stdout } = await adb(['-s', ADB_ADDRESS, 'get-state'], { timeout: 8_000 });
      return stdout.trim() === 'device';
    } catch {
      return false;
    }
  }

  async function start() {
    if (running) return status();
    if (!hasPlayer()) {
      lastError = '没有找到 BlueStacks（HD-Player.exe）。高级互动组件还没安装。';
      return status();
    }
    if (!hasScript()) {
      lastError = '隐藏启动器脚本缺失。';
      return status();
    }
    if (starting) return status();
    starting = true;
    lastError = '';
    try {
      child = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', SCRIPT,
        '-Instance', INSTANCE,
        '-Player', PLAYER,
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

      child.stdout.on('data', (data) => {
        const text = String(data);
        const match = /pid=(\d+)/.exec(text);
        if (match) {
          pid = Number(match[1]);
          running = true;
        }
      });
      child.stderr.on('data', (data) => {
        lastError = String(data).slice(0, 500);
      });
      child.on('exit', () => {
        child = null;
        pid = null;
        running = false;
        starting = false;
      });

      for (let i = 0; i < 30 && !running; i += 1) await sleep(500);
      if (!running) {
        lastError = lastError || 'BlueStacks 没能在隐藏桌面启动。';
        return status();
      }
      // ADB can take a little while after the player starts.
      for (let i = 0; i < 90; i += 1) {
        if (await connected()) break;
        await sleep(1000);
      }
      lastError = '';
      await sleep(8_000);
      try { await launchApp(); } catch { /* app can also be launched later */ }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      starting = false;
    }
    return status();
  }

  async function stop() {
    manual = false;
    if (pid) {
      try {
        await execFileAsync('taskkill.exe', ['/PID', String(Number(pid)), '/T', '/F'], {
          windowsHide: true, timeout: 10_000,
        });
      } catch { /* ignore */ }
    }
    if (child) {
      try { child.kill(); } catch { /* ignore */ }
    }
    child = null;
    pid = null;
    running = false;
    starting = false;
    return status();
  }

  async function status() {
    if (pid) {
      try {
        process.kill(pid, 0);
      } catch {
        running = false;
        pid = null;
      }
    }
    const schedule = getSchedule();
    return {
      installed: hasPlayer() && hasScript(),
      running,
      starting,
      manual,
      pid,
      adb: running ? await connected() : false,
      schedule,
      inWindow: isWithinSchedule(schedule),
      error: lastError,
    };
  }

  async function screenshot() {
    if (!running) throw new Error('隐藏桥还没有运行。');
    const remote = `/data/local/tmp/fanqie-bridge-${Date.now()}.png`;
    const local = path.join(process.env.TEMP || process.env.TMP || '.', `fanqie-bridge-${Date.now()}.png`);
    await adb(['-s', ADB_ADDRESS, 'shell', 'screencap', '-p', remote], { timeout: 30_000 });
    await adb(['-s', ADB_ADDRESS, 'pull', remote, local], { timeout: 30_000 });
    try {
      return fs.readFileSync(local);
    } finally {
      try { fs.unlinkSync(local); } catch { /* ignore */ }
    }
  }

  async function launchApp() {
    if (!running) throw new Error('隐藏桥还没有运行。');
    await adb(['-s', ADB_ADDRESS, 'shell', 'monkey', '-p', 'com.dragon.read', '-c', 'android.intent.category.LAUNCHER', '1'], {
      timeout: 20_000,
    });
  }

  async function tick() {
    if (!hasPlayer()) return;
    const schedule = getSchedule();
    const inWindow = isWithinSchedule(schedule);
    if (schedule?.enabled && inWindow && !running && !starting) {
      await start();
    } else if ((!schedule?.enabled || !inWindow) && running && !manual) {
      await stop();
    }
  }

  function startScheduler() {
    if (timer) return;
    setTimeout(() => { tick().catch(() => {}); }, 5_000);
    timer = setInterval(() => { tick().catch(() => {}); }, 30_000);
  }

  function dispose() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    start,
    stop,
    status,
    screenshot,
    launchApp,
    startScheduler,
    dispose,
    setManual(value) { manual = Boolean(value); },
    isWithinSchedule,
  };
}
