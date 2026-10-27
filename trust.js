/**
 * 浏览器信任围栏：插件通过 `ctx.webServer` 注册的路由不会自动经过
 * DSH 自己的 /api 校验，所以这里自己做 Host / Origin / Sec-Fetch-Site 检查。
 *
 * 这是“请求像不像来自本机页面”的判断，不是身份认证。
 *
 * 逻辑改编自 dsh-bili-mini 的 trust.js（MIT，Copyright (c) 2026 tuanzhanghao），
 * 后者又改编自 @tivility/dsh-web-kit 与 DSH 的 isTrustedApiRequest。
 */

function header(req, name) {
  const value = req?.headers?.[name];
  return typeof value === 'string' ? value : undefined;
}

function parseAuthority(authority) {
  if (
    typeof authority !== 'string' ||
    authority.length === 0 ||
    authority.trim() !== authority ||
    /[/?#@\\]/.test(authority)
  ) {
    return null;
  }
  try {
    return new URL(`http://${authority}`);
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return (
    parts.length === 4 &&
    parts[0] === '127' &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

function isTrustedOrigin(value, hostUrl) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.host === hostUrl.host) return true;
  return (
    isLoopbackHostname(url.hostname) &&
    isLoopbackHostname(hostUrl.hostname) &&
    url.port === hostUrl.port
  );
}

function trustedHostUrl(req) {
  const host = header(req, 'host');
  if (host === undefined) return null;
  const hostUrl = parseAuthority(host);
  if (!hostUrl || !isLoopbackHostname(hostUrl.hostname)) return null;
  return hostUrl;
}

export function isTrustedRequest(req) {
  const hostUrl = trustedHostUrl(req);
  if (!hostUrl) return false;

  const site = header(req, 'sec-fetch-site');
  if (site !== undefined && site.toLowerCase() === 'cross-site') return false;

  const origin = header(req, 'origin');
  if (origin !== undefined) return isTrustedOrigin(origin, hostUrl);

  const referer = header(req, 'referer');
  if (referer !== undefined) {
    let url;
    try {
      url = new URL(referer);
    } catch {
      return false;
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return isTrustedOrigin(referer, hostUrl);
    }
  }
  return true;
}

export function isTrustedLoopbackRequest(req) {
  return trustedHostUrl(req) !== null;
}
