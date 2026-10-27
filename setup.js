/**
 * Guided setup for the optional Windows/BlueStacks component.
 *
 * The wizard intentionally does not install Fanqie silently and does not
 * capture credentials. It installs BlueStacks (one Windows UAC), installs a
 * local Fanqie APK if one is provided, and opens a visible first-run login.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ADB, ADB_ADDRESS, INSTANCE, PLAYER } from './bridge.js';

const execFileAsync = promisify(execFile);
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WINGET_ID = 'BlueStack.BlueStacks';
const APK_PACKAGE = 'com.dragon.read';
const CONFIG = 'C:\\ProgramData\\BlueStacks_nxt\\bluestacks.conf';
const APK_CANDIDATES = [
  process.env.FANQIE_APK,
  path.join(HOME, 'fanqie-reader', 'fanqie.apk'),
  path.resolve('ref', 'fanqie.apk'),
  path.resolve(HERE, '..', 'ref', 'fanqie.apk'),
].filter(Boolean);

let lastLog = '';
let installing = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run(file, args, timeout = 30_000) {
  try {
    const result = await execFileAsync(file, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error?.stdout || ''),
      stderr: String(error?.stderr || error?.message || error),
    };
  }
}

function findApk() {
  for (const candidate of APK_CANDIDATES) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).size > 10_000_000) {
        return candidate;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function detectInstance() {
  try {
    const text = fs.readFileSync(CONFIG, 'utf8');
    const names = [...new Set([...text.matchAll(/bst\.instance\.([A-Za-z0-9_]+)\./g)].map((m) => m[1]))];
    return names.includes(INSTANCE) ? INSTANCE : (names.find((name) => /64/i.test(name)) || names[0] || INSTANCE);
  } catch {
    return INSTANCE;
  }
}

async function adb(args, timeout = 20_000) {
  return run(ADB, ['-s', ADB_ADDRESS, ...args], timeout);
}

export function createSetup({ bridge }) {
  async function status() {
    const apk = findApk();
    const installed = fs.existsSync(PLAYER) && fs.existsSync(ADB);
    let appInstalled = false;
    let adbReady = false;
    if (installed) {
      const state = await run(ADB, ['-s', ADB_ADDRESS, 'get-state'], 5_000);
      adbReady = state.ok && state.stdout.trim() === 'device';
      if (adbReady) {
        const pm = await adb(['shell', 'pm', 'path', APK_PACKAGE], 8_000);
        appInstalled = pm.ok && /package:/.test(pm.stdout);
      }
    }
    return {
      installed,
      adbReady,
      appInstalled,
      apkReady: Boolean(apk),
      apkPath: apk,
      instance: detectInstance(),
      winget: await run('winget', ['--version'], 8_000).then((r) => r.ok),
      installing,
      bridgeRunning: Boolean((await bridge.status()).running),
      log: lastLog,
    };
  }

  async function installBlueStacks() {
    if (installing) return status();
    installing = true;
    lastLog = '正在通过 winget 安装 BlueStacks…';
    try {
      const result = await run('winget', [
        'install',
        '--id', WINGET_ID,
        '--exact',
        '--silent',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--disable-interactivity',
      ], 15 * 60_000);
      lastLog = `${result.stdout}\n${result.stderr}`.slice(-4000);
      if (!result.ok) lastLog = `安装失败：${lastLog}`;
    } finally {
      installing = false;
    }
    return status();
  }

  async function installApk() {
    const apk = findApk();
    if (!apk) return { ...(await status()), error: '没有找到番茄 APK。请把 fanqie.apk 放到 $DSH_HOME/fanqie-reader/ 或 FANQIE_APK。' };
    if (installing) return status();
    installing = true;
    lastLog = '正在安装番茄 APK…';
    try {
      if (!(await status()).adbReady) {
        lastLog = 'ADB 未连接：请先启动 BlueStacks。';
        return { ...(await status()), error: lastLog };
      }
      const result = await adb(['install', '-r', apk], 180_000);
      lastLog = `${result.stdout}\n${result.stderr}`.slice(-4000);
      return { ...(await status()), error: result.ok ? '' : lastLog };
    } finally {
      installing = false;
    }
  }

  async function launchVisible() {
    if (!fs.existsSync(PLAYER)) return { ...(await status()), error: 'BlueStacks 尚未安装。' };
    await bridge.stop();
    lastLog = '正在打开 BlueStacks 可见窗口，请完成首次登录…';
    try {
      const child = spawn(PLAYER, ['--instance', detectInstance()], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      for (let i = 0; i < 120; i += 1) {
        const state = await run(ADB, ['-s', ADB_ADDRESS, 'get-state'], 5_000);
        if (state.ok && state.stdout.trim() === 'device') break;
        await sleep(1000);
      }
      await run(ADB, ['-s', ADB_ADDRESS, 'shell', 'monkey', '-p', APK_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'], 20_000);
      lastLog = 'BlueStacks 已打开。请登录番茄 App，然后回到 DSH 点「登录完成」。';
    } catch (error) {
      lastLog = error instanceof Error ? error.message : String(error);
    }
    return status();
  }

  async function stopVisible() {
    await run('taskkill.exe', ['/IM', 'HD-Player.exe', '/T', '/F'], 20_000);
    lastLog = 'BlueStacks 已关闭。';
    return status();
  }

  async function oneClick() {
    if (installing) return status();
    const apk = findApk();
    if (!apk) {
      return { ...(await status()), error: '没有找到番茄 APK。请把 fanqie.apk 放到 $DSH_HOME/fanqie-reader/ 或 FANQIE_APK。' };
    }
    const before = await status();
    if (!before.installed) {
      await installBlueStacks();
      const afterInstall = await status();
      if (!afterInstall.installed) {
        return { ...afterInstall, error: 'BlueStacks 安装没有完成，请查看日志。' };
      }
    }
    const started = await launchVisible();
    if (started.error) return started;
    // Give the instance time to expose ADB, then install the APK.
    for (let i = 0; i < 90; i += 1) {
      const state = await run(ADB, ['-s', ADB_ADDRESS, 'get-state'], 5_000);
      if (state.ok && state.stdout.trim() === 'device') break;
      await sleep(1000);
    }
    const install = await installApk();
    if (install.error) return install;
    lastLog = '高级组件已装好。请在 BlueStacks 里登录番茄 App，然后回到 DSH。';
    return status();
  }

  return { status, installBlueStacks, installApk, launchVisible, stopVisible, oneClick, findApk };
}
