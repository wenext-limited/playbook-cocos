import {
    Component,
    Layout,
    Node,
    Rect,
    ScrollView,
    Size,
    UIOpacity,
    UITransform,
    Vec2,
    Vec3,
    assert,
    find,
    rect,
    v3
} from "cc";
import { DEBUG } from "cc/env";

export type ItemNode = Node;
export type ItemCreator<DATA> = (itemNode: Node, itemData: DATA, index?: number) => Node;

/**
 * 虚拟列表组件 - 支持大量数据的高性能滚动列表
 * 支持三种尺寸模式：indetermined(不确定大小), different(各项不同大小), identical(各项相同大小)
 * 支持竖排和横排布局
 */
export class LazyListView<DATA> extends Component {
    protected mSizeMode: LazyListView.SizeMode;
    protected mSetOrCreateItem: ItemCreator<DATA>;
    protected mUsingItemList: Node[] = [];
    protected mCachedItemList: Node[] = [];
    protected mBindingData: DATA[] = [];
    protected mKeepCount: number = 0;
    protected mCacheCount: number = 0;
    protected mTargetScrollView: ScrollView;
    protected mTargetLayout: Layout;
    protected mTargetContainer: Node;
    protected mCellSize: Size | ((itemData: DATA) => Size);
    protected mLastPosition: Vec3;
    protected mIndexOffset: number;

    public config(scrollView?: ScrollView, container?: Node, sizeMode?: LazyListView.SizeMode): void {
        this.mSizeMode = sizeMode || LazyListView.SizeMode.indetermined;

        this.mTargetScrollView = scrollView || this.node.getComponent(ScrollView);
        assert(this.mTargetScrollView, "fatal error");
        this.mTargetContainer = container || find("view/content", this.mTargetScrollView.node);
        assert(this.mTargetContainer, "fatal error");
        this.mTargetLayout = this.mTargetContainer.getComponent(Layout);
        assert(this.mTargetLayout, "fatal error");

        for (var i = 0; i < this.mCachedItemList.length; ++i) {
            this.mCachedItemList[i].destroy();
        }
        this.mCachedItemList = [];
        this.mTargetContainer.removeAllChildren();

        if (this.mSizeMode == LazyListView.SizeMode.identical) {
            this.mTargetLayout.enabled = false;
            this.mLastPosition = this.mTargetContainer.getPosition();
        } else {
            this.mTargetLayout.enabled = true;
        }

        this.mTargetScrollView.node.on("scrolling", function () {
            this.onScrolling();
        }, this);
    }

    /**
     * 数据绑定
     * @param data 列表数据
     * @param setOrCreateItem item刷新函数
     * @param cellSize item大小
     * @param keepCount 缓存item数量
     * @param cacheCount 预缓存数量
     */
    public bindData(data: DATA[], setOrCreateItem: (itemNode: Node, itemData: DATA, index?: number) => Node, cellSize?: Size | ((itemData: DATA) => Size), keepCount?: number, cacheCount?: number) {
        if (cacheCount != null) this.mCacheCount = cacheCount;
        if (keepCount != null) this.mKeepCount = keepCount;
        if (setOrCreateItem) this.mSetOrCreateItem = setOrCreateItem;
        if (cellSize) this.mCellSize = cellSize;
        assert(this.mCellSize, "fatal error");

        this.removeAllItems();
        this.mBindingData = data || [];
        switch (this.mSizeMode) {
            case LazyListView.SizeMode.indetermined: {
                for (var i = 0; i < this.mKeepCount + this.mCacheCount && i < this.mBindingData.length; ++i) {
                    var itemData = this.mBindingData[i];
                    var itemNode = this.createItemNode(null, itemData, i);
                    this.mTargetContainer.addChild(itemNode);
                }
                this.checkAllItems();
                break;
            }
            case LazyListView.SizeMode.different: {
                for (var i = 0; i < this.mBindingData.length; ++i) {
                    var itemData = this.mBindingData[i];
                    var blankNode = this.createBlankNode(itemData);
                    this.mTargetContainer.addChild(blankNode);
                }
                this.mTargetContainer.getComponent(Layout).updateLayout();
                this.checkAllItems();
                break;
            }
            case LazyListView.SizeMode.identical: {
                this.updateContentSize();
                this.mTargetScrollView.scrollToTopLeft();
                this.checkAllItems();
                break;
            }
            default: {
                assert(false, "not supported");
                break;
            }
        }
    }

