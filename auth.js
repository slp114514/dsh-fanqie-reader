/**
 * 番茄网页扫码登录。
 *
 * 使用番茄网页自己的 passport 接口：
 *   1. GET  /main/writer/login               预热 cookie
 *   2. GET  /passport/web/get_qrcode/        取二维码（接口直接给 PNG base64）
 *   3. GET  /passport/web/check_qrconnect/   轮询扫码状态
 *
 * 二维码由番茄返回，不经过第三方二维码服务。登录成功后只把 cookie 保存在
 * 本机 $DSH_HOME/fanqie-reader/state.json，不返回给浏览器。
 */

import { randomBytes } from 'node:crypto';

const LOGIN_PAGE = 'https://fanqienovel.com/main/writer/login';
const GET_QRCODE = 'https://fanqienovel.com/passport/web/get_qrcode/';
const CHECK_QR = 'https://fanqienovel.com/passport/web/check_qrconnect/';
const USER_INFO = 'https://fanqienovel.com/api/reader/user/info';
const USER_INFO_FALLBACK = 'https://fanqienovel.com/api/user/info';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0';

const COMMON = {
  passport_jssdk_version: '3.0.16',
  passport_jssdk_type: 'normal',
  aid: '2503',
  language: 'zh',
  account_sdk_source: 'web',
};

const TIMEOUT_MS = 20_000;

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

function mergeSetCookie(jar, setCookies) {
  for (const line of setCookies ?? []) {
    const pair = String(line).split(';')[0];
    const index = pair.indexOf('=');
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) jar.set(key, value);
  }
}

function hasSession(jar) {
  return Boolean(jar.get('sessionid') || jar.get('sessionid_ss') || jar.get('sid_tt'));
}

function queryString(extra = {}) {
  return new URLSearchParams({ ...COMMON, ...extra }).toString();
}

async function request(url, { jar, csrf, redirect = 'manual', extraHeaders = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers = {
      'user-agent': UA,
      accept: 'application/json, text/javascript, text/html, */*',
      'accept-language': 'zh-CN,zh;q=0.9',
      referer: LOGIN_PAGE,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      ...(jar?.size ? { cookie: cookieHeader(jar) } : {}),
      ...(csrf ? { 'x-tt-passport-csrf-token': csrf } : {}),
      ...extraHeaders,
    };
    const response = await fetch(url, {
      headers,
      redirect,
      signal: controller.signal,
    });
    if (jar) mergeSetCookie(jar, response.headers.getSetCookie());
    const text = await response.text();
    return {
      status: response.status,
      location: response.headers.get('location') ?? '',
      text,
    };
  } finally {
    clearTimeout(timer);
  }
}

function resolveLocation(base, location) {
  try {
    return new URL(location, base).toString();
  } catch {
    return '';
  }
}

async function followForSession(url, jar, csrf, depth = 0) {
  if (depth > 5) return false;
  const response = await request(url, { jar, csrf });
  if (hasSession(jar)) return true;
  if (response.status >= 300 && response.status < 400 && response.location) {
    const next = resolveLocation(url, response.location);
    if (next) return followForSession(next, jar, csrf, depth + 1);
  }
  return hasSession(jar);
}

function parseUserInfo(payload) {
  const data = payload?.data ?? payload;
  if (!data || typeof data !== 'object') return null;
  const user =
    data.user_info ??
    data.userInfo ??
    data.user ??
    data.account ??
    data;
  if (!user || typeof user !== 'object') return null;
  const nickname =
    user.nick_name ??
    user.nickname ??
    user.name ??
    user.user_name ??
    user.screen_name ??
    '';
  const avatar =
    user.avatar_url ??
    user.avatar_uri ??
    user.avatarUrl ??
    user.avatar ??
    '';
  const userId =
    user.user_id ??
    user.uid ??
    user.id ??
    user.userId ??
    '';
  return {
    nickname: String(nickname ?? '').slice(0, 80),
    avatar: String(avatar ?? ''),
    userId: String(userId ?? '').slice(0, 80),
  };
}

