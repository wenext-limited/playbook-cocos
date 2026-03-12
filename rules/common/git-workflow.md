# Git 工作流

## 提交消息格式

```
<type>(<scope>): <描述>

<可选正文>
```

### 类型

| 类型 | 含义 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat(betting): 添加快速下注功能` |
| `fix` | 修复 Bug | `fix(animation): 修复飞币动画闪烁` |
| `refactor` | 重构（不改变行为） | `refactor(model): 拆分 UserGameModel` |
| `docs` | 文档更新 | `docs: 更新 playbook-cocos 技能` |
| `test` | 测试相关 | `test(network): 添加 HTTP 超时测试` |
| `chore` | 构建/依赖/配置 | `chore: 升级 Cocos Creator 到 3.8.8` |
| `perf` | 性能优化 | `perf(pool): 优化飞币对象池回收` |
| `ci` | CI/CD 流水线 | `ci: 添加 Web Mobile 自动构建` |
| `style` | 格式调整（不影响逻辑） | `style: 统一缩进为 4 空格` |

### 范围（scope）

使用模块名或功能区域：

- `betting` — 下注模块
- `animation` — 动画系统
- `network` — 网络通信
- `model` — 数据模型
- `ui` — 界面组件
- `config` — 配置
- `pool` — 对象池
- `entry` — 入口/初始化

## 提交规范

- 每次提交聚焦一个关注点
- 描述使用祈使语气（如 "添加用户登录功能"）
- 正文说明「为什么」而非「是什么」
- 涉及 UI 变更时附上截图
- 涉及动画效果时附上 GIF 或视频

## 常见提交模式

```bash
# ECS 三层模式的典型提交顺序
git commit -m "feat(model): 添加 RankModelComp 数据模型"
git commit -m "feat(bll): 添加 RankData BLL 系统"
git commit -m "feat(ui): 添加排行榜面板组件"

# Bug 修复
git commit -m "fix(animation): 修复 SinglePrize 减速阶段步数计算错误

fixSingleStepNumber 在 curIndex > targetIndex 时结果为负"

# 资源相关
git commit -m "chore(asset): 添加 box_close_10 宝箱 Spine 资源"
```

## Pull Request 流程

创建 PR 时：

1. 分析完整的提交历史（不仅仅是最后一次提交）
2. 使用 `git diff [base-branch]...HEAD` 查看所有变更
3. 撰写全面的 PR 摘要
4. 包含测试计划（手动测试步骤）
5. 新分支推送时使用 `-u` 标志

### PR 模板

```markdown
## 变更说明
- 简述改动内容

## 影响范围
- [ ] 数据模型 (Model)
- [ ] 业务逻辑 (BLL)
- [ ] UI 组件 (View)
- [ ] 资源文件
- [ ] 配置

## 测试计划
1. 步骤一
2. 步骤二
3. 预期结果

## 截图/录屏
（如有 UI/动画变更）
```

### 代码评审关注点

- [ ] ECS 三层分离是否清晰（Model 不调用 View，BLL 不持有 UI）
- [ ] BLL 组件在请求完成后是否移除
- [ ] 事件监听是否在组件生命周期内正确注册和注销
- [ ] 异步回调是否检查 `isValid`
- [ ] 硬编码值是否提取为常量

## 分支命名

```
feature/<简短描述>        # 新功能
fix/<issue-id>-<简短描述>  # Bug 修复
refactor/<模块名>          # 重构
release/<版本号>           # 发布
hotfix/<问题描述>          # 紧急修复
```

## Cocos Creator 项目特殊注意

- `.meta` 文件必须随资源一起提交，不要加入 `.gitignore`
- `library/` 和 `temp/` 应在 `.gitignore` 中
- Prefab 和 Scene 文件冲突时，优先使用较新版本并手动验证
- Bundle 资源变更需要完整测试加载流程
