# 性能报告（P2-21）

> 生成：`node tools/perf/perf.mjs`（生产构建 + `pnpm serve`，Chromium + SwiftShader 软件渲染，1280×800，DPR 1）。

## 1. 体积预算（03 §13）

| 项 | 结果 | 预算 |
|---|---|---|
| 初始 JS（gzip） | **398 KB**（index-DXta0SUk.js、rolldown-runtime-hePW80VL.js、vendor-react-DmrohK75.js、vendor-three-Z-Vdi1Hq.js） | ≤ 500 KB |
| 首个场景的资源（不含懒加载音乐与调试模块） | **2297 KB** | ≤ 6 MB |
| 展示字体子集 | 115 KB | ≤ 150 KB |
| 音效精灵（webm / mp3） | 359 KB / 389 KB | — |
| 3 首音乐（懒加载，html5 流式） | 1986 KB（webm 合计） | — |

## 2. 加载

| 项 | 结果 | 预算 |
|---|---|---|
| 到达标题页（20 Mbps、20 ms 延迟、禁用缓存） | **0.82 秒** | ≤ 4 秒 |

## 3. 渲染预算（`renderer.info`）

| 视图 | draw calls | 三角形 | 预算 |
|---|---|---|---|
| 标题（露台 L1） | 58 | 71.8k | ≤ 180 / ≤ 150k |
| 露台 L3（8 件装饰全部拥有） | 58 | 71.8k | ≤ 180 / ≤ 150k |
| 对局 | 58 | 71.8k | ≤ 100 / ≤ 80k |

## 4. 帧时间（`?bench=1`，20 秒 bot 自动游玩）

`[bench] avg 2925.74 ms · p95 12653.30 ms · 8 frames`

- 这是 **SwiftShader 纯 CPU 软件渲染** 的数据，不代表 GPU 设备，不能用来判断 P2-21 验收 1（≥ 55 fps、p95 ≤ 22 ms）。
- **待真机测量**：在核显笔记本与 iPad（A13）上分别打开 `?bench=1`（标题/露台与对局各一次），把控制台 `[bench]` 行填入下表。未填之前 P2-21 不能勾选。

| 设备 | 视图 | 平均帧时间 | p95 | 结论 |
|---|---|---|---|---|
| 核显笔记本 | 露台 / 对局 | 待测 | 待测 | — |
| iPad A13 | 露台 / 对局 | 待测 | 待测 | — |

- 自动降级（`render/quality.ts`：DPR 2 → 1.5 → 1 → 粒子减半，最多 4 次切换后锁定防抖）有单测覆盖。
- 降级与恢复：drei `PerformanceMonitor`（bounds 45–58 fps）驱动 `qualityStep`；设置中的“高 / 低”直接锁定档位。
