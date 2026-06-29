# 待确认项

## historical_only 关闭证据门禁（P2）

最终报告或主控回扫历史 Markdown 时，不得仅凭正文中出现“历史 / 已处理 / historical_only”就关闭待确认项。任何被标记为 `historical_only` 的风险或确认项，必须同时具备：

```yaml
historical_only_close_gate:
  status: closed | resolved | superseded
  closed_by: controller | user | evidence
  close_evidence: <path or user reply or controller event id>
````

缺少 `status`、`closed_by`、`close_evidence` 任一字段时，final-report-writer 必须把它列为 `open_suspect`，不得静默关闭。
单一事实源

### 待确认项单一事实源

为避免不同 agent 静默覆盖或清除确认项，待确认项必须结构化记录。agent 只能追加 delta，不能直接把 manifest 中的 open 确认项改为 closed。

建议在目标迁移目录维护：

```text
pending-confirmations.compact.md
```

若未单独建文件，也必须在 `迁移清单.md` / `源分析清单.md` 中使用同样结构。

```yaml
pending_confirmations:
  - id: "feature-boundary-001"
    topic: exact-entry | feature-boundary | target-feature-branch | entry-semantics | fidelity-risk | git-environment | tool-unavailable | other
    status: open | closed | excluded | resolved-by-evidence | conditional | not_activated
    opened_by_stage:
    opened_by_agent:
    source_file:
    evidence_paths:
    question_summary:
    options:
    close_condition:
    activation_condition:
    activated: true | false | null
    decision:
    close_reason:
    close_evidence:
    closed_by: main | user | evidence | null
    impact_if_open:
```

状态含义：

- `open`：当前阻塞，需要主控向用户确认或等待外部证据。
- `closed`：用户已明确选择，或主控已记录关闭决定。
- `excluded`：用户或主控依据边界证据明确排除，不再阻塞。
- `resolved-by-evidence`：由 `target-existing` / `user-specified` / `backend-doc` 等证据关闭。
- `conditional`：条件性确认项，只有 `activation_condition` 触发后才转为 `open`。
- `not_activated`：条件性确认项经主控复核确认未触发；不阻塞，但必须保留 `activation_condition`、`activated: false`、`close_reason` 和证据。

规则：

- `user_confirmation_owner` 必须是主控 / controller；子 agent 不得直接向用户提问，也不得在 agent 内等待用户答复。
- 子 agent 只能追加 `pending_confirmations_delta`，包括新增确认项或建议关闭确认项；建议关闭必须写 `suggested_status`、证据路径和 close_condition，由主控裁定。
- phase_runtime / manifest 中存在 open confirmation 时，后续 agent 不得自行清除，也不得把 open 项视为已关闭后继续落地高风险改写。
- 只有 `status: open` 的确认项阻塞后续阶段；`conditional` 必须先判断 `activation_condition` 是否触发，触发后改为 `open`，未触发时应在最终回扫中写为 `not_activated` 或保留 `conditional` 并明确 `activated: false`。
- `status: conditional` / `not_activated` 不阻塞最终状态，但必须在 `迁移总结.md` 和 `使用效果监控.md` 中说明条件、是否触发、关闭依据，避免被关键词扫描误判为 open blocker。
- `status: excluded` 表示用户或主控已明确排除，不再阻塞；普通文本中的“可选子功能”“不默认纳入”不得单独触发阻塞。
- `status: closed` 必须有用户答复或主控记录的关闭决定。
- `status: resolved-by-evidence` 必须有 `target-existing` / `user-specified` / `backend-doc` 等证据路径。
- 后续 agent 若认为确认项可关闭，只能返回 `pending_confirmations_delta` 中的 `suggested_status` 和证据，不能直接清除。
- 主控最终回扫时，以结构化 `pending_confirmations` 为准；关键词扫描只作为发现遗漏的辅助信号。

### 历史确认信号去噪（硬规则）

确认项关闭后，当前状态只能保留在结构化 `pending_confirmations` / `closed_confirmations` / `confirmation_history` 中；不得在 manifest / compact 顶层继续保留会被误判为 open 的字段。

关闭规则：

```yaml
user_confirmation:
  needs_user_confirmation: false
  pending_confirmation_count: 0
  pending_confirmations_delta: []
  confirmation_topic: null
closed_confirmations:
  - id:
    topic:
    decision:
    closed_at:
    closed_by: main | user | evidence
    close_evidence:
    historical_only: true
```

如果步骤正文需要保留历史问题原文，必须放入 `确认历史` / `confirmation_history` 小节，并为每条历史记录标注 `historical_only: true`、`status: closed|excluded|resolved-by-evidence`、`closed_at` 和关闭依据。最终回扫时，主控和 final-report-writer 应以结构化状态为准；普通正文中的“待确认 / 可选子功能 / 边界不清”等历史文字，只有缺少 `historical_only: true` 或没有关闭证据时才可视为疑似 open。

子 agent 不得通过删除历史记录来“关闭”确认项；必须追加关闭建议或由主控写入 `closed_confirmations`。

---