    public isAtBegin(): boolean {
        var offset = this.mTargetScrollView.getScrollOffset();
        if (this.mTargetScrollView.vertical) {
            return offset.y <= this.mTargetLayout.paddingTop;
        } else {
            return offset.x <= this.mTargetLayout.paddingLeft;
        }
    }

    public isAtEnd(): boolean {
        var offset = this.mTargetScrollView.getScrollOffset();
        if (this.mTargetScrollView.vertical) {
            return offset.y >= this.mTargetContainer.getComponent(UITransform).height - this.mTargetLayout.paddingBottom - this.mTargetScrollView.node.getComponent(UITransform).height;
        } else {
            return offset.x >= this.mTargetContainer.getComponent(UITransform).width - this.mTargetLayout.paddingRight - this.mTargetScrollView.node.getComponent(UITransform).width;
        }
    }

    public jumpToBegin(): void {
        this.mTargetScrollView.scrollToTopLeft();
    }

    public jumpToEnd(): void {
        this.mTargetScrollView.scrollToBottomRight();
    }

    public getIndexOffset(): number {
        return this.mIndexOffset;
    }

    public getItemData(index: number): DATA {
        return this.mBindingData[index];
    }

    public getLoadedItems(): ItemNode[] {
        return this.mUsingItemList.slice();
    }

    public getItemNode(index: number): Node {
        switch (this.mSizeMode) {
            case LazyListView.SizeMode.indetermined:
                return this.mTargetContainer.children[index];
            case LazyListView.SizeMode.different:
                var child = this.mTargetContainer.children[index];
                return child && child.children[0];
            case LazyListView.SizeMode.identical:
                return this.mTargetContainer.children[index];
            default:
                assert(false, "not supported");
        }
    }

