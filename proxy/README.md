# Supabase 反向代理（Cloudflare Worker）

## 为什么需要它

2026-09-24 起，`*.supabase.co` 的 **TCP/TLS 直连**在部分网络被阻断：从本机 curl 直连 3/3 被 0.15 秒重置，同一 IP 换域名就 200；而现代浏览器（PC Chromium、手机 Edge）走 HTTP/3(QUIC/UDP) 能绕过去。

手机 App 的 Android WebView **只走 TCP**（Capacitor 用的是系统 WebView，且 WebView 默认不启用 QUIC），所以必然失败，表现就是登录页显示「无法连接服务器，请检查网络后重试」。手机端诊断实测：Supabase 三个探测全部 `TypeError ｜ Failed to fetch`（195~1278ms，不是超时），而对照组百度、Cloudflare 都通——问题只出在这个域名上。

把这个 Worker 部署到 Cloudflare 的免费额度上，App 改用一个**不被阻断的域名**即可恢复，不要再让 App 直连 `*.supabase.co`。

## ⚠️ 平台可达性实测（2026-09-24，用手机 curl 在用户网络上实测）

| 平台域名 | 实测结果 | 能否用 |
|---|---|---|
| `*.netlify.app` | HTTP 200 | ✅ **可用**（推荐，免域名） |
| `*.deno.dev` | TLS 握手成功（返回 404） | ✅ 可用 |
| `www.cloudflare.com` | HTTP 200 | ✅ Cloudflare 边缘可达 → 自有域名 + Worker 可行 |
| `*.workers.dev` | DNS 被污染（解析到 Facebook 段 IP）+ 连接超时 | ❌ **不可用** |
| `*.vercel.app` | 连接失败 | ❌ 基本排除 |

结论：**免费 `*.workers.dev` 方案在用户网络上不可行**，改用 `proxy/netlify/`（Netlify Functions 版本），
或自有域名 + `proxy/worker.js`（Cloudflare Worker）。

## 部署方式 A：Netlify（推荐，免域名、免备案）

目录：`proxy/netlify/`（`netlify.toml` + `functions/supabase-proxy.mjs` + `public/index.html`）

- **给我 Netlify API Token**：我用 `npx netlify deploy --prod` 直接部署，你什么都不用点。
- **或你自己部署**：用 GitHub 账号登录 Netlify → New site → Deploy manually，把 `proxy/netlify/` 目录拖进去。

部署后地址形如 `https://<站点名>.netlify.app`，用手机浏览器打开 `/auth/v1/health?apikey=<ANON_KEY>` 自检。

## 部署方式 B：Cloudflare Worker（需要自有域名）

前提：一个 Cloudflare 账号（免费注册，不需要信用卡）+ 一个自有域名（几十元/年，不需要备案）。

### 方式 A：你给我一个 API Token，我来部署

在 Cloudflare 后台 **My Profile → API Tokens → Create Token → Custom token**，权限给：

- `Account` → `Workers Scripts` → `Edit`
- `Account` → `Account Settings` → `Read`（wrangler 需要读 account id）

把这个 Token 给我，我执行：

```bash
cd proxy
CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy
```

### 方式 B：你自己在本机部署

```bash
cd proxy
npx wrangler login          # 浏览器里点一下授权
npx wrangler deploy
```

部署完成的输出里会有地址，形如：

```
https://house-supabase-proxy.<你的子域>.workers.dev
```

**记下这个地址**（下称 `<代理地址>`）。

## 部署后必做：先在手机上验证这个地址通不通

这一步最关键——因为 `.workers.dev` 在国内的可达性不保证，必须实测：

1. 把下面的 `<ANON_KEY>` 换成 `.env` 里 `VITE_SUPABASE_ANON_KEY` 的值（很长，建议发到微信文件传输助手再从手机点开）。
2. **用手机浏览器**打开：
   `https://<代理地址>/auth/v1/health?apikey=<ANON_KEY>`
3. 看到 `{"version":"...","name":"GoTrue"}` 之类的 JSON = 通了；打不开或连接被重置 = 这个子域在国内也不可达，需要换成自有域名（见下）。

## 如果 workers.dev 不通：绑自有域名

买一个便宜域名（或者用你已有的域名），接入 Cloudflare（免费套餐即可，**不需要备案**，因为主机在 Cloudflare 而不在国内），然后：

1. 编辑 `proxy/wrangler.toml`，取消 `routes` 注释并改成你的域名；
2. 重新 `npx wrangler deploy`；
3. 用 `https://api.你的域名.com/auth/v1/health?apikey=<ANON_KEY>` 在手机上重测。

## 通了之后：改 App（三处，一次重新打包）

1. `.env`：
   ```
   VITE_SUPABASE_URL=https://<代理地址>
   ```
   （`VITE_SUPABASE_ANON_KEY` 不变，代理是把凭据原样透传给 Supabase 的）
2. `index.html` 的 CSP `connect-src`：把 `https://jvpkqqnfzkkcztkbzpdx.supabase.co` **换成/加上**代理域名。
   ⚠️ 这处最容易漏，漏了的话请求会被 CSP 直接拦掉，现象和现在的报错一模一样。
3. `npm run release` 重新打包安装。

（网页版部署同样要改这两处，否则 GitHub Pages 上的网页版会在浏览器回落到 HTTP/2 时同样挂掉。）

## 这个代理做了什么

- 只转发 `/auth/v1/*` 和 `/rest/v1/*` 到写死的上游项目，不是开放代理；
- `apikey` / `Authorization` 原样透传，Worker 自身不持有任何密钥，不落地任何数据；
- 预检 OPTIONS 由 Worker 直接应答（放行 `apikey`/`authorization`/`x-client-info` 等自定义头），并透出 `content-range` 等 PostgREST 响应头；
- 由 Cloudflare 免费额度承载（每天 10 万次请求），对单用户规模的应用绰绰有余。
