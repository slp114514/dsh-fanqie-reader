/**
 * Optional App-session capture.
 *
 * Stable App-API posting needs the user's own app session headers. This module
 * runs mitmproxy locally and points the already-running BlueStacks instance at
 * it. It captures only Fanqie/ByteDance hosts into a local JSONL file.
 *
 * This is intentionally a separate, explicit advanced step: it requires a
 * rooted BlueStacks instance and the local mitmproxy CA installed as a system
 * certificate. Nothing is uploaded.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ADB, ADB_ADDRESS } from './bridge.js';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.DSH_HOME || path.join(process.env.USERPROFILE || '.', '.dsh');
const CAPTURE_FILE = path.join(HOME, 'fanqie-reader', 'capture.jsonl');
const AUTH_FILE = path.join(HOME, 'fanqie-reader', 'device-auth.json');
const ADDON = path.join(HERE, 'capture-fanqie.py');
const PORT = 8088;

let child = null;
let active = false;
let lastError = '';

async function run(file, args, timeout = 15_000) {
  try {
    const result = await execFileAsync(file, args, {
      windowsHide: true,
      timeout,
      maxBuffer: 2 * 1024 * 1024,
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

async function adb(args, timeout = 15_000) {
  return run(ADB, ['-s', ADB_ADDRESS, ...args], timeout);
}

async function rootReady() {
  const result = await adb(['shell', 'su', '-c', 'id'], 8_000);
  return result.ok && /\buid=0\(root\)/.test(result.stdout);
}

async function caReady() {
  const result = await adb(['shell', 'su', '-c', 'ls /system/etc/security/cacerts/c8750f0d.0'], 8_000);
  return result.ok && result.stdout.includes('c8750f0d.0');
}

function authReady() {
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return Boolean(raw?.headers && raw?.cookie && raw?.urls && raw?.templates);
  } catch {
    return false;
  }
}

export function createCapture({ bridge }) {
  async function status() {
    const bridgeStatus = await bridge.status();
    return {
      active,
      root: bridgeStatus.running ? await rootReady() : false,
      ca: bridgeStatus.running ? await caReady() : false,
      mitm: (await run('mitmdump', ['--version'], 8_000)).ok,
      bridgeRunning: bridgeStatus.running,
      authReady: authReady(),
      captureBytes: (() => {
        try { return fs.statSync(CAPTURE_FILE).size; } catch { return 0; }
      })(),
      captureFile: CAPTURE_FILE,
      error: lastError,
    };
  }

  async function start() {
    if (active) return status();
    lastError = '';
    const bridgeStatus = await bridge.status();
    if (!bridgeStatus.running) {
      lastError = '请先启动隐藏桥/BlueStacks。';
      return status();
    }
    if (!(await rootReady())) {
      lastError = '高级捕获需要 BlueStacks root；当前没有 root。';
      return status();
    }
    if (!(await caReady())) {
      lastError = '没有找到 mitmproxy 系统证书；请先安装高级捕获证书。';
      return status();
    }
    try {
      fs.mkdirSync(path.dirname(CAPTURE_FILE), { recursive: true });
      child = spawn('mitmdump', [
        '--listen-port', String(PORT),
        '--set', 'block_global=false',
        '-s', ADDON,
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FANQIE_CAPTURE_OUT: CAPTURE_FILE },
      });
      child.stdout.on('data', () => {});
      child.stderr.on('data', (data) => { lastError = String(data).slice(0, 500); });
      child.on('exit', () => { child = null; active = false; });
      active = true;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await adb(['reverse', `tcp:${PORT}`, `tcp:${PORT}`], 10_000);
      await adb(['shell', 'settings', 'put', 'global', 'http_proxy', `127.0.0.1:${PORT}`], 10_000);
      await adb(['shell', 'monkey', '-p', 'com.dragon.read', '-c', 'android.intent.category.LAUNCHER', '1'], 15_000);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      active = false;
    }
    return status();
  }

  async function stop() {
    try {
      await adb(['shell', 'settings', 'put', 'global', 'http_proxy', ':0'], 10_000);
      await adb(['reverse', '--remove', `tcp:${PORT}`], 10_000);
    } catch { /* ignore */ }
    if (child) {
      try { child.kill(); } catch { /* ignore */ }
    }
    child = null;
    active = false;
    return status();
  }

  return { status, start, stop };
}