    public pushFrontItems(data: DATA[], isScrolling: boolean): void {
        if (!data || !data.length) return;
        this.mBindingData = this.mBindingData || [];

        var sizeChanged = 0;
        for (var i = data.length - 1; i >= 0; --i) {
            var itemData = data[i];
            this.mBindingData.unshift(itemData);

            switch (this.mSizeMode) {
                case LazyListView.SizeMode.indetermined: {
                    var itemNode = this.createItemNode(null, itemData, i);
                    this.mTargetContainer.insertChild(itemNode, 0);
                    this.mUsingItemList.unshift(itemNode);
                    if (this.mTargetScrollView.vertical) {
                        if (i != 0) sizeChanged += this.mTargetLayout.spacingY;
                        sizeChanged += itemNode.getComponent(UITransform).height;
                    } else {
                        if (i != 0) sizeChanged += this.mTargetLayout.spacingX;
                        sizeChanged += itemNode.getComponent(UITransform).width;
                    }
                    break;
                }
                case LazyListView.SizeMode.different: {
                    var blankNode = this.createBlankNode(itemData);
                    this.mTargetContainer.insertChild(blankNode, 0);
                    this.mIndexOffset++;
                    if (this.mTargetScrollView.vertical) {
                        if (i != 0) sizeChanged += this.mTargetLayout.spacingY;
                        sizeChanged += blankNode.getComponent(UITransform).height;
                    } else {
                        if (i != 0) sizeChanged += this.mTargetLayout.spacingX;
                        sizeChanged += blankNode.getComponent(UITransform).width;
                    }
                    break;
                }
                case LazyListView.SizeMode.identical: {
                    this.mIndexOffset++;
                    if (this.mTargetScrollView.vertical) {
                        if (i != 0) sizeChanged += this.mTargetLayout.spacingY;
                        sizeChanged += this.calcCellSize(itemData).height;
                    } else {
                        if (i != 0) sizeChanged += this.mTargetLayout.spacingX;
                        sizeChanged += this.calcCellSize(itemData).width;
                    }
                    break;
                }
                default: {
                    assert(false, "not supported");
                    break;
                }
            }
        }

        if (this.mSizeMode == LazyListView.SizeMode.identical) {
            this.updateContentSize();
            for (var i = 0; i < this.mUsingItemList.length; ++i) {
                var itemNode = this.mUsingItemList[i];
                itemNode.position = this.calcItemPosition(itemNode, i + this.mIndexOffset);
            }
        } else {
            this.mTargetLayout.updateLayout();
        }

        if (isScrolling) {
            var scrollOffset = this.mTargetScrollView.getScrollOffset();
            if (this.mTargetScrollView.vertical && !this.mTargetScrollView.horizontal) {
                scrollOffset.y = Math.max(0, Math.min(this.mTargetContainer.getComponent(UITransform).height - this.mTargetScrollView.node.getComponent(UITransform).height, scrollOffset.y + sizeChanged));
                this.mTargetScrollView.scrollToOffset(scrollOffset);
            } else if (this.mTargetScrollView.horizontal && !this.mTargetScrollView.vertical) {
                scrollOffset.x = Math.max(0, Math.min(this.mTargetContainer.getComponent(UITransform).width - this.mTargetScrollView.node.getComponent(UITransform).width, scrollOffset.x + sizeChanged));
                this.mTargetScrollView.scrollToOffset(scrollOffset);
            } else {
                assert(false, "not supported");
            }
        }

        this.checkAllItems();
    }

    public removeAllItems(): void {
        switch (this.mSizeMode) {
            case LazyListView.SizeMode.indetermined: {
                var children = this.mTargetContainer.children;
                for (let i = children.length - 1; i >= 0; i--) {
                    var itemNode = children[i];
                    itemNode.parent = null;
                    this.mCachedItemList.push(itemNode);
                }
                break;
            }
            case LazyListView.SizeMode.different: {
                var children = this.mTargetContainer.children;
                for (let i = children.length - 1; i >= 0; i--) {
                    var child = children[i];
                    var itemNode = child.children[0];
                    if (itemNode) {
                        itemNode.parent = null;
                        this.mCachedItemList.push(itemNode);
                    }
                }
                break;
            }
            case LazyListView.SizeMode.identical: {
                var children = this.mTargetContainer.children;
                for (let i = children.length - 1; i >= 0; i--) {
                    var itemNode = children[i];
                    itemNode.parent = null;
                    this.mCachedItemList.push(itemNode);
                }
                break;
            }
            default: {
                assert(false, "not supported");
                break;
            }
        }

        this.mTargetContainer.removeAllChildren();
        this.mBindingData = [];
        this.mUsingItemList = [];
        this.mIndexOffset = 0;
    }

    public clearCachedItems(): void {
        for (var i = 0; i < this.mCachedItemList.length; ++i) {
            this.mCachedItemList[i].destroy();
        }
        this.mCachedItemList = [];
    }

    private calcCellSize(itemData: DATA): Size {
        return typeof (this.mCellSize) == "function" ? this.mCellSize(itemData) : this.mCellSize;
    }

    private getWorldRectOfNode(node: Node, extraWidth?: number, extraHeight?: number): Rect {
        var worldPos = node.getComponent(UITransform);
        extraWidth = extraWidth || 0;
        extraHeight = extraHeight || 0;
        var worldRect = rect(
            node.worldPosition.x - worldPos.width * worldPos.anchorX - extraWidth,
            node.worldPosition.y - worldPos.height * worldPos.anchorY - extraHeight,
            worldPos.width + extraWidth * 2,
            worldPos.height + extraHeight * 2,
        );
        return worldRect;
    }

