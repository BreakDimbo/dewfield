# 02 · 系统规格（GDD Systems）

> **本文是规则的权威来源。** 与 01 冲突时以本文为准；与代码冲突时先改本文，再改代码，并在 `00-REVIEW.md` 第 3 节追加决策。
> 所有可调数值都以 `tunable.key` 形式引用，默认值见 §14。所有“随机”都指 RunState 或 HomesteadState 中带种子的 PRNG（03 §5.1），禁止使用 `Math.random`。

---

## 0. 约定与记号

- **坐标**：`x ∈ [0, W)` 从左到右，`y ∈ [0, H)` 从远到近。`y = 0` 是远端（屏幕上方，育苗架一侧），`y = H-1` 靠近镜头（屏幕下方）。`index = y * W + x`。
- **方向**：“下”= `+y`；重力沿 `+y`。
- **邻格**：只算正交四邻（上下左右），且在边界内。
- **一手（Move）**：玩家的一次交换，以及由它引发的全部结算步。
- **结算步（Step）**：一次“检测 → 收割 → 生长 → 重力 → 补位”循环。组合或蜂群交换产生的特殊结算记为第 0 步。
- **index 序**：按 `index` 升序（行优先，从左上开始）。凡是写“按 index 序”的地方都必须照做，以保证确定性。
- **必须 / 应当**：“必须”是硬规则，由测试覆盖；“应当”是建议。

---

## 1. 棋盘规则

### 1.1 尺寸与作物

- `board.width = 7`，`board.height = 7`（与晨露田尺寸绑定，MVP 内不可调）。
- 作物 5 种，顺序固定（用于平局裁决）：`carrot(0) · tomato(1) · corn(2) · eggplant(3) · blueberry(4)`，详见 §16.1。

### 1.2 作物格数据

```ts
type CropId = 'carrot' | 'tomato' | 'corn' | 'eggplant' | 'blueberry';
type Stage = 0 | 1 | 2;                              // 芽 / 青 / 熟
type CropSpecial = 'sickleH' | 'sickleV' | 'dewOrb';
type SpecialKind = CropSpecial | 'bee';

type Tile =
  | { uid: number; kind: 'crop'; crop: CropId; stage: Stage; special: CropSpecial | null }
  | { uid: number; kind: 'bee' };
```

- 静止时每一格都必须有 tile（棋盘始终是满的）。
- `uid` 在整个存档内唯一，由 `uidCounter` 递增分配。新生成的 tile（补位、新特效、放蜂）必须使用新 uid。
- 镰刀和晨露珠是“带特效的作物格”：它们有作物种类和生长态，会按作物参与匹配。
- 蜂群格没有作物和生长态，不参与匹配，也不受任何生长影响。

### 1.3 交换合法性

一手记为 `(a, b)`，要求 a、b 正交相邻。a 是玩家拖动（或先点）的格，b 是目标格；交换后原来 a 上的 tile 位于 b。

交换后按以下顺序判定：

1. a、b 上都是特效（镰刀 / 晨露珠 / 蜂群任意两者）→ **合法**，执行组合（§3.5）。
2. 否则，其中一个是蜂群 → **合法**，执行蜂群激活（§3.3）。
3. 否则，棋盘上存在至少一个包含 a 或 b 的匹配组 → **合法**。
4. 否则 **非法**：两格换回，不消耗步数，产生 `swapRejected` 事件。

镰刀或晨露珠与普通作物交换、但没有形成匹配时，属于非法交换。

### 1.4 匹配检测与形状判定

- **连线（Run）**：横向或纵向上连续 ≥ 3 个 `kind: 'crop'`、且 `crop` 相同的格子，取最长。**生长态与特效不影响匹配**；蜂群会截断连线。
- **匹配组（Group）**：共享至少一个格子的连线合并为一组（按共享格求连通分量）。平行、相邻但不共享格子的两条连线是两个组。
- **形状判定**（按优先级从高到低，每组最多生成 1 个特效）：

| 优先级 | 形状 | 条件 | 生成 |
|---|---|---|---|
| 1 | `line5` | 组内任一连线长度 ≥ 5 | 蜂群 |
| 2 | `cross` | 组内同时有横向和纵向连线（L / T / 十字 / H 形） | 晨露珠 |
| 3 | `line4` | 组内有长度为 4 的连线 | 镰刀；方向由 `special.sickleOrientation` 决定：`parallel` 时横向连线得横镰刀（收整行），纵向连线得竖镰刀（收整列） |
| 4 | `line3` | 其他情况 | 无 |

阶段开关：`special.beeEnabled = false` 时（只在蜂群尚未实现的 VS 阶段使用），`line5` 按 `line4` 处理，也就是生成镰刀，方向取那条 ≥ 5 的连线的方向。

### 1.5 特效生成位置

对每个会生成特效的组：

1. **第 1 步**（且本手没有第 0 步）：组内包含 b，则位置为 b；否则包含 a，则位置为 a。
2. **其他情况**（级联步，或组内既无 a 也无 b）：
   - `cross`：取横向连线与纵向连线的交点；有多个交点时取 index 最小者。
   - `line4` / `line5`：取该连线从上端或左端起、偏移 `floor((len-1)/2)` 的格。`line5` 组内有多条 ≥ 5 的连线时，取扫描顺序（先扫所有行、再扫所有列）中第一条。

### 1.6 单手结算管线（权威顺序）

```
applyMove(run, (a,b)):
  0. 按 §1.3 校验；非法则返回 { ok:false, reason }，run 不变。
  1. 保存回退快照（§4.2）；movesLeft -= 1；moveIndex += 1。
  2. 交换 a、b 上的 tile → 事件 swap。
  3. 若为组合（§3.5）或蜂群激活（§3.3），执行第 0 步：
       H0 = 组合 / 蜂群的作用格集合，包含被交换的特效格（组合时两个都算；蜂群 + 普通作物时，
            该普通作物格属于目标作物，随授粉一并收割）
       连锁闭包（§3.4）→ 得到 H0、G_special、P
       产出（§2.1）→ 移除 → 生长（仅 G_special）→ 重力 → 补位
  4. depth = 0；循环：
     4.1  groups = 检测匹配组（§1.4）；为空则跳出。
     4.2  depth += 1 → 事件 cascadeStep{depth}。
     4.3  为每组确定生成的特效（种类与位置，§1.4、§1.5）。
     4.4  H = 所有组格子的并集；triggers = H 中的特效格（index 序）。
     4.5  连锁闭包（§3.4）：激活 triggers，扩展 H，并收集 G_special（环形催熟格）与 P（授粉格）。
     4.6  产出：按 index 序遍历 H，每格的产出生长态 = (格 ∈ P ? 2 : tile.stage)；蜂群格无产出 → 事件 harvest。
     4.7  移除 H 中所有 tile；在生成位置放置新特效（新 uid；作物 = 该组作物；生长态 = growth.createdSpecialStage；line5 生成 { kind:'bee' }）→ 事件 specialCreated。
     4.8  生长：T = (每个匹配组格子的正交邻格之并) ∪ G_special；T -= H；T -= 本步新特效位置；
          按 index 序对 T 中的作物格执行 stage = min(2, stage+1)，只有生长态发生变化时才产生 grow 事件
          （按来源拆分，见 03 §5.4）。同一步内每格最多 +1。
     4.9  重力（§1.7）→ 事件 fall。
     4.10 补位（§1.7）→ 事件 spawn。
  5. 若没有可行步（§1.8）→ 洗牌 → 事件 shuffle。
  6. 胜负判定（§5.3）：胜利且非教程 → 丰收时刻（§5.5）；movesLeft == 0 且未胜 → 失败。
  7. 返回 { ok:true, run', events }。
```

补充规则（必须）：

- **生成位置上的 tile 同样算被收割**（按它的生长态产出），然后被新特效替换。所以一个 4 连会收 4 个作物，并留下一个新的特效格。
- 同一步内先算产出，再算生长。本步长大的格子要到下一步才会按新的生长态产出。
- 胜负只在一手全部结算完毕后判定。订单在级联中途达成时，余下的级联照常结算，产出计为余量。

### 1.7 重力与补位

