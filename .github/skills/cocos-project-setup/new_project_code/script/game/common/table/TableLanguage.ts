import { JsonUtil } from "../../../../../extensions/oops-plugin-framework/assets/core/utils/JsonUtil";

/** 多语言表结构 - 通过 oops-plugin-excel-to-json 插件生成 */
export class TableLanguage {
    static TableName: string = "Language";

    private data: any;

    init(key: number) {
        var table = JsonUtil.get(TableLanguage.TableName);
        this.data = table[key];
        this.key = key;
    }

    /** 编号【KEY】 */
    key: number = 0;

    /** 英文 */
    get en(): string { return this.data.en; }
    /** 简体中文 */
    get zh(): string { return this.data.zh; }

    // TODO: 根据项目支持的语言添加更多 getter
    // get bn(): string { return this.data.bn; }
    // get vi(): string { return this.data.vi; }
    // get id(): string { return this.data.id; }
    // get ms(): string { return this.data.ms; }
    // get pt(): string { return this.data.pt; }
    // get es(): string { return this.data.es; }
    // get th(): string { return this.data.th; }
    // get ar(): string { return this.data.ar; }
    // get hi(): string { return this.data.hi; }
    // get tr(): string { return this.data.tr; }
    // get ru(): string { return this.data.ru; }
}
