const ProtocolTester = require('./protocol-tool');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://43.173.167.239/api/';
const TOKEN = 'eyJraWQiOiJkZWZhdWx0IiwiYWxnIjoiSFMyNTYifQ.eyJqdGkiOiI3NjJkOTc2Zi0yNTY1LTRkNDktYTc4ZC00NDFlNDE1NTVlMDciLCJpYXQiOjE3NzQ0MzM5MTMsImlzcyI6IndlcGFydHktZ2F0ZXdheSIsInN1YiI6IntcInVpZFwiOjEwMDc1Mzc1NCxcInJlZ2lvblwiOlwiSU5cIn0iLCJleHAiOjE3NzcwMjU5MTN9.WJ6Hb81OMdEu8GRGr9Cs9J-3bfy3EtnfaOYXI5XrYp8';

// 轻量级提取 TypeScript 接口
function parseTsInterfaces(tsCode) {
    const interfaces = {};
    const blockRegex = /export\s+(?:interface|class)\s+(\w+)\s*(?:extends\s+\w+\s*)?\{([\s\S]*?)\}/g;
    let match;

    while ((match = blockRegex.exec(tsCode)) !== null) {
        const name = match[1];
        let body = match[2];
        const props = {};

        body = body.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

        const propRegex = /([a-zA-Z0-9_]+)\s*(\??)\s*:\s*([^;]+);/g;
        let pMatch;
        while ((pMatch = propRegex.exec(body)) !== null) {
            let type = pMatch[3].trim();
            if (type.includes('=')) {
                type = type.split('=')[0].trim();
            }
            props[pMatch[1]] = { optional: pMatch[2] === '?', type };
        }
        
        const indexRegex = /\[\s*(?:[a-zA-Z0-9_]+)\s*:\s*(?:string|number)\s*\]\s*:\s*([^;]+);/g;
        let indexMatch = indexRegex.exec(body);
        let indexType = indexMatch ? indexMatch[1].trim() : null;

        interfaces[name] = { props, indexType };
    }
    return interfaces;
}

function validateData(data, typeName, interfaces, currentPath = '', tester, endpoint) {
    if (!data) return;
    const iface = interfaces[typeName];
    if (!iface) return;

    const typeMapping = { 'number': 'number', 'string': 'string', 'boolean': 'boolean', 'any': 'any' };

    if (iface.indexType) {
        let valType = iface.indexType.endsWith('[]') ? iface.indexType.slice(0, -2) : iface.indexType;
        const isArray = iface.indexType.endsWith('[]');

        Object.keys(data).forEach(k => {
            const val = data[k];
            if (isArray) {
                if (!Array.isArray(val)) {
                    tester.addValidationIssue(endpoint, `字段类型不匹配: \`${currentPath}[${k}]\` 期望为数组, 实际得到 ${typeof val}`);
                } else if (interfaces[valType]) {
                    val.forEach((item, i) => validateData(item, valType, interfaces, `${currentPath}[${k}][${i}]`, tester, endpoint));
                }
            } else {
                if (typeMapping[valType]) {
                    if (val !== null && typeof val !== typeMapping[valType] && valType !== 'any') {
                        tester.addValidationIssue(endpoint, `数据类型不匹配: \`${currentPath}[${k}]\` 期待 \`${valType}\`，实际是 \`${typeof val}\``);
                    }
                } else if (interfaces[valType]) {
                    validateData(val, valType, interfaces, `${currentPath}[${k}]`, tester, endpoint);
                }
            }
        });
        return;
    }

    for (const [key, propDef] of Object.entries(iface.props)) {
        let expectedType = propDef.type;
        const isArray = expectedType.endsWith('[]');
        if (isArray) expectedType = expectedType.slice(0, -2);
        
        let pathKey = currentPath ? `${currentPath}.${key}` : key;

        if (!(key in data)) {
            if (!propDef.optional) {
                tester.addValidationIssue(endpoint, `必填字段缺失: 缺少字段 \`${pathKey}\` (定义类型为 ${propDef.type})`);
            }
            continue;
        }
        
        const val = data[key];
        if (val === null || val === undefined) continue;

        if (isArray) {
            if (!Array.isArray(val)) {
                tester.addValidationIssue(endpoint, `字段类型不匹配: \`${pathKey}\` 期望为数组, 但实际上是 ${typeof val}`);
            } else if (val.length > 0 && interfaces[expectedType]) {
                val.forEach((item, i) => validateData(item, expectedType, interfaces, `${pathKey}[${i}]`, tester, endpoint));
            }
        } else if (interfaces[expectedType]) {
            validateData(val, expectedType, interfaces, pathKey, tester, endpoint);
        } else {
            let actualType = typeof val;
            if (typeMapping[expectedType] && actualType !== typeMapping[expectedType] && expectedType !== 'any') {
                tester.addValidationIssue(endpoint, `数据类型不匹配: \`${pathKey}\` 期待是 \`${expectedType}\`，但接收到了 \`${actualType}\``);
            }
        }
    }
}

async function runTests() {
    console.log('开始执行 Cocos GreedyBox 协议全链路测试...');
    const tester = new ProtocolTester(BASE_URL, TOKEN);

    const tsCodePath = path.join(__dirname, '../../../assets/GameBundle/greedybox/script/net/Protocal.ts');
    const tsCode = fs.readFileSync(tsCodePath, 'utf8');
    const interfaces = parseTsInterfaces(tsCode);
    console.log(' 已加载及解析 Protocal.ts 结构\n');

    const runWithValidation = async (endpoint, method, payload, expectedType) => {
        const res = await tester.sendRequest(endpoint, method, payload);
        if (res.success && res.response && res.response.data && expectedType) {
            // 对比结构
            validateData(res.response.data, expectedType, interfaces, '', tester, endpoint);
        }
        return res;
    };

    await runWithValidation('lucky_game/greedy_box/dashboard', 'GET', null, 'DashBoardData');
    await runWithValidation('lucky_game/greedy_box/user_game_info', 'GET', null, 'UserGameInfo');

    const reqBetData = { coinsNum: 100, option: 1, roomId: 0, roundNum: 1, freeCoinsNum: 0, hasLuckyCoins: false };
    await runWithValidation('lucky_game/greedy_box/add', 'POST', reqBetData);
    
    await runWithValidation('lucky_game/greedy_box/current_result', 'GET', null, 'CurrentResultData');
    
    // Validate arrays specifically
    const validateArrayResponse = async (endpoint, method, payload, expectedType) => {
        const res = await tester.sendRequest(endpoint, method, payload);
        if (res.success && res.response && Array.isArray(res.response.data) && expectedType) {
            res.response.data.forEach((item, idx) => {
                validateData(item, expectedType, interfaces, `[${idx}]`, tester, endpoint);
            });
        }
    };

    await validateArrayResponse('lucky_game/greedy_box/today_rank_info', 'GET', null, 'WinnerUserInfo');
    await validateArrayResponse('lucky_game/greedy_box/records', 'GET', { limit: 20 }, 'GameRecordData');
    await validateArrayResponse('lucky_game/greedy_box/user_records', 'GET', { limit: 20 }, 'UerRecordsData');

    tester.generateMarkdownReport();
}

runTests().catch(console.error);
