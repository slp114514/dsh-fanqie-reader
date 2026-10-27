/**
 * Turn a local mitmproxy JSONL capture into the device-auth.json format used
 * by fanqie-app.js.
 *
 * A capture must contain at least one comment-add or reply-add request. That
 * request supplies the headers and the write template; list requests supply
 * the list/delete URLs. Nothing is uploaded.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const AUTH_FILE = path.join(HOME, 'fanqie-reader', 'device-auth.json');

function readLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function bodyJson(entry) {
  try {
    const value = JSON.parse(entry.request_body || '');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function pick(entries, needle, requireBody = false) {
  return entries
    .filter((entry) => String(entry.url || '').includes(needle))
    .filter((entry) => !requireBody || bodyJson(entry))
    .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))[0] || null;
}

function headersOf(entry) {
  const headers = {};
  for (const [key, value] of Object.entries(entry?.request_headers || {})) {
    const lower = key.toLowerCase();
    if (['content-length', 'host', 'accept-encoding'].includes(lower)) continue;
    headers[key] = String(value);
  }
  return headers;
}

export function importCapture(file, { write = false } = {}) {
  if (!file || !fs.existsSync(file)) throw new Error('捕获文件不存在。');
  const entries = readLines(file);
  const comment = pick(entries, '/commentapi/comment/add/v1/', true);
  const reply = pick(entries, '/commentapi/reply/add/v1/', true);
  const commentList = pick(entries, '/commentapi/comment/list/');
  const replyList = pick(entries, '/commentapi/reply/list/');
  const del = pick(entries, '/reading/ugc/novel_comment/del/');
  const source = comment || reply;
  if (!source) {
    throw new Error('捕获里没有书评/回复发送请求。请捕获一次发送操作，或继续使用现有的 device-auth.json。');
  }
  const headers = headersOf(source);
  const cookie = headers.cookie || headers.Cookie || '';
  if (!cookie) throw new Error('捕获里没有 Cookie，无法生成会话。');
  const templates = {};
  if (comment) templates.comment = bodyJson(comment);
  if (reply) templates.reply = bodyJson(reply);
  if (commentList) templates.commentList = bodyJson(commentList);
  if (replyList) templates.replyList = bodyJson(replyList);
  if (del) templates.delete = bodyJson(del);
  if (!templates.comment && !templates.reply) throw new Error('捕获里没有可用的写入模板。');
  const bookId = String(
    templates.comment?.group_id
    || templates.reply?.group_id
    || templates.comment?.business_param?.book_id
    || templates.reply?.business_param?.book_id
    || '',
  ).trim();
  const auth = {
    version: 1,
    createdAt: Math.floor(Date.now() / 1000),
    host: new URL(source.url).host,
    account: { userId: '', userName: '' },
    bookId,
    bookTitle: '',
    headers,
    cookie,
    urls: {
      comment: comment?.url || '',
      reply: reply?.url || '',
      commentList: commentList?.url || '',
      replyList: replyList?.url || '',
      delete: del?.url || '',
    },
    templates,
  };
  if (write) {
    const dir = path.dirname(AUTH_FILE);
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(AUTH_FILE)) {
      fs.copyFileSync(AUTH_FILE, `${AUTH_FILE}.bak-${Date.now()}`);
    }
    fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(AUTH_FILE, 0o600); } catch { /* Windows */ }
  }
  return {
    ok: true,
    written: write,
    authFile: AUTH_FILE,
    host: auth.host,
    bookId,
    hasComment: Boolean(templates.comment),
    hasReply: Boolean(templates.reply),
    hasCommentList: Boolean(templates.commentList),
    hasReplyList: Boolean(templates.replyList),
    hasDelete: Boolean(templates.delete),
  };
}