- **重力**：对每一列，把剩余 tile 自下而上压实到底部，保持相对顺序。发生位移的 tile 产生 `fall{uid, from, to}`。
- **补位**：按列 `x` 升序处理。设该列有 `k` 个空格（必然是 `y = 0..k-1`），按 `y = k-1` 递减到 `0` 的顺序逐格放入新 tile：
  1. 若 `spawnQueue` 非空，取队首记号（ASCII，§1.10）。
  2. 否则随机生成：
     - 作物权重：`w(c) = 1000 + (c 是订单中仍未交齐的作物 ? round(1000 * spawn.orderBias) : 0)`，使用整数权重。
     - 生长态按 `spawn.stageWeights`（芽 / 青 / 熟，换算为整数千分比）抽取。
     - 随机补位永远不会生成特效。
  3. 事件 `spawn{uid, pos, token, entryOffset: k}`，其中 `token` 是新 tile 的 ASCII 记号（作物 + 生长态），`entryOffset` 供表现层计算从育苗架落下的距离。

### 1.8 无可行步与洗牌

- **可行步**：任意一对相邻交换按 §1.3 判定为合法（包括两个特效相邻、蜂群与任意格相邻）。
- 每手结算后（胜负判定前），如果可行步数为 0，就洗牌：
  1. 最多尝试 `board.shuffleMaxAttempts` 次：用 RNG 对全部 tile 的位置做 Fisher–Yates 置换；若结果没有匹配组，且可行步 ≥ `board.minValidMoves`，就接受。
  2. 全部失败时走回退路径：保留生长态与特效，按 §1.9 的生成算法重新分配非特效作物格的作物种类，直到满足约束 → 额外产生 `recolor` 事件。
- 洗牌不消耗步数；首次发生时显示提示 `tip.shuffle`。

### 1.9 开局合法化与棋盘生成

**开局（`startRun`）**：棋盘 = 田的深拷贝，然后：

1. 若存在匹配组（理论上不应出现）：对每个组，选生长态最低（相同时选 index 最大）的非特效格，把它的作物改为按作物顺序第一个不会在该位置形成连线的作物。修复次数记入遥测 `legalize_fix`。
2. 若没有可行步：按 §1.8 洗牌。

**不变量说明**：田只会来自三处，都保证合法。①已结算完毕的终局棋盘（静止，至少有 1 个可行步）；②只改变生长态的操作（过夜、浇垄），不改作物种类；③放蜂（蜂群截断连线，而且会增加可行步）。因此合法化只是安全网，正常流程中改动次数应为 0，测试必须断言这一点。

**生成算法 `generateBoard(rng, stageWeights)`**（用于测试、模拟与回退，不用于新存档的初始田；初始田是 T1 夹具，见 §11.2）：

1. 按 index 序为每格随机选一种作物，候选集合排除会与左侧两格或上方两格组成连线的作物。
2. 生长态按 `stageWeights` 抽取。
3. 若可行步 < `board.minValidMoves`，继续用同一 RNG 重试，最多 100 次；超过则抛出不变量错误（测试应证明不可达）。

### 1.10 ASCII 记法（测试夹具、存档字段、调试转储共用）

- 每格一个记号，用空白分隔；每行一行文本，第 0 行在最上面。
- 作物字母：`C` 胡萝卜，`T` 番茄，`M` 玉米，`E` 茄子，`B` 蓝莓。
- 生长态数字：`0` 芽，`1` 青，`2` 熟。
- 可选特效后缀：`h` 横镰刀，`v` 竖镰刀，`d` 晨露珠。例如 `C2h`、`B1d`。
- 蜂群：`**`。
- 补位队列：用空格分隔的记号序列，例如 `M2 B2 M2`。
- 解析必须拒绝非法记号，并报告行号和列号；`print(parse(s))` 必须等于规范化（单空格分隔）后的 `s`。

```
T1 E0 B1 M2 T0 C2 E1
B0 C2 C0 C1 E1 **  M2
M1 T0 E2 B0 M0 T2h B1
...（共 7 行）
```

---

## 2. 生长态

### 2.1 三态定义与产出

| 生长态 | 值 | 外观（01 §13.3） | 可匹配 | 被收割时的产出 |
|---|---|---|---|---|
| 芽 Sprout | 0 | 缩放 0.55，只有叶和小芽苞 | 是 | 无 |
| 青 Unripe | 1 | 缩放 0.8，饱和度降低 35% | 是 | `economy.unripeDewdrop` 个露珠 |
| 熟 Ripe | 2 | 缩放 1.0，碟沿金边，轻微浮动 | 是 | 1 个该作物：先计入订单（订单需要且未交齐），否则计入余量 |

- 镰刀和晨露珠格按自身生长态产出（新生成时为 `growth.createdSpecialStage = 2`）。
- 蜂群格被收割时没有产出。
- 被授粉（∈ P）的格一律按“熟”产出。

### 2.2 生长来源总表

| 来源 | 时机 | 作用范围 | 变化量 | 阶段 |
|---|---|---|---|---|
| 邻格催熟 | 每个结算步，匹配组被收割后 | 匹配组各格的正交邻格，排除本步被收割的格和新特效位置 | +1 | VS |
| 晨露珠 | 被激活时 | 以自身为中心的 5×5 外圈（去掉中心 3×3） | +1 | VS |
| 晨露珠 + 晨露珠 | 组合 | 以 b 为中心的 7×7 外圈（去掉中心 5×5） | +1 | VS |
| 蜂群授粉 | 被激活时 | 目标作物的全部格 | 置为熟后立即收割 | MVP |
| 浇垄 | 照料 | 一整行 | +1 | VS |
| 过夜 | 入夜 | 全田 | +`overnight.growth` | VS |
| 补位 | 进场 | 新 tile | 按 `spawn.stageWeights` 抽取 | VS |

通用规则（必须）：

- 生长态上限为 2；**任何规则都不会降低生长态**（没有枯萎）。
- 局内同一步内每格最多 +1（`growth.maxPerStep = 1`），邻格催熟与晨露珠外圈不叠加。
- 蜂群格不受任何生长影响。
- 兜底开关 `growth.neighborRipen`：`'all'`（默认）/ `'sproutOnly'`（只把芽变青）/ `'off'`。

### 2.3 邻格催熟示例

片段（只画 `x = 0..4`、`y = 0..2`）。假设 `(1,1) (2,1) (3,1)` 的胡萝卜组成横向三连：

```
收割前                       生长后、重力前                 重力与补位后（s = 新补位）
y0: T1 E0 B1 M2 T0           y0: T1 E1 B2 M2 T0             y0: T1 s  s  s  T0
y1: B0 C2 C0 C1 E1    →      y1: B1 -- -- -- E2       →     y1: B1 E1 B2 M2 E2
y2: M1 T0 E2 B0 M0           y2: M1 T1 E2 B1 M0             y2: M1 T1 E2 B1 M0
```

- 产出：`C2` → 1 个胡萝卜；`C0` → 无；`C1` → 1 露珠。
- 生长：`(0,1) B0→B1`，`(4,1) E1→E2`，`(1,0) E0→E1`，`(2,0) B1→B2`，`(1,2) T0→T1`，`(3,2) B0→B1`；`(3,0) M2` 和 `(2,2) E2` 已到上限，不产生事件。
- 生长发生在重力之前，所以长大的 `E1`、`B2`、`M2` 随后才落下。

---

## 3. 特效

### 3.1 镰刀 Sickle（横 `sickleH` / 竖 `sickleV`）

- **生成**：`line4`，方向见 §1.4。
- **激活**：①作为匹配组的一员被收割；②位于其他特效的作用范围内；③参与组合交换。
- **效果**：收割所在整行（横）或整列（竖）的全部格子，包括其中的特效（会连锁激活）和蜂群（按“被波及”方式激活）。
- **生长**：无。镰刀只管割，所以用镰刀扫过一排芽就是浪费，这是时机决策的一部分。

### 3.2 晨露珠 Dew Orb（`dewOrb`）

