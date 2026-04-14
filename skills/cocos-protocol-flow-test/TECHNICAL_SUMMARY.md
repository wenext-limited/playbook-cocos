# 技术总结：游戏协议全链路测试与验证工具开发全过程

## 一、 项目背景与目标

在 Cocos的游戏前端开发与后端接口对接的过程中，因涉及较多的 API 交互且数据结构复杂，需要一套全链路的自动化测试工具来确保：
1. 后端接口可用性与响应耗时检测。
2. 实际业务流程（请求与响应）的真实数据日志捕获。
3. **核心目标**：实现运行时 (Runtime) JSON 响应数据与前端静态 TypeScript 定义 (`Protocal.ts`) 之间的严格结构对比，暴露缺失字段或类型不匹配的安全隐患。
4. 自动化生成高可读性的 Markdown 格式测试报告。

为此，我们开发了 `cocos-protocol-flow-test` 测试组件 (Skill)。

---

## 二、 核心架构设计

为了保证足够轻量和灵活，该测试工具采用 **Node.js 原生** 实现，未引入冗余的第三方依赖：

1. **`test-greedybox-flow.js` (主控脚手架)**
   - 负责解析前端配置字典（基于 `Protocal.ts` 字符串的正则解析）。
   - 定义 API 测试队列，自动适配 GET / POST 请求。
   - 实现深度递归的对象验证器 (`validateData` / `validateArrayResponse`)。
2. **`protocol-tool.js` (核心网络及报告生成系统)**
   - 封装原生 `http` 模块。
   - 收集请求上下文，捕获完整时序、状态码及异常信息。
   - 将收集的信息统一编译成结构化的交互式 Markdown 文档。

---

## 三、 关键技术节点与解决方案

### 1. HTTP 字节流与 JSON 数据解析优化 (Buffer VS String)
**问题描述：** 早期版本中，Node.js 原生 `http.request` 监听 `data` 事件时使用了字符串拼接 (`data += chunk`)。遇到大体积 JSON（包含中文、Emoji 等宽字符）时，数据流在边界被截断，导致反序列化 (`JSON.parse`) 抛出异常，引发响应日志不完整。
**解决方案：** 
废弃字符串拼接，改用内存缓冲队列，在 `end` 事件中统一处理：
```javascript
const chunks = [];
res.on('data', chunk => chunks.push(Buffer.from(chunk)));
res.on('end', () => {
    const rawData = Buffer.concat(chunks).toString('utf8');
    const json = JSON.parse(rawData);
});
```

### 2. 接口规范对齐与环境路由修正
**问题描述：** 测试运行初期，接口频繁报出数据获取失败或异常错误。
**解决方案：** 经对比 Cocos 项目中的 `SubGameConfig.ts` 与网络代理配置，调整了以下设定：
- 读操作接口需严格遵循 `GET` 方法规范，避免误用 `POST`。
- 补全业务专属的路由前缀，例如将 `lucky_game/dashboard` 修正为包含子网关路径的 `lucky_game/greedy_box/dashboard`。

### 3. TypeScript AST 的轻量级解析与动态验证
**问题描述：** 如何在不引入重量级 TypeScript 编译引擎 (如 `ts-morph`) 的前提下，提取 `Protocal.ts` 内的类型定义并验证 JS 运行时对象？
**解决方案：** 
在 `test-greedybox-flow.js` 中构建了一个轻量级的正则解析器：
- **第一步**：提取诸如 `export interface DashBoardData { ... }` 之类的内容块。
- **第二步**：使用正则拆解属性名、可选标记及属性类型。
- **第三步**：以结构树的形式将 Type 映射至验证流程。当后端数据返回后，自上而下对每一层级进行比对（记录缺失字段和类型不一致），并自动添加至报表的异常队列中。

### 4. 构建友好的交互式 Markdown 体验 (兼容 VS Code)
**问题描述：** 为了使海量 JSON 数据与协议对比显得条理清晰，报告采用了 HTML 的 `<details>` 和 `<summary>` 标签进行折叠。但在部分解析器（如 VS Code 的 Markdown 预览）的规范限制下，导致折叠区无法正常渲染。
**解决方案：**
严格规范 HTML 标签与 Markdown 文本之间的空行，保障解析器正常识别内容域：
```html
<details>
<summary><b>折叠标题</b></summary>

```json
{ "key": "value" }
```

</details>
```
同时添加了结合 `#` 与 lowercase 转换的纯文本锚点机制，构建了报告顶部的目录索引 (TOC)。

---

## 四、 最终产出与工作流成效

通过本套工具，前端与后端开发人员仅需执行 `node test-greedybox-flow.js` 即可自动化输出形式为 `test-report-xxx.md` 的标准报告。内容包含：

- 🚦 **多维度面板**：综合展现成功率统计与请求耗时信息。
- 📑 **快速导航**：包含折叠及带内部锚点跳转功能的 TOC 目录。
- 📖 **报文审查**：针对各接口清晰地折叠展示请求 Payload 与完整 Response 数据。
- 🩺 **结构诊断报表**：附加在报告末尾，详细列出本次请求数据与 `Protocal.ts` 定义间的差异（如后端未能下发的必填参数）。

## 五、 后续展望
1. 可将该流程集成至项目的 CI/CD 工作流中（如 GitHub Actions），将自动生成的 Markdown 报告作为代码审查 (PR) 提醒。
2. 当未来业务扩展至更多子游戏或其他模块时，仅需抽离及替换 Endpoint 与环境变量配置，即可复用这套全链路诊断基建。