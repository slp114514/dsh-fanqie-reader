/**
 * Fanqie App comment bridge.
 *
 * The Fanqie web has no write API. The Android app talks to
 * `api5-normal-sinfonlineb.fqnovel.com` with private anti-bot headers.
 * This module replays the headers captured from the user's own logged-in
 * Android app. It never creates accounts, never bypasses login, and is only
 * used for the account whose session was captured locally.
 *
 * Credentials live in $DSH_HOME/fanqie-reader/device-auth.json (mode 0600),
 * not in the plugin source. Delete that file to disconnect.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FanqieError } from './fanqie.js';

const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const AUTH_FILE = path.join(HOME, 'fanqie-reader', 'device-auth.json');

function readAuth() {
  try {
    const raw = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.host || !raw.headers || !raw.cookie || !raw.templates) return null;
    return raw;
  } catch {
    return null;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeText(value, max = 500) {
  const text = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
  if (!text) throw new FanqieError('评论内容不能为空。', 'empty_text');
  if (text.length > max) throw new FanqieError(`评论内容最多 ${max} 字。`, 'text_too_long');
  return text;
}

function withQuery(url, query) {
  return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}

function makeHeaders(auth, source = auth.headers) {
  const headers = {};
  for (const [key, value] of Object.entries(source)) {
    const lower = key.toLowerCase();
    if (['content-length', 'content-encoding', 'accept-encoding', 'host'].includes(lower)) continue;
    headers[key] = value;
  }
  headers.cookie = auth.cookie;
  headers['content-type'] = 'application/json; charset=utf-8';
  headers.accept = 'application/json; charset=utf-8,application/x-protobuf';
  return headers;
}

async function postJson(auth, url, body, headerSource) {
  const headers = makeHeaders(auth, headerSource);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  if (response.ok && text.trim() === '') return { code: 0, data: {} };
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new FanqieError(`番茄接口返回了非 JSON（HTTP ${response.status}）。`, 'bad_response');
  }
  if (!response.ok) {
    throw new FanqieError(`番茄接口 HTTP ${response.status}：${text.slice(0, 200)}`, 'http_error');
  }
  if (Number(json?.code) !== 0) {
    const message = String(json?.message ?? json?.BaseResp?.StatusMessage ?? '未知错误');
    throw new FanqieError(`番茄接口拒绝了请求：${message}`, 'api_error');
  }
  return json;
}

function queryOf(url) {
  const index = String(url).indexOf('?');
  return index >= 0 ? String(url).slice(index + 1) : '';
}

function publicAccount(auth) {
  return {
    userId: String(auth.account?.userId ?? ''),
    userName: String(auth.account?.userName ?? ''),
    bookId: String(auth.bookId ?? ''),
    bookTitle: String(auth.bookTitle ?? ''),
  };
}

function pickComment(item) {
  const comment = item?.comment ?? item;
  if (!comment) return null;
  const id = String(comment.comment_id ?? '');
  if (!/^\d{10,25}$/.test(id)) return null;
  const common = comment.common ?? {};
  const base = common.user_info?.base_info ?? {};
  return {
    commentId: id,
    text: String(common.content?.text ?? '').slice(0, 1200),
    userName: String(base.user_name ?? ''),
    userId: String(base.user_id ?? ''),
    createTime: Number(common.create_timestamp ?? 0) || 0,
    diggCount: Number(comment.stat?.digg_count ?? 0) || 0,
    replyCount: Number(comment.stat?.reply_count ?? 0) || 0,
  };
}

/**
 * Build the app bridge from the local captured session.
 * Returns null when the user has not connected the app account.
 */
