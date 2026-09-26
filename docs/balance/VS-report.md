# VS 数值报告（P1-26）

> 由 `pnpm sim` 生成（`tools/sim`，02 §15）。原始仿真输出未包含在 transcript 可回放产物中；请本地运行：

```bash
pnpm sim --mode single --bot greedy --commission C01 --runs 300 --seed 1 --vs
pnpm sim --mode campaign --bot greedy --care waterOrdered --runs 150 --seed 3
```

调参结论摘要见 `docs/05-TASK-CHECKLIST.md` 与 README「当前状态」。委托数量/步数调参已写入 `src/core/config/commissions.ts`。
