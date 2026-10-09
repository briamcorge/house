/**
 * Supabase 反向代理（Cloudflare Worker）
 *
 * 用途：2026-09-24 起 *.supabase.co 的 TCP/TLS 直连在部分网络被阻断，
 * 浏览器靠 HTTP/3(QUIC) 能绕过去，但 App 的 Android WebView 只走 TCP，
 * 必然失败（表现为「无法连接服务器，请检查网络后重试」）。
 * 这个 Worker 提供一个不被阻断的域名，替 App 转发 REST/Auth 请求。
 *
 * 只转发以下前缀（写死上游主机，避免变成开放代理）：
 *   /auth/v1/*  登录、注册、刷新令牌、找回密码
 *   /rest/v1/*  数据读写（user_data 表）
 *
 * 客户端凭据（apikey / Authorization）原样透传给 Supabase，
 * Worker 自身不持有任何密钥。
 */

const UPSTREAM = 'https://jvpkqqnfzkkcztkbzpdx.supabase.co';
const ALLOWED_PREFIXES = ['/auth/v1/', '/rest/v1/'];
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'];
// 客户端会带的自定义头（预检必须放行，否则 fetch 会被浏览器拦掉）
const ALLOW_HEADERS = [
  'apikey', 'authorization', 'content-type', 'x-client-info', 'x-supabase-api-version',
  'accept', 'accept-profile', 'content-profile', 'prefer', 'range', 'x-upsert',
].join(', ');
// PostgREST 用这几个响应头返回计数/范围信息，不透出去 supabase-js 的 count 查询会失效
const EXPOSE_HEADERS = 'content-range, content-profile, x-total-count, location';

function corsHeaders(request) {
  // App 里页面来源是 https://localhost，网页版是 github.io，都用不到 Cookie，
  // 所以直接回 * 即可（不透传 Cookie，不存在凭据泄露）
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Expose-Headers': EXPOSE_HEADERS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function text(body, status, request) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders(request) } });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 预检由 Worker 直接应答，不再向上游发
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (!ALLOWED_METHODS.includes(request.method)) return text('Method Not Allowed', 405, request);
    if (!ALLOWED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
      return text('Not Found（此代理只转发 /auth/v1 与 /rest/v1）', 404, request);
    }

    // 只保留必要请求头，去掉与本次连接相关的头，避免污染上游
    const headers = new Headers(request.headers);
    for (const h of ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-real-ip', 'content-length']) {
      headers.delete(h);
    }

    const hasBody = !['GET', 'HEAD'].includes(request.method);
    let upstream;
    try {
      upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: 'manual',
      });
    } catch (e) {
      return text('（代理）上游请求失败：' + String(e && e.message), 502, request);
    }

    // content-length / content-encoding 交给 Cloudflare 按实际字节重算，避免透传后不一致
    const respHeaders = new Headers(upstream.headers);
    respHeaders.delete('content-length');
    respHeaders.delete('content-encoding');
    for (const [k, v] of Object.entries(corsHeaders(request))) respHeaders.set(k, v);

    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: respHeaders });
  },
};