export function createFanqieApp() {
  const auth = readAuth();
  if (!auth) return null;
  const account = publicAccount(auth);
  const commentUrl = auth.urls?.comment ?? '';
  const replyUrl = auth.urls?.reply ?? '';
  const listUrl = auth.urls?.commentList ?? '';
  const replyListUrl = auth.urls?.replyList ?? '';
  if (!commentUrl || !replyUrl || !listUrl) return null;
  const query = queryOf(commentUrl);

  return {
    account,

    async listComments(bookId, { count = 20 } = {}) {
      const id = String(bookId || auth.bookId || '').trim();
      if (!/^\d{10,25}$/.test(id)) throw new FanqieError('bookId 不正确。', 'invalid_book');
      const body = clone(auth.templates.commentList ?? {});
      body.group_id = id;
      body.business_param = body.business_param ?? {};
      body.business_param.book_id = id;
      body.count = Math.min(50, Math.max(1, Number(count) || 20));
      const base = listUrl.split('?')[0].replace(/\/comment\/list\/\d+\/v1\/?$/, `/comment/list/${id}/v1`);
      const url = withQuery(base, queryOf(listUrl) || query);
      try {
        const json = await postJson(auth, url, body);
        const items = json?.data?.data_list ?? [];
        return items.map(pickComment).filter(Boolean);
      } catch (error) {
        // The app's list endpoint is stricter about replaying anti-bot
        // headers than the write endpoints. Fall back to the last locally
        // captured snapshot so reply IDs remain usable offline.
        if (Array.isArray(auth.commentsSnapshot) && auth.commentsSnapshot.length > 0) {
          if (String(auth.commentsSnapshotBookId || auth.bookId || '') !== id) throw error;
          return auth.commentsSnapshot.slice(0, Math.min(50, Math.max(1, Number(count) || 20)));
        }
        throw error;
      }
    },

    async listReplies(bookId, commentId, { count = 20 } = {}) {
      const bid = String(bookId || auth.bookId || '').trim();
      const cid = String(commentId || '').trim();
      if (!/^\d{10,25}$/.test(bid) || !/^\d{10,25}$/.test(cid)) {
        throw new FanqieError('bookId 或 commentId 不正确。', 'invalid_argument');
      }
      if (!replyListUrl) return [];
      const body = clone(auth.templates.replyList ?? {});
      body.group_id = bid;
      body.comment_id = cid;
      body.business_param = body.business_param ?? {};
      body.business_param.book_id = bid;
      body.count = Math.min(50, Math.max(1, Number(count) || 20));
      const base = replyListUrl.split('?')[0].replace(/\/reply\/list\/\d+\/v1\/?$/, `/reply/list/${cid}/v1`);
      const url = withQuery(base, queryOf(replyListUrl) || query);
      const json = await postJson(auth, url, body);
      const data = json?.data ?? {};
      const list = data.reply_list ?? data.data_list ?? data.replies ?? [];
      return list.map(pickComment).filter(Boolean);
    },

    async deleteComment(commentId) {
      const id = String(commentId || '').trim();
      if (!/^\d{10,25}$/.test(id)) throw new FanqieError('commentId 不正确。', 'invalid_argument');
      if (!auth.urls?.delete) throw new FanqieError('本机凭据里没有删除接口。', 'no_delete_api');
      await postJson(auth, auth.urls.delete, { comment_id: id }, auth.deleteHeaders);
      return { commentId: id, deleted: true };
    },

    async addComment(bookId, text, score = 10) {
      const id = String(bookId || auth.bookId || '').trim();
      if (!/^\d{10,25}$/.test(id)) throw new FanqieError('bookId 不正确。', 'invalid_book');
      const clean = safeText(text, 2000);
      const value = Math.min(10, Math.max(0, Number(score) || 10));
      const body = clone(auth.templates.comment ?? {});
      body.group_id = id;
      body.business_param = body.business_param ?? {};
      body.business_param.book_id = id;
      body.business_param.score = value;
      body.business_param.text_feature = {
        ...(body.business_param.text_feature ?? {}),
        max_input_word_count: '2000',
      };
      body.text = clean;
      const json = await postJson(auth, commentUrl, body);
      return {
        commentId: String(json?.data?.comment_info?.comment_id ?? ''),
        text: clean,
        score: value,
      };
    },

    async reply(bookId, commentId, text) {
      const bid = String(bookId || auth.bookId || '').trim();
      const cid = String(commentId || '').trim();
      if (!/^\d{10,25}$/.test(bid) || !/^\d{10,25}$/.test(cid)) {
        throw new FanqieError('bookId 或 commentId 不正确。', 'invalid_argument');
      }
      const clean = safeText(text, 500);
      const body = clone(auth.templates.reply ?? {});
      body.group_id = bid;
      body.reply_to_comment_id = cid;
      body.business_param = body.business_param ?? {};
      body.business_param.book_id = bid;
      body.business_param.from_famous_comment_id = 0;
      body.business_param.text_feature = {
        ...(body.business_param.text_feature ?? {}),
        max_input_word_count: '500',
      };
      body.text = clean;
      const json = await postJson(auth, replyUrl, body);
      return {
        replyId: String(json?.data?.reply?.reply_id ?? ''),
        commentId: cid,
        text: clean,
      };
    },
  };
}