- **生成**：`cross`。
- **激活**：同镰刀。
- **效果**：收割以自身为中心、半径 `special.dewOrbRadius = 1` 的 3×3 区域（超出边界的部分裁掉）。
- **生长**：切比雪夫距离恰为 `special.dewOrbRingRadius = 2` 的外圈作物格 +1。

### 3.3 蜂群 Bee Swarm（`{ kind: 'bee' }`）— MVP

- **生成**：`line5`。
- **激活与目标作物 X**：

| 激活方式 | 目标作物 X |
|---|---|
| 与非特效作物格交换 | 该格的作物 |
| 与镰刀、晨露珠或蜂群交换 | 走组合（§3.5） |
| 被其他特效波及（包括丰收时刻） | 出队时棋盘上（排除已在 H 中的格）格数最多的作物；平局取作物顺序靠前者；若已没有作物格则无效果 |

- **效果**：`P ∪= {所有作物为 X、且不在 H 中的格}`；`H ∪= P`。蜂群格本身被收割，没有产出。P 中的 X 特效格会连锁激活。
- **生长**：授粉，也就是 P 中的格按熟产出（产生一个 `pollinate` 事件，列出全部授粉格）。

### 3.4 连锁激活顺序（连锁闭包，必须确定）

```
queue = triggers（index 序）；activated = ∅
while queue 非空：
  s = queue.shift()                       // FIFO
  if s ∈ activated: continue；activated.add(s)
  (cells, ring, pollinated) = effect(s, board, H)   // 蜂群在出队时计算目标
  for c in cells（index 序）：
    if c ∉ H：H.add(c)；if tile(c) 是特效 且 c ∉ activated：queue.push(c)
  G_special ∪= ring；P ∪= pollinated
```

表现层按 BFS 层级依次播放，层与层之间间隔 `anim.chainDelay`。

### 3.5 组合表

组合中心固定为 **b**。两个被交换的特效格都会被消耗（属于 H0），作用范围超出棋盘的部分裁掉。

| 组合 | 效果 | 生长 | 阶段 |
|---|---|---|---|
| 镰刀 + 镰刀 | 收割 b 所在整行 + 整列（与两把镰刀各自的方向无关） | 无 | VS |
| 镰刀 + 晨露珠 | 收割 `y ∈ [by-1, by+1]` 的 3 整行，以及 `x ∈ [bx-1, bx+1]` 的 3 整列 | 无 | VS |
| 晨露珠 + 晨露珠 | 收割以 b 为中心的 5×5 | 7×7 外圈 +1 | VS |
| 蜂群 + 普通作物 X | X 全部授粉并收割（同 §3.3） | 授粉 | MVP |
| 蜂群 + 镰刀（作物 X） | 所有非特效的 X 作物格就地变为镰刀（`(x+y)` 为偶数得横，奇数得竖，**保留原生长态、不授粉**），然后所有 X 镰刀按 index 序依次激活（走连锁闭包） | 无 | MVP |
| 蜂群 + 晨露珠（作物 X） | 所有非特效的 X 作物格变为晨露珠（保留生长态），然后依次激活 | 各自外圈 +1 | MVP |
| 蜂群 + 蜂群 | 全盘作物格授粉，然后收割整盘 | 授粉 | MVP |

**设计意图**：“蜂群 + 作物”偏向订单（X 全部按熟交货），“蜂群 + 镰刀”偏向清盘（大面积收割，但按原生长态产出）。两者形成取舍。

---

## 4. 预演、回退与提示

### 4.1 预演 Preview

- **触发**：从 a 拖向相邻格 b，指针越过 `input.dragThresholdCell` 格（或 `input.dragThresholdPx` 像素，取先到者）；桌面端在点按模式下选中 a 后，悬停相邻格 b 也会触发。
- **计算**：`previewMove(run, move)` 是纯函数，**不推进 RNG，也不修改入参**。返回：
  - `valid` 与 `reason`（`'notAdjacent' | 'noMatch'`）；
  - `harvest[]`：`{ pos, uid, yield: 'crop' | 'dewdrop' | 'none', crop? }`；
  - `growth[]`：会发生生长态变化的格；
  - `created[]`：`{ pos, kind }`；
  - `triggered[]`：`{ pos, kind, area[] }`；
  - `pollinated[]`；
  - `delta`：`{ delivered: {crop: n}, surplus: {crop: n}, dewdrop: n }`。
- **范围**：只包括本手的**第一段**结算（有第 0 步时为第 0 步，否则为第 1 步）中重力之前的部分；**不预演重力、补位和级联**。级联是留给玩家的惊喜（00 D-27）。
- **精确性（必须）**：预演结果必须与 `applyMove` 第一段的实际结果完全相同（收割集合、产出、生长集合、生成的特效、触发的特效），由属性测试保证（04 P1-08）。
- **表现**：遵循 01 §13.3 RD-5 的层级；订单篮上显示灰色的 `+N` 预估。

### 4.2 回退 Undo

- 每次尝试 `undo.perRun = 1` 次。
- 快照 = 最近一次合法交换之前的完整 RunState（包括 rng、movesLeft、delivered、surplus、dewdropsEarned、统计数据）。只保留一层。
- 可用条件：run 处于 `idle` 状态、存在快照、`undoLeft > 0`、run 未结束、不在丰收时刻中。
- 效果：恢复快照；`undoLeft -= 1`（这个计数本身不被快照还原）；清空快照。
- 表现：不超过 `anim.undoRewind` 的回溯闪光后直接切到恢复后的状态。
- 由于回退会恢复 RNG，同一手会得到同样的补位结果。这是设计上接受的“侦察”，次数限制保证它不会被滥用。

### 4.3 提示 Hint

- idle 状态下持续 `hint.idleMs` 没有输入即显示；教程限定步期间不显示；任何输入都会清除提示。
- 选择规则（确定）：对每个合法交换计算
  `score = 100·[生成蜂群] + 60·[生成晨露珠] + 40·[生成镰刀] + 30·[组合] + 10·交货数 + 3·生长格数 + 1·收割格数`，
  取最高分；平局时依次比较 `a.index`、`b.index`，取较小者。
- 表现：两个格子轻轻摆动。

---

## 5. 委托

### 5.1 委托定义

```ts
type ClientId = 'amai' | 'meiyi' | 'laotao' | 'xiaotang';

interface CommissionDef {
  id: string;                                  // 'T1' | 'T2' | 'C01'..'C12' | 'P0001'..
  clientId: ClientId;
  tier: 1 | 2 | 3;
  items: { crop: CropId; count: number }[];    // 1–2 项（commission.maxItems）
  moves: number;
  isTutorial: boolean;
  dayExempt: boolean;                          // 完成后不结束当天（T1、T2）
  text: string;                                // 一句话文案
  fixture?: string;                            // 由 newHomestead 用来初始化田（仅 T1）；startRun 不读取此字段
  spawnQueue?: string;                         // 补位队列（仅 T1）
  guidedMoves?: { a: [number, number]; b: [number, number] }[];  // 教程限定步（仅 T1）
}
```

进行中的委托持久化为 `ActiveCommission`（§12.2），额外记录 `delivered`（跨尝试累计）和 `attempts`。

### 5.2 交货、余量与露珠结算

- **收割时**：
  - 熟作物（或被授粉的格），作物为 X：若订单含 X 且 `delivered[X] < count[X]`，则 `delivered[X] += 1`；否则 `surplus[X] += 1`。
  - 青作物：`dewdropsEarned += economy.unripeDewdrop`。
  - 芽、蜂群：无产出。
- **结算时的露珠**：

| 结果 | 露珠 |
|---|---|
| 胜利 | `dewdropsEarned + Σsurplus × economy.surplusPrice + economy.baseReward[tier] + economy.starBonus × (stars − 1)`；教程委托另加 `movesLeft × economy.tutorialMoveBonus`，但不显示星级 |
| 失败 / 放弃 | `dewdropsEarned + Σsurplus × economy.surplusPrice` |

- 丰收时刻的全部产出都计入 `surplus` 与 `dewdropsEarned`。
- 无论胜负，结算都会把终局棋盘写回田（§6）、把 `run.uidCounter` 写回 `home.uidCounter`（保证 uid 不重复），并更新统计。

### 5.3 胜负与部分交货

