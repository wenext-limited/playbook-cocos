import { _decorator, Node, Component, instantiate, PageView } from "cc";
const { ccclass, property } = _decorator;

/** 循环翻页组件 - 支持无限循环滚动和自动播放 */
@ccclass(`CirclePageView`)
export default class CirclePageView extends Component {
    @property({ displayName: 'Circulate', tooltip: "是否循环" })
    isCircle: boolean = true;

    @property({ displayName: 'AutoPlay', tooltip: "是否自动播放" })
    isAutoPlay: boolean = true;

    @property({ displayName: 'AutoPlayTime', tooltip: "自动播放时间(ms)" })
    autoPlayTime: number = 3000;

    @property({ displayName: 'PageTurningSpeed', tooltip: "设置翻页速度" })
    pageTurningSpeed: number = 0.5;

    bindItemFunc: (data: any, cb?: Function) => Node;
    pageCount: number = 0;
    pageView: PageView;
    timerId: number = -1;

    protected onLoad(): void {
        this.pageView = this.node.getChildByName("PageView").getComponent(PageView);
        this.pageView.node.active = true;
        this.pageView.pageTurningSpeed = this.pageTurningSpeed;
        this.addTouchEvent();
    }

    /** 绑定数据 */
    bindData(bandList: any[], bindItemFunc: (data: any, cb?: Function) => Node) {
        this.pageCount = bandList.length;
        this.bindItemFunc = bindItemFunc;
        this.loadAllPages(bandList);
        this.setTimer();
    }

    /** 加载所有页面 */
    loadAllPages(bandList: any[]) {
        for (let i = 0; i < this.pageCount; i++) {
            let node = this.bindItemFunc(bandList[i], () => {
                if (i == this.pageCount - 1) {
                    this.loadPageFinish();
                }
            });
            if (node != null) {
                this.pageView.addPage(node);
            }
        }
    }

    loadPageFinish() {
        if (this.isCircle) {
            let firstNode = instantiate(this.getPageByIndex(0));
            let lastNode = instantiate(this.getPageByIndex(this.pageCount - 1));
            this.pageView.insertPage(lastNode, 0);
            this.pageView.addPage(firstNode);
        }
        this.scheduleOnce(() => {
            this.pageView.setCurrentPageIndex(1);
        }, 0.05);
    }

    getPageByIndex(index: number): Node {
        const pages = this.pageView.getPages();
        return pages[index];
    }

    addTouchEvent() {
        this.pageView.node.on('scroll-began', () => {
            this.onPauseAutoPlay();
        });
        this.pageView.node.on('scroll-ended', () => {
            this.adjustPageItemPos();
            this.onStartAutoPlay();
        });
    }

    adjustPageItemPos() {
        let curIndex = this.pageView.getCurrentPageIndex();
        let pageCount = this.pageView.getPages().length;
        if (curIndex == 0) {
            this.pageView.scrollToPage(pageCount - 2, 0);
            this.pageView.setCurrentPageIndex(pageCount - 2);
        } else if (curIndex == pageCount - 1) {
            this.pageView.scrollToPage(1, 0);
            this.pageView.setCurrentPageIndex(1);
        }
    }

    onStartAutoPlay() {
        this.setTimer();
    }

    onPauseAutoPlay() {
        clearInterval(this.timerId);
    }

    setTimer() {
        if (!this.isAutoPlay) return;
        clearInterval(this.timerId);
        this.timerId = setInterval(() => {
            this.pageView.scrollToPage(this.pageView.getCurrentPageIndex() + 1, this.pageTurningSpeed);
        }, this.autoPlayTime);
    }

    protected onDisable(): void {
        this.pageView.node.targetOff(this);
    }
}
