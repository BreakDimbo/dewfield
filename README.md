# 晨露田园 Dewfield

网页 3D「种田 × 消消乐」：你在一座会过夜的玻璃露台上种一块 7×7 的晨露田。接市集委托时，这块田本身就变成可滑动的立体棋盘：消除就是收割，也会催熟旁边的作物。打完的田原样留到明天，过一夜会更熟。

| 核 | 玩家要说出的那句话 |
|---|---|
| 消消乐 | “我算到了，还炸得比想的好看。” |
| 种田 | “这块地因为我照料过，更像我的了。” |

## 当前状态

**MVP（v0.1.0-mvp）**：04 / 05 中的 Phase 0–2 任务全部交付，G0 通过，G1 / G2 以“等价验收”工件结项（真人试玩相关指标见下）。进度与每项验收备注以 [`docs/05-TASK-CHECKLIST.md`](docs/05-TASK-CHECKLIST.md) 为准。

能玩到的完整循环：标题 → T1“第一篮”（硬锁引导 3 步：三连 → 4 连出镰刀 → 镰刀横扫 + 级联）→ 结算 → 同田转场回到玻璃露台（田原样保留）→ T2 → 只读 C01 委托卡 → 引导浇垄 → C01（胜利后丰收时刻）→ 暮：商店买装饰（露台 L1→L3，装饰出现在固定挂点）→ 入夜 → 晨醒全田长大一格 → 第 2 天起全部开放（放蜂、拍照、明早预览、程序化委托）。存档只在安全点写入，刷新后可“继续”；多标签页自动锁定。

- **规则层**（`src/core`，纯 TS）：匹配/形状、结算循环、生长与邻格催熟、镰刀/晨露珠/蜂群与 7 种组合、预演（= 实际第一段）、回退、提示、丰收时刻、委托与部分交货、星级、露台/浇垄/放蜂/入夜/装饰与等级、第 1 天闸门 G0–G5、情境提示、程序化委托、存档 v1（zod、备份、迁移、损坏保留）、遥测与 KPI。
- **表现层**：单一画布、对象池 + 事件日志驱动的编排器（加速 / 跳过 / 一致性断言）、RD-5 分层预演、范围预警、3 种组合专属演出、产出飞入订单篮、晨/暮/夜光照、程序化作物与露台美术、8 件装饰、拍照模式、画质分级。
- **音频**：离线合成的 25 个音效精灵 + 3 首循环音乐（`pnpm assets:audio`，ffmpeg 编码），Howler 播放，级联五声音阶，首次交互前静音。
- **字体**：霞鹜文楷子集（115 KB，OFL，覆盖校验）。

## 操作

- **交换**：拖动一格到相邻格，或先点一格再点相邻格。拖动时会预演：白环 = 会被收割，彩珠 = 产出（大珠 = 交货），嫩绿箭头 = 会长大，六边环 = 会生成特效；拖回原位取消。闲置 8 秒两格会轻轻摆动提示。
- **结算中**点击画面或按空格加速；丰收时刻可“跳过”；`Z` 回退一步（每局 1 次）；`Esc` 暂停 / 放弃委托。
- **露台**：点告示牌或「委托」开始；点作物看“作物 · 生长态 · 明早”；「浇垄」后点一行；「放蜂」（买蜂箱后）点一株作物；按住月亮看明早；「商店」买装饰；相机按钮进拍照模式；右上齿轮是设置（音量、减弱动效、画质、重置存档）。

## 文档地图

| 文件 | 内容 | 什么时候读 |
|---|---|---|
| [`docs/00-REVIEW.md`](docs/00-REVIEW.md) | 对 v2 方案的评审：问题清单、修正决策（D-01…）、MVP 裁剪表 | 想知道“为什么这样设计”时 |
| [`docs/01-DESIGN-FINAL.md`](docs/01-DESIGN-FINAL.md) | 设计定稿：支柱、三尺度循环、前 10 分钟脚本、成功标准与试玩协议、MVP 范围 | 开工前通读一遍 |
| [`docs/02-GDD-SYSTEMS.md`](docs/02-GDD-SYSTEMS.md) | **规则权威**：棋盘结算管线、生长态、特效与组合表、委托、露台、过夜、照料、经济、存档类型、调参表、内容表 | 写 `src/core` 时逐节对照 |
| [`docs/03-TECH-SPEC.md`](docs/03-TECH-SPEC.md) | **技术权威**：锁定的版本、目录结构、分层边界、core API、状态机、渲染与编排、性能预算、测试策略 | 写任何代码之前 |
| [`docs/04-EXECUTION-PLAN.md`](docs/04-EXECUTION-PLAN.md) | 69 个任务：目标、验收标准、依赖、估点、涉及文件、DoD；里程碑与闸门 | 领任务时 |
| [`docs/05-TASK-CHECKLIST.md`](docs/05-TASK-CHECKLIST.md) | 按执行顺序排列的可勾选看板 | 每天 |
| [`docs/archive/DESIGN-v2.md`](docs/archive/DESIGN-v2.md) | 原始 v2 方案（未改动） | 追溯时 |