    private checkAllItems(): void {
        if (!this.mTargetScrollView) return;

        let viewRect = this.getWorldRectOfNode(this.mTargetScrollView.node, 0, 0);
        switch (this.mSizeMode) {
            case LazyListView.SizeMode.indetermined: {
                let children = this.mTargetContainer.children;
                for (let i = 0; i < children.length; ++i) {
                    var itemNode = children[i];
                    var itemRect = this.getWorldRectOfNode(itemNode);
                    let uiOpacity = itemNode.getComponent(UIOpacity);
                    if (uiOpacity) {
                        if (itemRect.intersects(viewRect)) {
                            uiOpacity.opacity = 255;
                        } else {
                            uiOpacity.opacity = 0;
                        }
                    }
                }
                break;
            }
            case LazyListView.SizeMode.different: {
                this.mIndexOffset = 0;
                this.mUsingItemList = [];
                let indexOffset = null;
                let children = this.mTargetContainer.children;
                for (let i = 0; i < children.length; ++i) {
                    let itemData = this.mBindingData[i];
                    let blankNode = children[i];
                    let itemNode = blankNode.children[0];

                    let blankNodeRect = this.getWorldRectOfNode(blankNode);
                    if (blankNodeRect.intersects(viewRect)) {
                        if (!itemNode) {
                            itemNode = this.createItemNode(itemNode, itemData, i);
                            blankNode.addChild(itemNode);
                            blankNode.getComponent(Layout).enabled = true;
                        }
                        if (indexOffset == null) {
                            this.mIndexOffset = indexOffset = i;
                        }
                        this.mUsingItemList.push(itemNode);
                    } else {
                        if (itemNode) {
                            blankNode.getComponent(Layout).enabled = false;
                            itemNode.parent = null;
                            this.mCachedItemList.push(itemNode);
                        }
                    }
                }

                while (this.mUsingItemList.length + this.mCachedItemList.length > this.mKeepCount + this.mCacheCount) {
                    let itemNode = this.mCachedItemList.pop();
                    if (itemNode == undefined) break;
                }
                break;
            }
            case LazyListView.SizeMode.identical: {
                this.createEnoughItems();
                this.checkDirection(-1);
                this.checkDirection(1);
                break;
            }
            default: {
                assert(false, "not supported");
                break;
            }
        }
    }

    private createEnoughItems(): void {
        if (this.mUsingItemList.length < this.mBindingData.length && this.mUsingItemList.length < this.mKeepCount + this.mCacheCount) {
            for (var i = this.mIndexOffset - 1; i >= 0; --i) {
                if (this.mUsingItemList.length < this.mBindingData.length && this.mUsingItemList.length < this.mKeepCount + this.mCacheCount) {
                    var itemData = this.mBindingData[i];
                    var itemNode = this.createItemNode(null, itemData, i);
                    itemNode.position = this.calcItemPosition(itemNode, i);
                    this.mTargetContainer.insertChild(itemNode, 0);
                    this.mUsingItemList.unshift(itemNode);
                    this.mIndexOffset--;
                    DEBUG && assert(this.mIndexOffset >= 0, "fatal error");
                } else {
                    break;
                }
            }
            for (var i = this.mIndexOffset + this.mUsingItemList.length; i < this.mBindingData.length; ++i) {
                if (this.mUsingItemList.length < this.mBindingData.length && this.mUsingItemList.length < this.mKeepCount + this.mCacheCount) {
                    var itemData = this.mBindingData[i];
                    var itemNode = this.createItemNode(null, itemData, i);
                    itemNode.position = this.calcItemPosition(itemNode, i);
                    this.mTargetContainer.addChild(itemNode);
                    this.mUsingItemList.push(itemNode);
                } else {
                    break;
                }
            }
        }
    }