- **胜利**：一手结算完毕后，所有订单项都已交齐。
- **失败**：一手结算完毕后 `movesLeft == 0` 且未胜利。
- **放弃**：暂停菜单中选择“放弃委托”，按失败结算。
- **失败时（部分交货）**：`ActiveCommission.delivered` 更新为本次结束时的累计值；`attempts += 1`；委托保持进行中；田照常写回。
- **胜利时**：写入 `completed`（记录星级，attempts 含本次）；`active = null`；
  - `dayExempt = false`：当天阶段转为 `dusk`；
  - `dayExempt = true`：立即激活下一个委托，当天阶段不变。
- **对局中关闭标签页**：除开局时已保存的 `runCounter` 外不写任何数据；田保持开局前的状态。

### 5.4 星级

- `movesTotal = def.moves + modifiers.extraMoves`；`ratio = 胜利时（丰收时刻之前）的 movesLeft / movesTotal`。
- 首次尝试（`attempts == 0`）就胜利：`ratio ≥ stars.thresholds[1]` 得 3 星，`ratio ≥ stars.thresholds[0]` 得 2 星，否则 1 星。
- 非首次尝试才胜利：固定 1 星。
- 星级只带来 `economy.starBonus` 露珠，不解锁任何内容。

### 5.5 丰收时刻 Harvest Rush（MVP）

- **触发**：胜利，且不是教程委托。
- **转化**：`n = min(movesLeft, rush.maxConversions) + modifiers.rushBonus`。对 `i = 0..n-1`：候选 = 所有 `special == null` 的作物格；若没有候选则停止；用 RNG 均匀选一格，把它变为镰刀（i 为偶数得横，奇数得竖；保留 uid 与生长态），产生事件 `convert`（cause 为 `rush`）。
- **引爆循环**（最多 `rush.maxIterations` 轮）：取棋盘上全部特效格（index 序）；若没有则结束；否则把第一个按“被波及”方式激活 → 连锁闭包 → 产出（全部进入余量或露珠）→ 生长（晨露珠外圈）→ 重力 → 补位 → 普通级联循环（可能生成新特效）→ 进入下一轮。
- 引爆循环结束后，若棋盘没有可行步，按 §1.8 洗牌，保证写回田的棋盘始终有可行步。
- 结束后 `movesLeft = 0`，状态为 `won`；丰收时刻之后的棋盘写回田。
- **表现**：时间缩放 `anim.rushTimeScale`；点击可跳过（逻辑已经算完，直接显示总结）。

### 5.6 委托序列与程序化生成

- **手工序列**：`[T1, T2, C01, …, C12]`（§16.3）。`commissions.cursor` 指向下一个要激活的项。
- **激活时机**：新游戏时激活 T1；完成 `dayExempt` 委托后立即激活下一个；入夜时若 `active == null`，激活下一个。
- **程序化**（手工序列用完后；`seed = deriveSeed(home.seed, 'commission', generatedCount)`）：
  - `tier = 3`，`moves = commission.movesByTier[3]`；
  - `clientId = [amai, meiyi, laotao, xiaotang][generatedCount % 4]`；
  - 订单项数：RNG 抽取，1 项或 2 项各 50%；
  - 作物选择（不放回）：`w(c) = 1000 + 100 × 当前田中作物 c 的非芽格数`，让田的状态影响委托；
  - 数量：1 项时为 `[20, 26]` 均匀整数；2 项时每项 `[12, 18]`；
  - 文案：该客户的模板（§16.4），替换作物名；
  - `id = 'P' + 四位序号`；`generatedCount += 1`。

### 5.7 难度分级（占位，由 04 P1-26 / P2-23 校准）

| 档位 | 步数 | 订单总量 | 贪心 bot 胜率（不照料） | 贪心 bot 胜率（照料策略） |
|---|---|---|---|---|
| 1 | 24 | 10–14 | ≥ 90% | ≥ 95% |
| 2 | 22 | 14–20 | 75–85% | 85–95% |
| 3 | 20 | 20–32 | 60–75% | 75–90% |

---

## 6. 露台状态与一日循环

- **田 = 棋盘**：`HomesteadState.field` 保存 49 个 tile（ASCII 行 + uid 数组，§12.2）。开局时复制并合法化（§1.9）；结算时用终局棋盘整体覆盖。
- **地块层**：MVP 没有地块属性（位置本身就是地块）。数据模型预留：Post-MVP 加入肥力时，通过存档迁移新增 `plots` 字段，不改变 tile 结构。
- **阶段机**：

```
morning ──（完成一个 dayExempt=false 的委托）──▶ dusk
   ▲                                              │
   └──────────────（入夜）─────────────────────────┘      入夜在 morning 也可以执行
```

| 阶段 | 告示牌 | 照料 | 商店 | 入夜 |
|---|---|---|---|---|
| morning | 显示进行中的委托 | 可用（第 1 天从 G3 起） | 可用（第 1 天从 G5 起） | 可用（第 1 天在 C01 完成前或失败 2 次前不可用） |
| dusk | “明天再来”，不能开始委托 | 可用（有剩余照料点时） | 可用 | 可用 |

- **新游戏 `newHomestead(seed)`**：`day = 1`；`phase = morning`；田 = T1 夹具（uid 1..49）；`care.pointsLeft = care.pointsBase`（受教程闸门限制）；`wallet = 0`；没有装饰；`commissions.cursor` 指向 T2，`active = T1`；`runCounter = 0`；`uidCounter = 50`。
- **开局种子**：`runSeed = deriveSeed(home.seed, 'run', home.runCounter)`，然后 `runCounter += 1` 并立即存档（04 P1-10、P1-13）。

---

## 7. 过夜

```
sleep(home):
  前置：不处于教程闸门中（§11.1）
  按 index 序：每个作物格 stage = min(2, stage + overnight.growth)   → 产生 grow 事件列表（供晨醒动画使用）
  care = { pointsLeft: effectiveCarePointsMax(home), wateredRows: [], beeUsed: false }
  day += 1；phase = 'morning'
  若 commissions.active == null：激活下一个委托（§5.6）
  返回 { home', events }
```

- **存档时机**：先计算、先存档，再播放夜幕和晨醒动画。动画中途关闭页面不会丢失进度。
- **晨醒表现**：生长弹出按 `x` 从 0 到 6 依次错开（模拟日光扫过），总时长不超过 `anim.morningReveal`；结束后弹出委托卡；点击可跳过。
- **永不枯萎**：没有任何衰减。
- **晨露礼（Post-MVP，只定规格、不实现）**：载入存档时，若 `now − savedAt ≥ 8h` 且 `now ≥ savedAt`，则当天 `pointsLeft += 1`（每个自然日一次），露珠 +20，并显示“晨露礼”。`now < savedAt`（时钟回拨）时忽略。`savedAt` 已存在于 v1 存档中，所以将来加入时不需要迁移。

---

## 8. 照料

- **照料点**：`effectiveCarePointsMax = care.pointsBase + Σ装饰 carePointsMax`。入夜时回满，不累积到第二天。
- **动词**：

| 动词 | 解锁 | 花费 | 目标 | 效果 | 限制 |
|---|---|---|---|---|---|
| 浇垄 Water a Row | 第 1 天 T2 之后 | 1 | 一行 `y ∈ [0, 6]` | 该行所有作物格 +1（上限 2）；蜂群不受影响 | 每行每天 1 次（`care.waterOncePerRowPerDay`） |
| 放蜂 Release Bees | 拥有蜂箱 | 1 | 一个 `special == null` 的作物格 | 该格替换为新的蜂群格（新 uid） | 每天 `care.beePerDay` 次 |

- **校验**：照料点足够；浇垄的行今天没浇过；放蜂今天还没用过，且目标是非特效作物格。校验失败则不产生任何效果，并返回原因（例如 `'noPoints' | 'rowWatered' | 'beeUsed' | 'badTarget'`）。
- 如果要浇的行已经全熟，界面提示“这一行都已经熟了”，但允许继续。
- 放蜂不会制造匹配（蜂群截断连线），所以不破坏 §1.9 的不变量。
- 每次照料成功后立即存档；返回 `grow` / `beePlaced` 事件，供表现层播放。

