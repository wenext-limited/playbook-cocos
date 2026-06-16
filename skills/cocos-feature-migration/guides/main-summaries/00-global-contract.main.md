# Main Summary: 全局契约

本文件是 main/controller 默认读取的轻量摘要。完整规则在 `guides/00-global-contract.md`；只有规则冲突、阻塞、越权、compact 证据不足或用户要求解释时，才读取完整 guide。

## main 常驻硬门禁

```yaml
main_runtime_contract:
  parameter_precheck:
    required: [source_project, target_project, feature_name]
    before: [TeamCreate, Agent, TaskList, target_git, business_write]
  feature_slug:
    rule: "业务对象 + 功能类型；jackpot榜单必须是 jackpot_rank"
  target_branch_gate:
    owner: controller
    before: [target_agents, target_stash_pull_checkout, migration_applier]
  write_permission:
    target_business_code_and_assets: migration-applier only
  default_validation_level:
    level: L1-static
    forbidden_by_default: [tsc, cocos, npm_build, npm_typecheck]
  completion_source:
    phase_done_by: required_artifacts + compact + manifest
    not_by: [idle_notification, agent_self_report]
  pending_confirmation_owner:
    owner: controller
    agents_can_only: pending_confirmations_delta
  final_status_owner:
    owner: controller
```

## main 默认不做

- 不全量搜索源项目代码。
- 不全量搜索目标项目代码。
- 不展开 asset deps 原始输出。
- 不读取大型 prefab 全文。
- 不复制 agent 已写入步骤 md 的完整表格。
- 不把 agent compact 全文粘贴进最终回复。
- 不在聊天里维护完整历史状态。
- 不读取完整 agent prompt；只在 phase packet 中要求子 agent 自行读取对应 prompt / guide。
- 不读取完整步骤 md / evidence compact / logs，除非 state compact 缺失、状态冲突、required artifacts 缺失、open confirmation、agent 越权风险或用户要求细节。

例外：compact 缺失、产物冲突、agent 越权、阻塞门禁、用户要求细节时，main 才下钻完整 guide / 步骤 md / logs。

## 调度原则

- main 是 scheduler，不是事实仓库。
- 当前状态写入 `迁移清单.md` 和 `controller-checkpoint.compact.md`。
- agent 是 worker，只写私有产物，只回短结构化结果。
- agent 不得等待 peer、TaskList、最终合并文件或用户。
- main 对 agent 收割必须有界：idle-only 立即查产物；缺产物最多追问一次；仍失败则补做 / 重启一次 / 阻塞，不得卡住整流程。
- main 默认读取预算：`controller-checkpoint.compact.md` + 当前阶段 `*.state.compact.md` + manifest 80 行以内必要片段 + 短 `agent_result`。完整 Markdown 读取优先 limit 400~800 行。
- main 调度历史写入 `<target_migration_dir>/logs/controller-event-log.jsonl`，事件包括 `phase_start`、`agent_harvest`、`completed_with_agent_output_missing`、`user_confirmation_closed`、`phase_complete`、`repair_round`。