    private updateContentSize(): void {
        if (this.mTargetScrollView.vertical && !this.mTargetScrollView.horizontal) {
            var cellHeight = this.calcCellSize(null).height;
            var spacingY = this.mTargetLayout.spacingY;
            this.mTargetContainer.getComponent(UITransform).height = this.calcFullHeight();
            this.mKeepCount = Math.max(this.mKeepCount, 3 + Math.ceil(this.mTargetScrollView.node.getComponent(UITransform).height / (cellHeight + spacingY)));
        } else if (this.mTargetScrollView.horizontal && !this.mTargetScrollView.vertical) {
            var cellWidth = this.calcCellSize(null).width;
            var spacingX = this.mTargetLayout.spacingX;
            this.mTargetContainer.getComponent(UITransform).width = this.calcFullWidth();
            this.mKeepCount = Math.max(this.mKeepCount, 3 + Math.ceil(this.mTargetScrollView.node.getComponent(UITransform).width / (cellWidth + spacingX)));
        } else {
            assert(false, "not supported");
        }
    }

    private checkDirection(direction: number): void {
        if (this.mBindingData.length > 0) {
            let firstVisibleIndex = this.calcFirstVisibleItemIndex();
            let lastVisibleIndex = this.calcLastVisibleItemIndex();
            while (true) {
                let itemIndex = direction > 0 ? this.mIndexOffset + this.mUsingItemList.length : this.mIndexOffset - 1;
                if (itemIndex < 0 || itemIndex >= this.mBindingData.length) break;
                if (direction > 0 && itemIndex > lastVisibleIndex || direction < 0 && itemIndex < firstVisibleIndex) break;

                let itemData = this.mBindingData[itemIndex];
                let itemNode: Node = null;

                if (this.mUsingItemList.length > 0) {
                    let swapNodeIndex = direction > 0 ? 0 : this.mUsingItemList.length - 1;
                    let swapItemIndex = swapNodeIndex + this.mIndexOffset;
                    if (swapItemIndex < firstVisibleIndex || swapItemIndex > lastVisibleIndex) {
                        itemNode = this.mUsingItemList[swapNodeIndex];
                        this.mUsingItemList.splice(swapNodeIndex, 1);
                        if (direction > 0) this.mIndexOffset++;
                    }
                }

                itemNode = this.createItemNode(itemNode, itemData, itemIndex);
                itemNode.position = this.calcItemPosition(itemNode, itemIndex);
                if (direction > 0) {
                    this.mUsingItemList.push(itemNode);
                } else {
                    this.mUsingItemList.unshift(itemNode);
                    this.mIndexOffset--;
                    DEBUG && assert(this.mIndexOffset >= 0, "fatal error");
                }
                itemNode.parent = this.mTargetContainer;
            }
        }
    }

    private calcItemPosition(itemNode: Node, index: number): Vec3 {
        let cellSize = this.calcCellSize(null);
        let marginLeft = this.mTargetLayout.paddingLeft;
        let marginTop = this.mTargetLayout.paddingTop;
        let marginBottom = this.mTargetLayout.paddingBottom;
        let pos: Vec3 = v3(0, 0);
        let isGRID = this.mTargetLayout.type == Layout.Type.GRID;
        let itemNodeUiTransform = itemNode.getComponent(UITransform);

        if (this.mTargetScrollView.vertical && !this.mTargetScrollView.horizontal) {
            var spacingX = this.mTargetLayout.spacingX;
            let maxRow = 1 + Math.floor((this.mTargetScrollView.node.getComponent(UITransform).width - itemNodeUiTransform.width) / (itemNodeUiTransform.width + spacingX));
            let spacingY = this.mTargetLayout.spacingY;
            pos.x = marginLeft + (isGRID ? (index % maxRow) * (itemNodeUiTransform.width + spacingX) : 0);
            pos.y = marginTop + (itemNodeUiTransform.height + spacingY) * (index + 1) - spacingY;
            if (isGRID) {
                pos.y = marginTop + (itemNodeUiTransform.height + spacingY) * Math.ceil((index + 1) / maxRow) - spacingY;
            }
            pos.y = this.calcFullHeight() - pos.y;
        } else if (this.mTargetScrollView.horizontal && !this.mTargetScrollView.vertical) {
            let spacingX = this.mTargetLayout.spacingX;
            pos.x = marginLeft + (itemNodeUiTransform.width + spacingX) * index;
            pos.y = marginBottom;
        } else {
            assert(false, "not supported");
        }

        let uiTransform = this.mTargetContainer.getComponent(UITransform);
        pos.x -= uiTransform.width * uiTransform.anchorX;
        pos.x += itemNodeUiTransform.width * itemNodeUiTransform.anchorX;
        pos.y -= uiTransform.height * uiTransform.anchorY;
        pos.y += itemNodeUiTransform.height * itemNodeUiTransform.anchorY;

        return pos;
    }

