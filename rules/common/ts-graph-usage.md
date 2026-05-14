# ts-graph-mcp 使用规范

## MCP 可用性检查（每次任务开始前必做）

在执行任何 TypeScript 代码分析任务前，**先调用 `ts_graph_stats` 探测 ts-graph MCP 是否可用**：

- **调用成功** → ts-graph MCP 已启用，按下方规范使用语义工具
- **调用失败 / 工具不存在** → ts-graph MCP 未安装或未启动，**本文件所有规范跳过**，直接使用 grep/find

```
探针调用：ts_graph_stats()
成功 → 继续执行下方规范
失败 → 忽略本文件，降级为 grep
```

---

在所有涉及 TypeScript 代码分析的任务中，**确认 MCP 可用后，优先使用 ts-graph-mcp，禁止用 grep/find 替代语义查询**。

## 触发场景与对应工具

### 1. 查找符号的使用方
触发词：「谁用了」「哪里引用了」「有没有使用」「被哪些文件 import」
```
ts_query_symbol(symbolId)         → callers / importers / typeUsers
ts_analyze_symbol_usage(symbolId) → 按 runtime/type-only/import 分类
```

### 2. 重命名 / 删除前的影响评估
触发词：「重命名」「删除」「移除」「改名」「能不能删」
```
ts_preview_rename(name, newName)  → 列出所有需要同步修改的引用点
ts_query_symbol(symbolId)         → 确认 callers 为空再删除
```

### 3. 修改文件前的波及范围
触发词：「修改」「重构」「改动」「影响哪些」「改这个会不会影响」
```
ts_get_blast_radius(changedFiles) → certain/typeOnly/possible 三层影响
ts_get_file_context(filePath)     → 了解文件导出结构再动手
```

### 4. 死代码 / 无用代码排查
触发词：「没有用到的」「可以删的」「死代码」「未引用」「清理」
```
ts_find_unused_exports(directory) → 无跨文件引用的导出符号
ts_find_dead_code(directory)      → 未导出且无调用者的函数/类
```

### 5. 架构 / 依赖分析
触发词：「依赖关系」「架构」「核心模块」「耦合」「哪个最重要」
```
ts_get_hub_symbols()              → 被最多文件依赖的核心符号
ts_graph_stats()                  → 图谱健康度（边类型占比）
ts_export_visualization()         → 生成可交互依赖图 HTML
```

### 6. 调试 / 追踪数据流
触发词：「怎么调用到」「从哪里触发」「调用链」「数据怎么流的」「为什么会执行」
```
ts_trace_call_chain(from, to)     → 两符号间最短调用路径
ts_query_symbol(symbolId)         → callees 看它调用了谁
```

### 7. 开发新功能前的调研
触发词：「怎么用这个类」「有没有类似的实现」「参考哪个文件」「用法示例」
```
ts_search_symbols(query)          → 按名字定位符号
ts_get_symbol_ast(name, filePath) → 读取函数/类的完整实现
ts_get_file_context(filePath)     → 了解模块对外暴露了什么
```

### 8. Code Review
触发词：「review」「代码审查」「看看这次改动」
```
ts_graph_build()                  → 增量更新图谱
ts_get_blast_radius(changedFiles) → 影响范围
ts_get_file_context(filePath)     → 每个变更文件的导出结构
ts_get_symbol_ast(name, filePath) → 核心变更符号的函数体
ts_query_symbol(symbolId)         → 调用方兼容性验证
```

## 降级使用 grep 的条件

**只有以下情况才用 grep**：
- 搜索字符串字面量（如事件名、URL、注释内容）
- 搜索非 TypeScript 文件（.json、.prefab、.scene、.md）
- ts-graph 工具明确返回空结果后做兜底确认

## 执行顺序

每次分析任务开始前：
1. 先调用 `ts_graph_build`（增量，通常 < 1s）确保图谱是最新的
2. 再执行对应的查询工具
3. 结果为空时，说明该符号通过编辑器绑定或非 TS import 使用，再降级用 grep 验证
