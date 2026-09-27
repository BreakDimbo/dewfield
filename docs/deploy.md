# 构建与部署（P2-25）

## 1. 构建

```bash
pnpm build            # 产物在 dist/，纯静态
VITE_BASE=/dewfield/ pnpm build   # 部署到子路径时
```

标题页右下角与存档的 `build` 字段都是 `git 短 SHA + 日期`（`vite.config.ts` 注入的 `__BUILD__`）。

## 2. 缓存策略

| 路径 | Cache-Control | 原因 |
|---|---|---|
| `/`、`/index.html` | `no-cache` | 每次都拿到最新的入口 |
| `/assets/*`（带内容哈希，含展示字体） | `public, max-age=31536000, immutable` | 文件名随内容变化 |
| `/audio/*` | `public, max-age=604800` | 文件名不带哈希，重新生成后最多 7 天生效 |
| 其他（`/fonts/OFL.txt`、`favicon.svg`） | `no-cache` | 不带哈希 |

配置：Netlify / Cloudflare Pages 读 `public/_headers`；Vercel 读 `vercel.json`；本地 `pnpm serve`（`scripts/serve.mjs`）使用同一策略。

## 3. 本地验证记录

构建 `54c7690`，`pnpm build && pnpm serve`，2026-09-27：

```
$ curl -sI http://localhost:5393/
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-cache

$ curl -sI http://localhost:5393/index.html
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Cache-Control: no-cache

$ curl -sI http://localhost:5393/assets/index-BxGYB8Li.js
HTTP/1.1 200 OK
Content-Type: text/javascript
Cache-Control: public, max-age=31536000, immutable

$ curl -sI http://localhost:5393/assets/wenkai-subset-CcebcDzj.woff2
HTTP/1.1 200 OK
Content-Type: font/woff2
Cache-Control: public, max-age=31536000, immutable

$ curl -sI http://localhost:5393/audio/sfx.webm
HTTP/1.1 200 OK
Content-Type: audio/webm
Cache-Control: public, max-age=604800

$ curl -sI http://localhost:5393/audio/music/morning.webm
HTTP/1.1 200 OK
Content-Type: audio/webm
Cache-Control: public, max-age=604800

$ curl -sI http://localhost:5393/fonts/OFL.txt
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Cache-Control: no-cache

```

## 4. 线上部署（待完成）

- [ ] 选定托管（Vercel / Netlify / Cloudflare Pages / GitHub Pages + `VITE_BASE`）并配置凭据 —— 需要项目负责人决定
- [ ] 部署后用 `curl -sI <地址>/` 与 `<地址>/assets/<任一文件>` 截取响应头，贴在这里
- [ ] 在线上地址从新存档玩到第 2 天晨醒