    private calcFullWidth(): number {
        var cellWidth = this.calcCellSize(null).width;
        var marginLeft = this.mTargetLayout.paddingLeft;
        var marginRight = this.mTargetLayout.paddingRight;
        var spacingX = this.mTargetLayout.spacingX;
        return Math.max(this.mTargetScrollView.node.getComponent(UITransform).width, this.mBindingData.length * (cellWidth + spacingX) - spacingX + marginLeft + marginRight);
    }

    private calcFullHeight(): number {
        var cellHeight = this.calcCellSize(null).height;
        var marginTop = this.mTargetLayout.paddingTop;
        var marginBottom = this.mTargetLayout.paddingBottom;
        var spacingY = this.mTargetLayout.spacingY;
        return Math.max(this.mTargetScrollView.node.getComponent(UITransform).height, this.mBindingData.length * (cellHeight + spacingY) - spacingY + marginTop + marginBottom);
    }

    private calcFirstVisibleItemIndex(): number {
        if (this.mTargetScrollView.vertical) {
            var offsetY = this.mTargetScrollView.getScrollOffset().y;
            var marginTop = this.mTargetLayout.paddingTop;
            var spacingY = this.mTargetLayout.spacingY;
            var itemHeight = this.calcCellSize(null).height;
            return Math.max(0, Math.floor((offsetY - marginTop + spacingY) / (itemHeight + spacingY)));
        } else {
            var offsetX = this.mTargetScrollView.getScrollOffset().x;
            var marginLeft = this.mTargetLayout.paddingLeft;
            var spacingX = this.mTargetLayout.spacingX;
            var itemWidth = this.calcCellSize(null).width;
            return Math.max(0, Math.floor((offsetX - marginLeft + spacingX) / (itemWidth + spacingX)));
        }
    }

    private calcLastVisibleItemIndex(): number {
        if (this.mTargetScrollView.vertical) {
            var offsetY = this.mTargetScrollView.getScrollOffset().y;
            var marginTop = this.mTargetLayout.paddingTop;
            var spacingY = this.mTargetLayout.spacingY;
            var itemHeight = this.calcCellSize(null).height;
            var viewHeight = this.mTargetScrollView.node.getComponent(UITransform).height;
            return Math.max(0, Math.ceil((viewHeight + offsetY - marginTop + spacingY + viewHeight) / (itemHeight + spacingY)));
        } else {
            var offsetX = this.mTargetScrollView.getScrollOffset().x;
            var marginLeft = this.mTargetLayout.paddingLeft;
            var spacingX = this.mTargetLayout.spacingX;
            var itemWidth = this.calcCellSize(null).width;
            var viewWidth = this.mTargetScrollView.node.getComponent(UITransform).width;
            return Math.max(0, Math.ceil((viewWidth + offsetX - marginLeft + spacingX) / (itemWidth + spacingX)));
        }
    }

