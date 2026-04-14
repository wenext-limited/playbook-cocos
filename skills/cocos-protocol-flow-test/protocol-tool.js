const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

class ProtocolTester {
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.results = [];
        this.validationIssues = [];
        this.startTime = Date.now();
    }

    addValidationIssue(endpoint, issue) {
        this.validationIssues.push({ endpoint, issue });
    }

    async sendRequest(endpoint, method = 'POST', payload = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.baseUrl}${endpoint}`);
            const isHttps = url.protocol === 'https:';
            const requester = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: method.toUpperCase(),
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'Token': this.token,
                    'Accept': 'application/json'
                }
            };
            
            let requestPayload = payload;
            let bodyData = null;

            if (payload && options.method === 'GET') {
                const searchParams = new URLSearchParams(payload);
                options.path += '?' + searchParams.toString();
                // for GET we stringified it in the query, but we don't write body
            } else if (payload && options.method !== 'GET') {
                bodyData = JSON.stringify(payload);
                options.headers['Content-Length'] = Buffer.byteLength(bodyData);
            }

            const reqTime = Date.now();
            const req = requester.request(options, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(Buffer.from(chunk)));
                res.on('end', () => {
                    const duration = Date.now() - reqTime;
                    const buffer = Buffer.concat(chunks);
                    let data = buffer.toString('utf8');
                    let parsedData = null;
                    try {
                        parsedData = JSON.parse(data);
                    } catch (e) {
                        parsedData = data || null;
                    }

                    const result = {
                        endpoint,
                        method: options.method,
                        payload: requestPayload,
                        status: res.statusCode,
                        duration,
                        response: parsedData,
                        success: res.statusCode >= 200 && res.statusCode < 300 && (!parsedData || !parsedData.code || parsedData.code === 0 || parsedData.code === 200)
                    };
                    
                    this.results.push(result);
                    console.log(`[${result.success ? '成功' : '失败'}] ${options.method} ${endpoint} (${duration}ms)`);
                    resolve(result);
                });
            });

            req.on('error', (e) => {
                const duration = Date.now() - reqTime;
                const result = {
                    endpoint,
                    method: options.method,
                    payload: requestPayload,
                    status: 'Error',
                    duration,
                    response: e.message,
                    success: false
                };
                this.results.push(result);
                console.error(`[网络错误] ${options.method} ${endpoint}: ${e.message}`);
                resolve(result);
            });

            if (bodyData && options.method !== 'GET') {
                req.write(bodyData);
            }
            req.end();
        });
    }

    generateMarkdownReport(reportDir = './reports') {
        const fullReportDir = path.join(__dirname, reportDir);
        if (!fs.existsSync(fullReportDir)) {
            fs.mkdirSync(fullReportDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(fullReportDir, `test-report-${timestamp}.md`);
        
        const totalDuration = Date.now() - this.startTime;
        const passedCount = this.results.filter(r => r.success).length;
        const totalCount = this.results.length;

        let md = `# Cocos 协议全链路测试报告\n\n`;
        md += `**测试时间:** ${new Date().toLocaleString()}\n`;
        md += `**目标服务器Url:** ${this.baseUrl}\n`;
        md += `**总耗时:** ${totalDuration}ms\n`;
        md += `**测试结果:** ${passedCount} / ${totalCount} 成功\n\n`;

        // ===================== 补充：折叠目录生成 =====================
        md += `<details open>\n<summary><b>📑 报告目录 (点击折叠/展开)</b></summary>\n\n`;
        md += `- [测试详情概览](#测试详情概览)\n`;
        md += `- [完整的交互数据日志](#完整的交互数据日志)\n`;
        this.results.forEach((r, index) => {
            // Anchor links usually lowercase and remove slashes
            const anchor = `${index + 1}-` + r.endpoint.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
            md += `  - [${index + 1}. \`${r.endpoint}\`](#${anchor})\n`;
        });
        md += `- [数据结构诊断与异常报表 (对比 Protocal.ts)](#数据结构诊断与异常报表-对比-protocalts)\n`;
        const groupedIssues = {};
        this.validationIssues.forEach(({ endpoint, issue }) => {
            if (!groupedIssues[endpoint]) groupedIssues[endpoint] = [];
            groupedIssues[endpoint].push(issue);
        });
        for (const ep in groupedIssues) {
            const anchor = `接口-` + ep.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
            md += `  - [接口 \`${ep}\`](#${anchor})\n`;
        }
        md += `\n\n</details>\n\n---\n\n`;

        md += `## 测试详情概览\n\n`;
        md += `| 接口 | 方法 | 状态 | 耗时 | 结果 |\n`;
        md += `|---|---|---|---|---|\n`;
        
        this.results.forEach(r => {
            const statusIcon = r.success ? '' : '';
            md += `| \`${r.endpoint}\` | ${r.method} | ${r.status} | ${r.duration}ms | ${statusIcon} |\n`;
        });

        md += `\n## 完整的交互数据日志\n\n`;
        
        this.results.forEach((r, index) => {
            const anchor = `${index + 1}-` + r.endpoint.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
            md += `<h3 id="${anchor}">${index + 1}. \`${r.endpoint}\`</h3>\n\n`;
            md += `- **请求方法:** ${r.method}\n`;
            md += `- **响应状态:** ${r.status}\n`;
            md += `- **请求耗时:** ${r.duration}ms\n\n`;
            
            if (r.payload) {
                md += `<details>\n<summary><b>展开查看请求数据 (Payload)</b></summary>\n\n`;
                md += `\`\`\`json\n${JSON.stringify(r.payload, null, 2)}\n\`\`\`\n\n`;
                md += `</details>\n\n`;
            } else {
                md += `<details>\n<summary><b>展开查看请求数据 (Payload: 无)</b></summary>\n\n\`\`\`\n空\n\`\`\`\n\n</details>\n\n`;
            }

            md += `<details>\n<summary><b>展开查看完整响应数据 (Response)</b></summary>\n\n`;
            md += `\`\`\`json\n${JSON.stringify(r.response, null, 2)}\n\`\`\`\n\n`;
            md += `</details>\n\n---\n\n`;
        });

        // ===================== 补充：数据结构对比结果 =====================
        if (this.validationIssues.length > 0) {
            md += `\n<h2 id="数据结构诊断与异常报表-对比-protocalts">数据结构诊断与异常报表 (对比 Protocal.ts)</h2>\n\n`;
            md += `> 以下是通过运行时数据与 TypeScript 接口定义的静态分析提取出的差异。包括类型不符、关键字段缺失以及未被定义的越界字段等。\n\n`;

            for (const ep in groupedIssues) {
                const anchor = `接口-` + ep.replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
                md += `<h3 id="${anchor}">接口 \`${ep}\`</h3>\n\n`;
                groupedIssues[ep].forEach(warn => {
                    md += `- ⚠️ ${warn}\n`;
                });
                md += `\n`;
            }
        } else {
            md += `\n<h2 id="数据结构诊断与异常报表-对比-protocalts">数据结构诊断与异常报表 (对比 Protocal.ts)</h2>\n\n`;
            md += `🎉 所有接口响应均与结构定义高度吻合，未发现异常字段或缺漏类型！\n`;
        }

        fs.writeFileSync(filename, md, 'utf-8');
        console.log(`\n测试报告已生成: ${filename}`);
        return filename;
    }
}

module.exports = ProtocolTester;
