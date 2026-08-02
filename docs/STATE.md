# aim2motec-web — 真相源

> 本 repo 的**唯一**状态与待办来源。别处只能链接过来，不许另起清单。
> 最后更新：2026-08-03（首次建立，状态经实跑核对）

## 现在是什么状态

- **能跑吗**：能。`npm test` → **3 files / 26 tests passed**（2026-08-03 实跑）
- **跑在哪**：
  - GitHub Pages **已上线**：<https://cyprien0312.github.io/aim2motec/> → HTTP 200（2026-08-03 实测）
  - 仓库 <https://github.com/cyprien0312/aim2motec>（注意仓库名是 `aim2motec`，本地目录叫 `aim2motec-web`）
  - 无定时任务
- **上次动它**：2026-07-13，`Archive every upload to Supabase (storage + metadata row)`
- **git**：`main`，与 origin 同步，工作区干净

## 待办

| 优先级 | 事项 | 不做会怎样 |
|---|---|---|
| P1 | 依赖 `aim-xrk`：memory 里记的是「等用户republish 后升到 ^0.1.1」。npm 上 **0.1.1 已是 latest**（2026-08-03 实测），需确认 `package.json` 是否已跟上 | 线上跑的还是带 Node-ESM 导入 bug 的 0.1.0 |
| P2 | `npm run verify`（生成 .ld 再用独立 Python 解析器回读）**不在 `npm test` 里** | 改了 `src/core/ldWriter.ts` 不跑 verify 就发布，i2 Pro 拒文件时才发现 |
| P2 | 记忆里两条已过期：「Pages BLOCKED 等用户开启」——实际已 200 | 下个 session 照旧信息去查一遍已经解决的问题 |

## 已放弃（附原因，别再提）

- ~~在浏览器里直接读 `.xrk`/`.drk` 走 AiM 官方 DLL~~ — `MatLabXRK-*.dll` 是 Windows-only 专有库，
  浏览器不可能加载。改走 CSV 导出，后来又用纯 TS 的 [[xrk-js]]（npm `aim-xrk`）直接解原生格式
- ~~Windows-2000 风格 UI~~ — 用户评价「太丑」，已改成 Apple 风（`~/Documents/DESIGN-apple.md`）

## 最近关掉的

- GitHub Pages 部署 — 用户已在 repo Settings 开启 Pages，线上返回 200（2026-08-03 curl 实测）