---

## 9. 装饰与露台等级

```ts
type DecorEffect =
  | { type: 'extraMoves'; value: number }
  | { type: 'unlockCare'; value: 'bee' }
  | { type: 'carePointsMax'; value: number }
  | { type: 'rushBonus'; value: number };

interface DecorDef {
  id: DecorId;
  name: string;
  price: number;
  level: 1 | 2 | 3;           // 露台达到该等级后才可购买
  effect: DecorEffect | null;
  spot: string;               // 场景中的挂点名（03 §14）
  blurb: string;
}
```

- **有效修正** `effectiveModifiers(home)`：对已拥有装饰的效果求和，得到 `{ extraMoves, carePointsMax, rushBonus, careVerbs }`。
- **露台等级**：`L = 1 + [owned ≥ terrace.levelThresholds[0]] + [owned ≥ terrace.levelThresholds[1]]`，阈值为 `[3, 6]`。
- **购买**：可购买（`def.level ≤ L`）、未拥有、露珠足够 → 加入拥有列表，扣除露珠，立即存档。若等级因此提升，产生 `terraceLevelUp` 事件。
- **摆放**：购买后自动出现在 `spot`；MVP 不支持移动。
- 8 件装饰的具体数据见 §16.2。

---

## 10. 经济

- **唯一货币**：露珠（Dewdrop），整数，≥ 0。

| 来源 | 数量 |
|---|---|
| 收割青作物 | 每个 `economy.unripeDewdrop` |
| 余量熟作物（结算时卖出） | 每个 `economy.surplusPrice` |
| 委托胜利基础奖励 | `economy.baseReward[tier]` |
| 星级奖励 | `economy.starBonus × (stars − 1)` |
| 教程剩余步数 | 每步 `economy.tutorialMoveBonus` |

| 去处 | 数量 |
|---|---|
| 装饰 | §16.2 |

- **定价流程**（04 P2-23 执行）：
  1. 运行 `pnpm sim --mode campaign --bot greedy --care waterOrdered --runs 500`，取 C01–C08 每场委托露珠收入的中位数，记为 E。
  2. `price_i = roundTo10(target_i × E)`，其中 `target`（以“场委托”计）为：风铃 0.8，陶土花盆 1.0，亚麻遮阳帘 1.5，木长椅 1.6，蜂箱 2.0，小水渠 2.5，玻璃挂饰 2.6，露水灯 3.0（合计 15.0）。
  3. 校验累计收入曲线是否满足 01 §12 的进度目标（第 1 场委托后买得起风铃；约第 3 场后买得起蜂箱；约第 14 场集齐）。教程 T1、T2 的收入约相当于 1 场委托，所以目标合计 15.0 对应约第 14 场正式委托。
- **占位价格**（按 E = 150 估算）见 §16.2。MVP 只有一个消耗口，所以不设通胀控制；Post-MVP 的料理会增加消耗口。

---

## 11. 教程与情境提示

### 11.1 第 1 天闸门

| 闸门 | 可用功能 | 进入下一闸门的条件 |
|---|---|---|
| G0 · T1 | 只有对局；3 个引导步限定只能走高亮的交换 | T1 胜利（必胜：第 3 步交齐） |
| G1 · 露台 | 只能打开委托（T2）；显示 `tip.fieldMemory` | 开始 T2 |
| G2 · T2 | 自由对局；开启情境提示 | T2 胜利；或 T2 失败 2 次（`tutorial.autoCompleteAfterFails`）后自动完成，记 1 星，客户说“够用了，谢谢！” |
| G3 · 露台 | 先展示 C01 委托卡（只读），然后进入强制浇垄引导（只有浇垄可点） | 完成 1 次浇垄 |
| G4 · 露台 / 对局 | 委托（C01）、剩余照料 | C01 胜利；或 C01 失败 2 次（解锁入夜并显示 `tip.firstFail`） |
| G5 · 暮 | 商店（`tip.shop`）、入夜（`tip.sleep`） | 入夜 |
| done | 全部功能 | — |

### 11.2 T1“第一篮”（手工夹具，已用脚本验证）

- 订单：胡萝卜 ×10；步数 10；`isTutorial = true`；`dayExempt = true`；4 种作物；全部为熟。
- **夹具**（新游戏时就是初始的田）：

```
T2 M2 B2 T2 M2 B2 T2
M2 B2 T2 M2 B2 T2 M2
B2 T2 C2 B2 T2 M2 B2
C2 C2 M2 C2 M2 B2 T2
M2 B2 C2 M2 B2 T2 M2
B2 T2 M2 C2 T2 M2 C2
T2 M2 B2 T2 C2 C2 T2
```

- **补位队列**：`M2 B2 M2 M2 T2 T2`（恰好在前两步用完；此后按正常规则随机补位）。
- **引导步**（格式为 a → b，a 是被拖动的格）与预期结果（04 P1-23 的测试断言）：

| 步 | 交换 | 结果 | 累计交货 |
|---|---|---|---|
| 1 | (6,5) → (6,6) | 第 6 行 x=4..6 胡萝卜三连；无级联；消耗队列 `M2 B2 M2`（第 4、5、6 列） | 3 |
| 2 | (2,2) → (2,3) | 第 3 行 x=0..3 胡萝卜四连 → 在 (2,3) 生成**横镰刀**；无级联；消耗队列 `M2 T2 T2`（第 0、1、3 列） | 7 |
| 3 | (3,5) → (2,5) | 第 2 列 y=3..5 三连（含镰刀）→ 镰刀收整个第 3 行（第 1 段共收 9 格）；随后必然出现第 2 段，且包含第 3 列玉米 y=3..5。多数种子下还会出现第 3 段（第 3 列番茄 y=4..6），但第 2 列的随机补位可能在第 2 段就与 (3,1) 的番茄组成交叉组，因此第 3 段**不是**与种子无关的事实（勘误见 00 D-26）。测试只断言：第 1 段 9 格、第 2 段含该玉米组、累计交货 10、胜利 | 10 → 胜利 |

- **第 2 步后的预期棋盘**：

```
M2 T2 B2 T2 M2 B2 M2
T2 M2 T2 T2 M2 B2 T2
M2 B2 M2 M2 B2 T2 M2
B2 T2 C2h B2 T2 M2 B2
M2 B2 C2 M2 M2 B2 T2
B2 T2 M2 C2 B2 T2 M2
T2 M2 B2 T2 T2 M2 T2
```

- 教程委托不触发丰收时刻，改为剩余 7 步 × `economy.tutorialMoveBonus` 露珠。
- 首个特效出现在第 2 步，约在首次输入后 20–45 秒（即开局后约 45–75 秒，见 01 §11），满足 S1 的 90 秒要求。

### 11.3 T2“看熟了再收”

- 订单：番茄 ×8；步数 14；`isTutorial = true`；`dayExempt = true`；在当前的田（即 T1 终局）上进行，不使用夹具。
- 开局显示 `tip.onlyRipe` 与 `tip.preview`；对局中按事件触发情境提示（§16.5）。
- 目标胜率 ≥ 95%（由模拟校准步数）。

### 11.4 C01

- 订单：胡萝卜 ×10；24 步；1 档。开始前必须完成 G3 的引导浇垄；引导文案会高亮“胡萝卜非熟格最多的一行”（由 `pickWaterRowHint(field, crop)` 计算，平局取 y 较大者）。

### 11.5 教程步骤数据格式

```ts
interface TutorialStep {
  id: string;                                   // 'G0'..'G5'
  gate: { allow: HubAction[] };                 // 'openCommission' | 'water' | 'bee' | 'shop' | 'sleep' | 'photo'
  guide?: { target: GuideTarget; tipId: string; guidedMove?: { a: [number, number]; b: [number, number] } };
  completeOn: { event: string; commissionId?: string; result?: 'won' | 'lost'; count?: number }[]; // 满足任一即完成
}
```

情境提示（`tip.*`）在每个存档中只显示一次，已显示的记录在 `tutorial.seenTips` 中。

---

## 12. 存档模型

### 12.1 存储键

