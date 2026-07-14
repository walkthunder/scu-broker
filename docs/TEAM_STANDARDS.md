# scu-broker 开发规范

由 da 生成 · 团队默认模式：**warn**

## 快速命令

```bash
da standards commit    # 交互式提交
da standards scan       # 合规自检（含 .env 硬拦）
```

## Commit 格式

```
<type>(<scope>): <subject>

<body 可选>
Task: <任务 ID>              ← 必填；完成写 `Task: <ID>`，未完成写 `Task: <ID> [WIP]`
Docs: <文档路径>         ← 功能改动建议填写
```

### type

| type | 场景 |
|------|------|
| feat | 新功能 |
| fix | 缺陷修复 |
| docs | 仅文档 |
| style | 格式（不改逻辑） |
| refactor | 重构 |
| perf | 性能 |
| test | 测试 |
| chore | 构建/工具 |
| revert | 回滚 |

## 分支命名

`feat/xxx` · `fix/xxx` · `hotfix/xxx` · `release/xxx` · `docs/xxx` · `style/xxx` · `revert/xxx`

## 原子提交

- 一个 commit = 一个可独立说明的功能点
- 不混无关模块；`git diff --stat` 提交前看一眼

## 文档同步

功能/API/架构变更须同步更新对应 README 或 `docs/`（见团队 doc-sync 规则）。

## 本项目配置

见 [`.da/standards.json`](../.da/standards.json)。