文档冲突时的优先级：规则以 02 为准，技术以 03 为准，任务以 04 为准。需要改规则时，先改文档，并在 00 第 3 节追加决策，再改代码。

## 如何按文档开工

1. 先读 `01`（约 15 分钟），再浏览 `03` 的 §2–§5，理解分层与 core API。
2. 打开 `05`，从最上面的 **P0-01** 开始；每个任务的细节在 `04` 中按 ID 查找，做完的标准就是该任务的**验收标准 + DoD**。
3. 写规则代码时对照 `02` 的对应小节；所有数值都从 `src/core/config/tunables.ts` 读取（默认值见 02 §14）。
4. 一个任务一个分支、一个 PR；提交信息以任务 ID 开头，例如 `P0-08: match detection with shape priority`。
5. Phase 0 首个迭代的建议安排见 `04` §7。

## 技术栈

Vite 8 · React 19 · TypeScript 6.0 · three.js r186 + React Three Fiber 9 + drei 10 · Zustand 5 · Howler 2 · zod 4 · Vitest 5 + fast-check + Playwright。精确版本与选型理由见 `03` §2（TypeScript 必须锁定在 6.0.x）。

## 本地运行

需要 Node ≥ 22.12 和 pnpm 10。

```bash
pnpm install
pnpm dev            # http://localhost:5391
pnpm test           # 单元 + 属性 + 集成 + 平衡守卫（node 与 jsdom 两个 project）
pnpm e2e            # Playwright：冒烟、T1、4 条回归流程、性能/遮挡预算（首次需 pnpm exec playwright install chromium）
bash scripts/ci.sh  # 完整 CI：frozen install → lint → typecheck → test(覆盖率) → build；E2E=1 时加跑 Playwright
```

## 构建与部署

```bash
pnpm build          # 产物在 dist/（纯静态，可部署到任意静态托管）
pnpm serve          # 用生产缓存策略本地托管 dist/：http://localhost:5393
VITE_BASE=/dewfield/ pnpm build   # 部署到子路径
```

- 带哈希的 `/assets/*` 与 `/fonts/*`：`Cache-Control: public, max-age=31536000, immutable`；`index.html`：`no-cache`。已附 `public/_headers`（Netlify / Cloudflare Pages）与 `vercel.json`。
- 标题页右下角与存档的 `build` 字段都是 `git 短 SHA + 日期`。

## 工具

| 命令 | 作用 |
|---|---|
| `pnpm sim --mode single --bot greedy --commission C01 --runs 500 --seed 1` | 平衡模拟（02 §15）；`--mode campaign`、`--care waterOrdered`、`--vs`、`--out f.json` |
| `pnpm tsx tools/sim/tune.ts 200` | 按档位区间搜索委托数量（P1-26 / P2-23） |
| `pnpm kpi export.json …` | 从调试面板导出的遥测生成 K1–K6 报告 |
| `pnpm assets:audio` | 重新合成音效精灵与音乐（需要 ffmpeg） |
| `pnpm assets:font` | 重新生成展示字体子集（缺字报错，超 150 KB 报错） |
| `pnpm assets:budget` | 作物/标记面数预算检查（03 §14） |
| `node tests/readability/readability.mjs` | 灰度可读性正式测试（需 dev server） |

调试入口（URL 参数）：

| 参数 | 作用 |
|---|---|
| `?debug=1` | 调试面板（独立懒加载 chunk）：FPS、draw calls、三角形、粒子数、seed、步数、挂载计数、ASCII 转储、复制状态、导出遥测、leva 调参 |
| `?bench=1` | bot 自动玩 60 秒（`&benchMs=` 可改），输出平均与 p95 帧时间并写入遥测 |
| `?seed=<n>` | （dev）指定新游戏种子 |
| `?autoplay=1` | （dev）bot 一路玩下去（含露台、商店、入夜），编排与逻辑不一致时直接抛错 |
| `?e2e=1` | （dev）暴露 `window.__DEWFIELD__` 测试钩子 |

## 报告

- 数值：[`docs/balance/VS-report.md`](docs/balance/VS-report.md)、[`docs/balance/MVP-report.md`](docs/balance/MVP-report.md)、性能 [`docs/balance/perf-report.md`](docs/balance/perf-report.md)
- 试玩与评审：[`docs/playtests/`](docs/playtests)（灰度可读性、海报测试、PT1、PT2）

## 核心工程约束（摘要）

- `src/core` 是纯 TypeScript：不依赖 React、three 或 DOM，不用 `Math.random` 或 `Date.now`；可以在 Node 中单测和批量模拟。这些约束由 ESLint 强制。
- 逻辑立即提交，表现随后追赶：`applyMove` 返回事件日志，由编排器驱动对象池渲染，React 不逐帧渲染。
- 田就是棋盘：整个游戏只有一个 3D 画布，田的渲染组件在露台和对局之间不重建。