    private createNode(size?: Size | null, pos?: Vec3 | null, anchorPos?: Vec2 | null): Node {
        var node = new Node();
        node.name = "";
        if (size) {
            const uiTransform = node.getComponent(UITransform) || node.addComponent(UITransform);
            uiTransform.setContentSize(size);
        }
        if (pos) node.setPosition(pos);
        node.getComponent(UITransform).setAnchorPoint(anchorPos || new Vec2(0.5, 0.5));
        return node;
    }

    private createBlankNode(itemData: DATA): Node {
        var blankNode = this.createNode(this.calcCellSize(itemData));
        var layout = blankNode.addComponent(Layout);
        layout.enabled = false;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;
        if (this.mTargetScrollView.vertical && !this.mTargetScrollView.horizontal) {
            layout.type = Layout.Type.VERTICAL;
            layout.paddingTop = layout.paddingBottom = layout.spacingY = 0;
        } else if (this.mTargetScrollView.horizontal && !this.mTargetScrollView.vertical) {
            layout.type = Layout.Type.HORIZONTAL;
            layout.paddingLeft = layout.paddingRight = layout.spacingX = 0;
        } else {
            assert(false, "not supported");
        }
        return blankNode;
    }

    private createItemNode(itemNode: ItemNode, itemData: DATA, index: number): ItemNode {
        if (itemNode == null && this.mCachedItemList.length > 0) {
            itemNode = this.mCachedItemList.pop();
        }
        let node = this.createItemNodeEx(itemNode, itemData, index);
        if (this.mSizeMode == LazyListView.SizeMode.indetermined && node.getComponent(UIOpacity) == null) {
            node.addComponent(UIOpacity);
        }
        return node;
    }

    private createItemNodeEx(itemNode: ItemNode, itemData: DATA, index: number): ItemNode {
        return this.mSetOrCreateItem(itemNode, itemData, index);
    }

    protected onEnable(): void {
        this.checkAllItems();
        this.schedule(this.onTimer, 0.1);
    }

    protected onDisable(): void {
        this.unschedule(this.onTimer);
    }

    protected onScrolling(): void {
        this.checkAllItems();
    }

    protected onTimer(dt: number): void {
        if (this.mBindingData.length > 0 && this.mSetOrCreateItem) {
            switch (this.mSizeMode) {
                case LazyListView.SizeMode.indetermined: {
                    var count = 0;
                    if (this.mTargetContainer.children.length < this.mBindingData.length) {
                        for (var i = 0; i < this.mBindingData.length && count < 1; ++i) {
                            var itemData = this.mBindingData[i];
                            var itemNode = this.mTargetContainer.children[i];
                            if (!itemNode) {
                                itemNode = this.createItemNode(null, itemData, i);
                                this.mTargetContainer.insertChild(itemNode, i);
                                ++count;
                            }
                        }
                    }
                    if (count > 0) this.checkAllItems();
                    break;
                }
                case LazyListView.SizeMode.different: {
                    if (this.mUsingItemList.length + this.mCachedItemList.length < this.mKeepCount + this.mCacheCount) {
                        var itemNode = this.createItemNodeEx(null, this.mBindingData[0], 0);
                        this.mCachedItemList.push(itemNode);
                    }
                    break;
                }
                case LazyListView.SizeMode.identical: {
                    if (this.mUsingItemList.length + this.mCachedItemList.length < this.mKeepCount + this.mCacheCount) {
                        var itemNode = this.mSetOrCreateItem(null, this.mBindingData[0], 0);
                        this.mCachedItemList.push(itemNode);
                    }
                    break;
                }
            }
        }
    }

    protected onCleanup(): void {
        this.clearCachedItems();
    }
}

export module LazyListView {
    export enum SizeMode {
        indetermined = 0,   // 大小不可预知
        different = 1,      // 大小可预知，各项不同
        identical = 2,      // 大小可预知，各项相同
    }
}
