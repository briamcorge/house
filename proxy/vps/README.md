# VPS 版部署步骤（腾讯云/阿里云轻量应用服务器）

## ⚠️ 买之前先看这一条：必须选香港或境外节点

- **不要买国内节点**（北京/上海/广州/成都…）。两个原因：
  1. 国内机器的**出向**也要走同一条国际出口，连 `*.supabase.co`（TCP）大概率同样被按域名重置 —— 代理自己都连不上上游，白搭；
  2. 域名指向国内机器**必须 ICP 备案**，个人备案通常要等一两周。
- **香港节点**：出向不受影响（它不在墙内），且不需要备案，离大陆近、延迟低。

## 买什么

- 腾讯云「轻量应用服务器」或阿里云「轻量应用服务器」，**地域选香港**。
- 规格：最低档即可（1 核 1G / 2 核 2G），只做 API 转发绰绰有余。按月付几十元，年付常有优惠。
- 系统：Ubuntu 24.04 或 Debian 12。
- 另需一个域名（`.com` 约几十元/年，在阿里云/腾讯云买即可，**不需要备案**）。

## 部署（4 步，约 10 分钟）

1. **解析域名**：在域名商的控制台，把 `api.你的域名` 添加一条 A 记录，指向服务器的**公网 IP**。
2. **放通端口**：轻量服务器的控制台防火墙里放通 `80` 和 `443`（80 用于证书申请与跳转）。
3. **装 Caddy 并配置**（SSH 登录服务器后执行）：

   ```bash
   # 安装 Caddy（官方源）
   sudo apt update && sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy

   # 上传本目录的 Caddyfile 到 /etc/caddy/Caddyfile（把 api.example.com 改成你的域名）
   sudo nano /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   sudo systemctl status caddy --no-pager | head -5
   ```

4. **先验证服务器出口能连上 Supabase**（这是关键一步，香港节点应该直接成功）：

   ```bash
   curl -sv -m 15 -o /dev/null 'https://jvpkqqnfzkkcztkbzpdx.supabase.co/auth/v1/health'
   ```

   - 看到 HTTP 401（缺 apikey）就说明**出口正常**；
   - 若出现 `Connection reset by peer`，说明节点出口也被拦，需要换节点或改走 Worker 方案。

## 上线前自检（用手机浏览器，别用电脑）

把 `<ANON_KEY>` 换成 `.env` 里的 `VITE_SUPABASE_ANON_KEY`，**在手机浏览器**打开：

```
https://api.你的域名/auth/v1/health?apikey=<ANON_KEY>
```

返回 `{"version":"...","name":"GoTrue"}` 之类的 JSON = 通。**要先过这一步再改 App**，否则改完打包还是白折腾一轮。

## 通过后改 App（三处，重新打包）

1. `.env`：`VITE_SUPABASE_URL=https://api.你的域名`（末尾不要带斜杠）
2. `index.html` 的 CSP `connect-src`：把代理域名加进去（或替换掉原 supabase 域名）
3. `npm run release` 重新打包安装

## 说明

- 代理只转发 `/auth` 与 `/rest`，其它路径 404，不是开放代理；
- 客户端带的 `apikey` / `Authorization` 原样转发，服务器上不保存任何密钥或数据；
- 这个域名是对公网开放的，但 supabase 的 anon key 本身就是公开的（在 App 包里），
  数据安全由 Supabase 的 RLS 保证（anon 角色读不到别人的数据），所以不需要额外加鉴权；
- 证书由 Caddy 自动申请和续期（Let's Encrypt），到期前会自动处理，不用管。