| 键 | 内容 |
|---|---|
| `dewfield:save:v1` | 当前存档（`SaveFileV1`） |
| `dewfield:save:v1:bak` | 上一份有效存档 |
| `dewfield:save:corrupt:<ts>` | 无法读取的原始字符串（保留，供导出排查） |
| `dewfield:settings` | 设置（独立于存档，重置存档不会清掉） |
| `dewfield:telemetry` | 遥测环形缓冲（最多 5000 条） |
| `dewfield:lock` | 多标签页锁 `{ tabId, ts }` |

### 12.2 类型草案（zod schema 与之一一对应，见 03 §12）

```ts
type DecorId = 'windChime' | 'planters' | 'awning' | 'beehive' | 'bench' | 'irrigation' | 'glassMobile' | 'dewLanterns';
type DayPhase = 'morning' | 'dusk';

interface SaveFileV1 {
  schemaVersion: 1;
  savedAt: number;                 // epoch ms，由 platform 层传入
  build: string;                   // 写入时的构建版本
  homestead: HomesteadState;
}

interface HomesteadState {
  seed: number;                    // uint32
  day: number;                     // ≥ 1
  phase: DayPhase;
  field: FieldState;
  care: CareState;
  wallet: { dewdrop: number };
  decor: { owned: DecorId[] };
  commissions: CommissionBook;
  tutorial: TutorialState;
  stats: LifetimeStats;
  runCounter: number;
  uidCounter: number;
}

interface FieldState {
  rows: string[];                  // 7 行 ASCII（§1.10）
  uids: number[];                  // 49 个，行优先
}

interface CareState {
  pointsLeft: number;
  wateredRows: number[];
  beeUsed: boolean;
}

interface CommissionBook {
  cursor: number;                  // 手工序列中下一个的下标
  generatedCount: number;
  active: ActiveCommission | null;
  completed: CompletedCommission[];   // 只保留最近 100 条
}

interface ActiveCommission {
  id: string;
  clientId: ClientId;
  tier: 1 | 2 | 3;
  items: { crop: CropId; count: number }[];
  moves: number;                   // 基础步数，不含装饰加成
  isTutorial: boolean;
  dayExempt: boolean;
  text: string;
  delivered: Partial<Record<CropId, number>>;
  attempts: number;                // 已失败或放弃的次数
}

interface CompletedCommission { id: string; day: number; stars: 1 | 2 | 3; attempts: number }

interface TutorialState { done: boolean; completedSteps: string[]; seenTips: string[] }

interface LifetimeStats {
  harvested: Record<CropId, number>;          // 熟作物累计
  specialsCreated: Record<SpecialKind, number>;
  combos: number;
  commissionsCompleted: number;
  maxCascadeDepth: number;
  playMs: number;
}

interface SettingsV1 {
  schemaVersion: 1;
  volume: { master: number; music: number; sfx: number };   // 0..1
  reducedMotion: boolean;
  quality: 'auto' | 'high' | 'low';
}
```

### 12.3 不变量（由 zod refine 与测试共同保证）

- `field.rows` 恰好 7 行，每行 7 个合法记号；`uids` 长度为 49、互不重复，且都小于 `uidCounter`。
- `day ≥ 1`；`dewdrop`、`pointsLeft`、`runCounter` 都是非负整数。
- `wateredRows` 中的值互不重复，且都在 `[0, 6]` 内；`decor.owned` 互不重复且都是合法 id。
- 对 `active` 的每个订单项：`delivered[crop] ≤ count`。
- 田中没有匹配组（加载后校验；违反时记录 `legalize_fix`，并按 §1.9 修复）。

### 12.4 写入时机（只在安全点写，绝不在一手结算中途写）

新游戏；开局（`runCounter + 1`）；结算；每次照料；购买；入夜（在播放动画之前）；教程闸门推进；设置变更（写设置键）。`seenTips` 随下一次写入一起保存。

### 12.5 读取流程

读取主键 → `JSON.parse` → 按 `schemaVersion` 逐版迁移到当前版本 → zod 校验 → 成功。
失败则改读备份键，走同样流程。备份也失败：把主键原文存到 `dewfield:save:corrupt:<ts>`，开始新游戏，并提示“存档无法读取，已开始新的露台（旧档已保留，可在设置中导出）”。

### 12.6 写入流程

序列化 → zod 校验 → 把当前主键内容复制到备份键 → 写主键。写入时遇到 `QuotaExceededError` 或 localStorage 不可用：切换到内存存储，并提示“本次进度无法保存”。

### 12.7 迁移

`migrations: Record<number, (s: unknown) => unknown>`，第 n 项把版本 n 升到 n+1。每个版本都要保留一份夹具存档并编写迁移测试；已发布的迁移永远不删。

### 12.8 多标签页

启动时写入 `dewfield:lock = { tabId, ts }`，并监听 `storage` 事件：若其他标签页写入了存档或更新的锁，本页显示“游戏已在另一个标签页打开”遮罩，并停止一切写入。

### 12.9 会话态（不持久化）

```ts
interface RunState {
  commission: ActiveCommission;              // 开局时的快照
  board: Board;                              // 03 §5.2
  rng: RngState;                             // 4 个 uint32
  movesTotal: number;                        // commission.moves + modifiers.extraMoves
  movesLeft: number;
  delivered: Partial<Record<CropId, number>>;   // 累计，含以前的尝试
  surplus: Partial<Record<CropId, number>>;
  dewdropsEarned: number;
  undoLeft: number;
  undoSnapshot: Omit<RunState, 'undoSnapshot' | 'undoLeft'> | null;
  spawnQueue: string[];
  status: 'playing' | 'won' | 'lost';
  modifiers: { extraMoves: number; rushBonus: number };
  stats: { moves: number; maxCascadeDepth: number; specialsCreated: Record<SpecialKind, number>; combos: number };
  uidCounter: number;
  moveIndex: number;
}
```

---

## 13. 事件模型与遥测

### 13.1 棋盘事件（渲染契约）

`applyMove`、`careWaterRow`、`carePlaceBee`、`sleep`、`harvestRush` 都返回有序事件数组，TS 定义见 03 §5.4。语义要求：**从初始状态出发、只依据事件就能重放出最终棋盘**（04 P0-09 的测试会断言这一点）。

### 13.2 遥测事件（只存本地）

| 事件 | 触发时机 | 字段 |
|---|---|---|
| `session_start` | 启动 | `build, ua, dpr, quality, w, h` |
| `tutorial_step` | 闸门推进 | `step` |
| `tip_shown` | 显示情境提示 | `tip` |
| `run_start` | 开局 | `commissionId, attempt, day, runSeed, fieldRipe, fieldUnripe` |
| `first_input` | 每局第一次棋盘输入 | `msSinceRunStart` |
| `move` | 每次合法交换结算后 | `i, harvested, ripe, unripe, sprout, depth, created（逗号分隔）, previewMs` |
| `swap_rejected` | 非法交换 | `i` |
| `special_created` | 生成特效 | `kind, moveIndex, msSinceFirstInput` |
| `special_activated` | 特效激活 | `kind, via: match / chain / combo / swap / rush` |
| `combo` | 组合 | `a, b` |
| `undo` / `hint_shown` / `shuffle` | 对应动作 | `moveIndex` |
| `run_end` | 结算 | `result: won / lost / abandoned, movesLeft, stars, deliveredTotal, surplusTotal, dewdrops, durationMs` |
| `care` | 照料成功 | `verb, target, day, phase, prompted（是否由教程引导）` |
| `hub_inspect` | 在露台点田格或按住明早预览 | `kind` |
| `sleep` | 入夜 | `day, careUnused` |
| `purchase` | 购买 | `decorId, price, day` |
| `photo` / `settings_change` / `legalize_fix` | 对应动作 | 相关字段 |
| `choreo_mismatch` | 编排一致性断言失败（03 §9.6） | `moveIndex, count` |
| `bench_result` | `?bench=1` 结束 | `avgMs, p95Ms, dpr, quality` |

### 13.3 KPI 定义（`tools/kpi` 计算）

