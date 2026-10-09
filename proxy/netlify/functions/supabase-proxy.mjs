/**
 * Supabase 反向代理 —— Netlify Functions 版本（v2 / Web API 风格）
 *
 * 背景：2026-09-24 起 `*.supabase.co` 的 TCP+TLS 在用户网络上被按域名(SNI)重置
 * （手机 curl 实测：DNS 正常、TCP 连上、TLS ClientHello 发出后立刻 Connection reset；
 *   同一 IP 换域名访问则成功）。浏览器靠 HTTP/3(QUIC/UDP) 能绕过去，
 * 但 App 的 Android WebView 只走 TCP，必然失败。
 *
 * 为什么用 Netlify 而不是 Cloudflare 免费子域：实测 `*.workers.dev` 在这条网络上
 * DNS 被污染（解析到 Facebook 段 IP）且连接超时；`*.netlify.app` 实测 HTTP 200 可达。
 *
 * 路由：netlify.toml 里的 config.path 会把 /auth/* 和 /rest/* 原样交给本函数，
 * 路径无需改写；函数再把请求转发到写死的上游项目，凭据原样透传。
 */

const UPSTREAM = 'https://jvpkqqnfzkkcztkbzpdx.supabase.co';
const ALLOWED_PREFIXES = ['/auth/', '/rest/'];

const ALLOW_HEADERS = [
  'apikey', 'authorization', 'content-type', 'x-client-info', 'x-supabase-api-version',
  'accept', 'accept-profile', 'content-profile', 'prefer', 'range', 'x-upsert',
].join(', ');

const EXPOSE_HEADERS = 'content-range, content-profile, x-total-count, location';

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Expose-Headers': EXPOSE_HEADERS,
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (!ALLOWED_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    return new Response('Not Found（此代理只转发 /auth 与 /rest）', { status: 404, headers: corsHeaders(req) });
  }

  const headers = new Headers(req.headers);
  for (const h of ['host', 'content-length', 'connection', 'x-nf-request-id', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip']) {
    headers.delete(h);
  }

  const hasBody = !['GET', 'HEAD'].includes(req.method);
  let upstream;
  try {
    upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
    });
  } catch (e) {
    return new Response('（代理）上游请求失败：' + String(e && e.message), { status: 502, headers: corsHeaders(req) });
  }

  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete('content-length');
  respHeaders.delete('content-encoding');
  for (const [k, v] of Object.entries(corsHeaders(req))) respHeaders.set(k, v);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
};

// Netlify Functions v2：直接把这两个前缀的请求路由到本函数（保留原始路径）
export const config = {
  path: ['/auth/*', '/rest/*'],
};
