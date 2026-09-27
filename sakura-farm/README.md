# 桜ヶ丘ふれあい农园（sakura-farm）

在《桜ヶ丘駅》小镇里第一人称走动种树。农园有 8 块田，能种出 樱、梅、红叶、柿、蜜柑、松 六种树。树按游戏内的日夜生长：当天浇过水，过一夜就长一天。消消乐只在种子摊上玩，只产出种子和农具（水、肥料、剪刀）；真正的种田在 3D 场景里完成。

场景、渲染管线和工具脚本基于 [Kenton-GMI/sakuragaoka-station](https://github.com/Kenton-GMI/sakuragaoka-station)（MIT），出处见 `NOTICE.md`。技术栈与原项目一致：纯 ES 模块 + three.js（importmap 从 CDN 加载），没有构建步骤。

## 运行

```bash
cd sakura-farm
npm install          # 只为本地工具（puppeteer-core、three 副本）；游戏本身不需要
npm start            # node tools/serve.mjs，然后打开终端里给出的地址
```

任何静态文件服务器都可以直接托管本目录。

## 玩法

1. 出生在农园入口。点「开始种树」进入第一人称。
2. **锄头** 松土 → **种子袋** 播种（`R` / 滚轮切换树种）→ **水壶** 浇水。每块田每天浇一次。
3. 17:00 以后到 **农具小屋** 门口按 `E` 睡觉；24:00 会自动睡。过夜时浇过水的树长一天，雨天自动浇水。
4. 种子和农具来自 **种子摊** 的消消乐（每天 3 张券）。4 连 → 水，L/T → 肥料，5 连 → 剪刀；消掉的棋子攒种子点数。
5. 成树每 2 天结一次果，用 **篮子** 收获。松在小树阶段需要用剪刀修剪一次才会长成成树。券用完时，3 个收获物可以换 1 张券。
6. 目标：六种树都长成成树（`Tab` 打开背包与图鉴）。树不会枯死，忘记浇水只是不长。

操作：`WASD` 走、`Shift` 跑、`Space` 跳、鼠标看；准星对准田块后 左键 / `E` 执行；`1`–`6` 切换快捷栏；`Shift+1`–`6` 瞬移（`Shift+6` = 农园）；`Home` 回农园入口；`H` 隐藏界面；`M` 静音。

## 开发

| 命令 | 作用 |
|---|---|
| `npm test` | 规则层单元测试（`src/game`，node --test） |
| `npm run check` | 在 node 里构建全部世界模块并检查（无浏览器） |
| `node tools/shot.mjs --only environment,houses,farm,sakura,trees --demo trees --cams "x,z,yaw,pitch"` | 渲染截图（需要本地 Chromium） |
| `node tools/play.mjs tools/playscripts/day1.json` | 真实游戏模式下的脚本化试玩与截图（还有 `stall.json`、`daynight.json`） |

URL 参数：`?demo=trees` / `?demo=stages`（展示用存档，不写入 localStorage）、`?time=19:30`（从指定时刻开始）、`?fly`（允许 `F` 飞行）、`?q=low|medium|high`（画质）。

存档：`localStorage` 键 `sakurafarm.save.v1`，每 20 秒、每次操作和睡觉时写入；读不了的存档会另存一份后开始新游戏。

设计与代码结构见 [`docs/DESIGN.md`](docs/DESIGN.md)；原小镇的设计文档是 [`docs/DESIGN-sakuragaoka.md`](docs/DESIGN-sakuragaoka.md)。

## 尚未验证

- 只在无头 Chromium（SwiftShader 软件渲染）里截图和脚本试玩过；没有在真实 GPU、手机或平板上测过帧率和触控。
- 没有真人试玩，数值（生长天数、券数、种子点数）是初稿。