| KPI | 定义 |
|---|---|
| K1a | T1 中 `special_created.msSinceFirstInput` 的首个值 |
| K1b | C01 首次尝试中 `special_created.msSinceFirstInput` 的首个值 |
| K2 | 在 C02 的 `run_start` 之前，存在 `care.prompted = false` 的会话占比 |
| K3 | 每次 `run_start` 前连续停留在露台的时长（中位数） |
| K4 | 各委托的胜率与平均尝试次数 |
| K5 | 每天的照料次数，以及入夜时未用照料点的分布 |
| K6 | 预演使用率（`previewMs > 300` 的手所占比例）与回退使用率 |

### 13.4 隐私

遥测只保存在本地，不发起任何网络请求，不采集个人信息；只有玩家在调试面板手动导出时才会离开本机。

---

## 14. 调参表（Tunables）

> 代码中的唯一来源：`src/core/config/tunables.ts`。修改默认值时必须同步修改本表，并附上模拟报告链接。

| 键 | 默认值 | 可调范围 | 说明 |
|---|---|---|---|
| `board.width` / `board.height` | 7 / 7 | 固定 | 与田绑定 |
| `board.minValidMoves` | 3 | 1–6 | 生成和洗牌后的最少可行步 |
| `board.shuffleMaxAttempts` | 50 | 10–200 | 洗牌的最大尝试次数 |
| `spawn.stageWeights` | `[0.7, 0.3, 0.0]` | 各项 0–1，和为 1 | 补位的芽 / 青 / 熟比例 |
| `spawn.orderBias` | 0.25 | 0–1 | 订单仍需要的作物的额外补位权重 |
| `growth.neighborRipen` | `'all'` | `all` / `sproutOnly` / `off` | 邻格催熟兜底开关 |
| `growth.maxPerStep` | 1 | 固定 | 同一步内每格的最大生长 |
| `growth.createdSpecialStage` | 2 | 1–2 | 新特效格的生长态 |
| `special.sickleOrientation` | `'parallel'` | `parallel` / `perpendicular` | 镰刀方向规则 |
| `special.beeEnabled` | true | true / false | 阶段开关；VS 阶段为 false（§1.4） |
| `special.dewOrbRadius` | 1 | 固定 | 3×3 |
| `special.dewOrbRingRadius` | 2 | 固定 | 5×5 外圈 |
| `commission.movesByTier` | `{1:24, 2:22, 3:20}` | 14–30 | 各档步数 |
| `commission.maxItems` | 2 | 1–2 | 订单项上限 |
| `stars.thresholds` | `[0.2, 0.4]` | 0–1 | 2 星 / 3 星的剩余步数比例 |
| `undo.perRun` | 1 | 0–3 | 每次尝试可回退次数 |
| `hint.idleMs` | 8000 | 4000–15000 | 提示出现前的闲置时间 |
| `rush.maxConversions` | 12 | 0–20 | 丰收时刻最多转化的镰刀数 |
| `rush.maxIterations` | 30 | 固定 | 引爆循环的安全上限 |
| `economy.unripeDewdrop` | 1 | 0–3 | |
| `economy.surplusPrice` | 2 | 1–5 | |
| `economy.baseReward` | `{1:40, 2:50, 3:60}` | — | |
| `economy.starBonus` | 10 | 0–30 | |
| `economy.tutorialMoveBonus` | 5 | 0–10 | |
| `care.pointsBase` | 3 | 2–5 | |
| `care.waterOncePerRowPerDay` | true | — | |
| `care.beePerDay` | 1 | 0–2 | |
| `overnight.growth` | 1 | 1–2 | |
| `terrace.levelThresholds` | `[3, 6]` | — | |
| `tutorial.autoCompleteAfterFails` | 2 | 1–3 | |
| `input.dragThresholdCell` | 0.35 | 0.2–0.6 | 拖动判定距离（格） |
| `input.dragThresholdPx` | 12 | 6–24 | 拖动判定距离（像素） |
| `anim.swap` | 140 | ms | 交换 |
| `anim.swapRejected` | 180 | ms | 非法交换来回 |
| `anim.matchFlash` | 80 | ms | 匹配闪光 |
| `anim.harvestPop` | 180 | ms | 收割弹出 |
| `anim.yieldFly` | 400 | ms | 产出飞向订单篮（不阻塞后续动画） |
| `anim.grow` / `anim.growStagger` | 160 / 20 | ms | 生长弹出 / 错开 |
| `anim.fallPerCell` / `anim.fallColumnStagger` | 55 / 15 | ms | 每格下落 / 列间错开 |
| `anim.spawnPop` | 160 | ms | 新格进场 |
| `anim.cascadeGap` | 70 | ms | 级联段间隔 |
| `anim.specialTelegraph` | 120 | ms | 特效范围预警（≥ 120） |
| `anim.chainDelay` | 90 | ms | 连锁 BFS 层间隔 |
| `anim.sickleSweep` / `anim.dewBurst` / `anim.beeFlight` | 320 / 380 / 600 | ms | 特效时长 |
| `anim.rushConvertStagger` | 80 | ms | 丰收时刻逐个转化 |
| `anim.cameraTransition` | 1200 | ms | 同田转场 |
| `anim.hudCrossfade` | 300 | ms | HUD 淡入淡出 |
| `anim.nightFade` | 1500 | ms | 夜幕 |
| `anim.morningReveal` | 2500 | ms | 晨醒总时长上限 |
| `anim.undoRewind` | 300 | ms | 回退闪光 |
| `anim.fastForwardScale` | 3 | 1–5 | 结算中点击后的加速倍数 |
| `anim.rushTimeScale` | 1.5 | 1–3 | 丰收时刻播放倍速 |
| `anim.reducedMotionScale` | 1.5 | 1–2 | 减弱动效时的倍速 |
| `render.dprMax` | 2 | 1–2 | |
| `render.particlesMax` | 300 | 100–600 | |
| `audio.cascadeMaxSteps` | 8 | — | 级联音阶最高层数 |

---

## 15. 平衡目标与模拟规格

### 15.1 目标与 CI 守卫阈值

守卫测试固定使用 200 个种子运行，结果是确定的；阈值比目标略宽，用于捕捉回归。

| 指标 | 目标 | CI 守卫阈值 |
|---|---|---|
| 静止盘的平均可行步 | ≥ 5 | ≥ 4.5 |
| 可行步 ≤ 2 的静止盘比例 | ≤ 10% | ≤ 15% |
| 每 25 手的洗牌次数 | ≤ 1 | ≤ 1.5 |
| 贪心 bot 每手生成特效数 | ≥ 0.18 | ≥ 0.15 |
| 贪心 bot 前 10 手内出特效的概率 | ≥ 90% | ≥ 85% |
| 每手平均级联深度 | ≥ 1.3 | ≥ 1.2 |
| 级联深度 ≥ 3 的手所占比例 | ≥ 10% | ≥ 8% |
| 委托胜率（贪心，不照料） | 见 §5.7 | 1 档 ≥ 85% |
| 照料策略带来的胜率提升（2、3 档） | +10–20 个百分点 | ≥ +5 个百分点 |
| 随机 bot 在 1 档的胜率（休闲下限） | ≥ 50% | ≥ 40% |

### 15.2 Bot

- `random`：在合法交换中均匀随机选择（使用模拟器自己的 RNG）。
- `greedy`：取 §4.3 提示分数最高的交换（通过 `previewMove` 计算），平局规则相同。

### 15.3 照料策略（战役模式）

- `none`：不照料。
- `waterOrdered`：用完照料点，每次浇“订单作物非熟格数”最多的一行（平局取 y 较大者）；若已解锁放蜂，把蜂群放在“与订单作物相邻格数”最多的非特效格上（平局取 index 较小者）。

### 15.4 模式

- `single`：`--commission <id> --field generated --fieldStages 0.3,0.4,0.3 --runs N`，用给定的生长态分布生成田，重复运行 N 个种子。
- `campaign`：从 `newHomestead` 开始跑完 T1（按脚本）、T2 到 C12，外加 `--extra K` 个程序化委托。bot 负责全部对局；失败最多重试 3 次，之后入夜；非豁免委托完成后入夜；购买策略为“买得起的最便宜装饰”。输出各委托的胜率、尝试次数、收入、每天的累计露珠、每件装饰的购买日。