export async function fetchAccount(cookie) {
  if (!cookie) return null;
  for (const url of [USER_INFO, USER_INFO_FALLBACK]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept: 'application/json,text/plain,*/*',
          referer: 'https://fanqienovel.com/',
          cookie,
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) continue;
      const payload = await response.json().catch(() => null);
      if (payload && (payload.code === 0 || payload.data)) {
        const account = parseUserInfo(payload);
        if (account) return account;
      }
    } catch {
      // 账号信息只是展示；登录 Cookie 本身已经可用于阅读。
    }
  }
  return null;
}

/**
 * 创建一次扫码会话。
 * @returns {Promise<{token: string, image: string, expiresAt: number, hint: string}>}
 */
export async function startLogin() {
  const jar = new Map();
  await request(LOGIN_PAGE, { jar });
  const csrf = jar.get('passport_csrf_token') ?? '';
  const url = `${GET_QRCODE}?${queryString({
    need_logo: 'true',
    next: LOGIN_PAGE,
  })}`;
  const response = await request(url, { jar, csrf });
  const refreshedCsrf = jar.get('passport_csrf_token') ?? csrf;
  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new Error('番茄二维码接口返回的不是 JSON');
  }
  const data = payload?.data;
  if (!data?.qrcode || !data?.token) {
    throw new Error(payload?.message ? `番茄登录失败：${payload.message}` : '番茄没有返回二维码');
  }
  const expiresAt = Number(data.expire_time ?? 0) > 0
    ? Number(data.expire_time) * 1000
    : Date.now() + 5 * 60_000;
  const hint = data.copywriting
    ? '请使用已登录番茄/抖音账号的手机 App 扫码，并在手机上确认'
    : '请使用番茄 App 或抖音 App 扫码，并在手机上确认';
  return {
    token: data.token,
    image: `data:image/png;base64,${data.qrcode}`,
    expiresAt,
    hint,
    // Internal fields carried by the caller, not the HTTP response.
    jar,
    csrf: refreshedCsrf,
  };
}

/**
 * 轮询一次扫码状态。成功时返回 cookie 与账号信息。
 * @param {{jar: Map<string,string>, csrf: string, token: string, expiresAt: number}} session
 */
export async function pollLogin(session) {
  if (!session || Date.now() > session.expiresAt) {
    return { status: 'expired' };
  }
  const url = `${CHECK_QR}?${queryString({
    token: session.token,
    next: '/',
  })}`;
  const response = await request(url, {
    jar: session.jar,
    csrf: session.csrf,
  });

  if (hasSession(session.jar)) {
    return finish(session.jar);
  }

  let payload = null;
  if (response.text) {
    try {
      payload = JSON.parse(response.text);
    } catch {
      payload = null;
    }
  }
  const data = payload?.data ?? {};
  const status = String(data.status ?? '');

  if (status === 'success' || status === 'confirmed') {
    const redirectUrl = String(data.redirect_url ?? '');
    if (redirectUrl) {
      const ok = await followForSession(resolveLocation(CHECK_QR, redirectUrl), session.jar, session.csrf);
      if (ok) return finish(session.jar);
    }
    if (hasSession(session.jar)) return finish(session.jar);
    return { status: 'confirmed' };
  }
  if (status === 'expired') return { status: 'expired' };
  if (status === 'scanned' || status === 'confirming' || status === 'confirm') {
    return { status: 'scanned' };
  }
  if (response.status >= 300 && response.status < 400 && response.location) {
    const next = resolveLocation(url, response.location);
    if (next) {
      await request(next, { jar: session.jar, csrf: session.csrf });
      if (hasSession(session.jar)) return finish(session.jar);
    }
  }
  return { status: 'waiting' };
}

async function finish(jar) {
  const cookie = cookieHeader(jar);
  const account = await fetchAccount(cookie);
  return {
    status: 'success',
    cookie,
    account: account ?? { nickname: '', avatar: '', userId: '' },
  };
}

export function makeLoginSession(result) {
  return {
    id: randomBytes(16).toString('hex'),
    token: result.token,
    jar: result.jar,
    csrf: result.csrf,
    expiresAt: result.expiresAt,
    image: result.image,
    hint: result.hint,
  };
}

export function publicLoginSession(session) {
  return {
    loginToken: session.id,
    image: session.image,
    expiresAt: session.expiresAt,
    hint: session.hint,
  };
}