### 15.5 输出与性能

- 输出 Markdown 表格与 JSON（`--out`）；给定 `--seed` 时结果完全确定。
- 在开发机上运行 2000 局 `single` 模式应少于 60 秒。

### 15.6 调参杠杆（按优先顺序）

`spawn.orderBias` → 委托数量与步数 → `spawn.stageWeights` → `overnight.growth` → `care.pointsBase` → （最后手段）`growth.neighborRipen` → （不可调）棋盘尺寸。

---

## 16. 内容表（MVP）

### 16.1 作物

| id | 中文 | ASCII | 顺序 | 熟色 | 剪影 |
|---|---|---|---|---|---|
| carrot | 胡萝卜 | C | 0 | `#E8894A` | 倒锥 + 叶簇 |
| tomato | 番茄 | T | 1 | `#D2553F` | 扁球 + 星形萼 |
| corn | 玉米 | M | 2 | `#E3BE4F` | 高柱穗 + 包叶 |
| eggplant | 茄子 | E | 3 | `#7B5BA6` | 弯水滴 |
| blueberry | 蓝莓 | B | 4 | `#4E78C4` | 三颗小球簇 |

### 16.2 装饰（价格已按 §10 流程校准：E = 255，见 `docs/balance/MVP-report.md`）

| id | 名称 | 价格 | 等级 | 效果 | 挂点 spot | 文案 |
|---|---|---|---|---|---|---|
| windChime | 风铃 | 200 | 1 | `extraMoves +1` | `spot_door_left` | 风一吹，市集的人愿意多等你一步。 |
| planters | 陶土花盆 | 260 | 1 | — | `spot_field_corners` | 田四角的小陶盆，种着薄荷。 |
| awning | 亚麻遮阳帘 | 380 | 1 | — | `spot_entrance` | 午后的光变得软软的。 |
| beehive | 蜂箱 | 510 | 1 | `unlockCare: bee` | `spot_field_left` | 解锁照料「放蜂」。 |
| bench | 木长椅 | 410 | 2 | — | `spot_front_right` | 坐下来看看你的田。 |
| irrigation | 小水渠 | 640 | 2 | `carePointsMax +1` | `spot_field_edge` | 每天多 1 次照料。 |
| glassMobile | 玻璃挂饰 | 660 | 3 | — | `spot_dome_center` | 晨光穿过时会在地上画彩虹。 |
| dewLanterns | 露水灯 | 770 | 3 | `rushBonus +2` | `spot_frame_lights` | 丰收时刻多 2 把镰刀。 |

### 16.3 委托序列（已按模拟校准，见 `docs/balance/VS-report.md`、`MVP-report.md`；00 D-35）

| id | 客户 | 订单 | 步数 | 档位 | 标记 | 文案 |
|---|---|---|---|---|---|---|
| T1 | amai | 胡萝卜 ×10 | 10 | 1 | 教程、豁免、夹具 | 第一篮胡萝卜，帮我挑 10 个熟的！ |
| T2 | laotao | 番茄 ×8 | 14 | 1 | 教程、豁免 | 熬汤要 8 个熟番茄，青的可不行哦。 |
| C01 | amai | 胡萝卜 ×10 | 24 | 1 | — | 胡萝卜面包今天限量，还要 10 个熟胡萝卜。 |
| C02 | meiyi | 蓝莓 ×12 | 24 | 1 | — | 果酱开锅了，12 个熟蓝莓，拜托啦。 |
| C03 | laotao | 番茄 ×8 + 胡萝卜 ×6 | 24 | 1 | — | 罗宋汤：番茄 8 个，胡萝卜 6 个。 |
| C04 | xiaotang | 玉米 ×18 | 22 | 2 | — | 玉米布丁要 18 根熟玉米！ |
| C05 | amai | 茄子 ×12 + 番茄 ×8 | 15 | 2 | — | 烤茄子番茄挞：茄子 12，番茄 8。 |
| C06 | meiyi | 蓝莓 ×19 | 22 | 2 | — | 蓝莓季到啦，19 个熟蓝莓。 |
| C07 | laotao | 胡萝卜 ×12 + 玉米 ×10 | 16 | 2 | — | 夏日杂菜汤：胡萝卜 12，玉米 10。 |
| C08 | xiaotang | 番茄 ×18 | 22 | 2 | — | 番茄糖渍要 18 个熟番茄！ |
| C09 | amai | 茄子 ×17 + 蓝莓 ×14 | 20 | 3 | — | 紫色面包节：茄子 17，蓝莓 14。 |
| C10 | meiyi | 玉米 ×18 + 番茄 ×13 | 20 | 3 | — | 玉米番茄酱：玉米 18，番茄 13。 |
| C11 | laotao | 胡萝卜 ×20 | 20 | 3 | — | 一大锅胡萝卜浓汤，20 个熟胡萝卜。 |
| C12 | xiaotang | 茄子 ×16 + 玉米 ×16 | 19 | 3 | — | 市集节甜品台：茄子 16，玉米 16！ |

### 16.4 客户与程序化文案模板

| id | 名字 | 店 | 语气 | 模板（`{a}` `{b}` 为作物，`{n}` `{m}` 为数量） |
|---|---|---|---|---|
| amai | 阿麦 | 面包房 | 爽朗、说话快 | “今天的新面包要{a}{n}个！” / “{a}{n}、{b}{m}，拜托啦！” |
| meiyi | 莓姨 | 果酱铺 | 温柔、爱唠叨 | “熬一锅{a}酱，要{n}个熟透的。” / “{a}{n}个、{b}{m}个，慢慢来不着急。” |
| laotao | 老陶 | 汤馆 | 慢性子、讲究 | “汤底要{a}{n}个，得是熟的。” / “{a}{n}，{b}{m}，火候不等人。” |
| xiaotang | 小糖 | 甜品站 | 年轻、爱用感叹号 | “新品要{a}{n}个！” / “{a}{n}+{b}{m}，冲！” |

### 16.5 情境提示

| id | 触发 | 文案 |
|---|---|---|
| `tip.fieldMemory` | T1 结算后首次进入露台 | 收过的地方长出了新芽，这块田会记得你。 |
| `tip.onlyRipe` | 打开 T2 委托卡 | 只有「熟」的作物才能交货；芽和青也能消，只是不算数。 |
| `tip.preview` | T2 开局 | 按住拖动可以预览结果，拖回原处就取消；每局还能回退一步。 |
| `tip.sproutHarvest` | 首次收割到芽 | 芽还没长成，收了不算数。 |
| `tip.neighborRipen` | 首次出现 grow 事件（对局中） | 消除会让相邻的作物长大一格。先催熟，再收割！ |
| `tip.dewOrb` | 首次生成晨露珠 | L/T 形消除结出了晨露珠：收割 3×3，还会让外面一圈长大。 |
| `tip.bee` | 首次生成或放置蜂群 | 蜂群：和任意作物交换，那种作物会全部授粉成熟并被收割。 |
| `tip.combo` | 棋盘上首次出现两个相邻的特效 | 把两个特效换到一起，会合成更强的效果。 |
| `tip.shuffle` | 首次洗牌 | 没有能走的步了，田里重新排了排。 |
| `tip.firstFail` | 首次失败 | 没关系，交了的都算数。回露台照料一下，明天再来会更容易。 |
| `tip.care` | G3 引导浇垄 | 早上先看委托：{client}要{crop}。找{crop}多的一行浇一浇，它们马上就会长大。 |
| `tip.rush` | 首次丰收时刻 | 委托完成！剩下的步数变成了镰刀，丰收时刻！ |
| `tip.shop` | 第 1 天进入暮 | 市集收工了。用露珠给露台添点东西吧。 |
| `tip.sleep` | `tip.shop` 关闭后 | 累了就入夜吧。一夜过去，所有作物都会长大一格。 |
| `tip.morning` | 第 2 天晨醒后 | 新的一天！先看看今天的委托，再决定浇哪一垄。 |
| `tip.levelUp` | 首次露台升级 | 露台升级了！新的装饰可以买了。 |
