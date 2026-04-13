import { _decorator, Component, instantiate, Label, LabelOutline, Layout, Node, sys, UITransform, Widget, widgetManager } from 'cc';
import { oops } from '../../../../../extensions/oops-plugin-framework/assets/core/Oops';
import { LanguageData } from '../../../../../extensions/oops-plugin-framework/assets/libs/gui/language/LanguageData';
const { ccclass, property } = _decorator;

/** 阿拉伯语/RTL语言文本适配组件 */
@ccclass('ArabicAdapter')
export class ArabicAdapter extends Component {
    private lastText: string = "";
    private newRootNode: Node = null;
    private newNodeList: Node[] = [];
    private initWidth = -1;
    private dataId: string = "";

    onLoad() { }
    start() { }

    public startApater(childNode: Node, dataID: string) {
        if (sys.platform != sys.Platform.DESKTOP_BROWSER &&
            sys.platform != sys.Platform.MOBILE_BROWSER) return;

        let isDefault = LanguageData.isdefaultID(dataID);
        if (isDefault || !oops.language.needReverse) {
            return;
        }

        let text = childNode.getComponent(Label)?.string;
        if (!text) return;

        this.initWidth == -1 && (this.initWidth = childNode.getComponent(UITransform).width);
        this.newRootNode == null && (this.newRootNode = this.createRootNode(childNode));

        let array = text.split(/\n/);
        array.forEach((element, index) => {
            let newNode = this.newNodeList[index] || this.createNewNode(this.newRootNode, childNode, index);
            this.setRowText(newNode, element);
        });

        for (let i = array.length; i < this.newRootNode.children.length; i++) {
            this.newRootNode.children[i].active = false;
        }

        this.scheduleOnce(() => {
            let modelLabel = childNode.getComponent(Label);
            if (modelLabel == null) return;
            modelLabel.horizontalAlign = Label.HorizontalAlign.RIGHT;

            if (modelLabel.overflow == Label.Overflow.SHRINK ||
                modelLabel.overflow == Label.Overflow.RESIZE_HEIGHT) {
                this.adjustElementOverflow(modelLabel);
            } else {
                this.adjustRootWidth(childNode);
            }
        });

        this.lastText = text;
        childNode.getComponent(Label).enabled = false;
    }

    private adjustElementOverflow(modelLabel: Label): void {
        this.newNodeList.forEach((element) => {
            if (element.active) {
                let tmpWidth = 0;
                for (let i = 0; i < element.children.length; i++) {
                    let node = element.children[i];
                    if (!node.active) continue;

                    let value = this.initWidth - tmpWidth;
                    if (value >= 0) {
                        tmpWidth += node.getComponent(UITransform).width;
                        if (value < node.getComponent(UITransform).width) {
                            node.getComponent(UITransform).width = value;
                            node.getComponent(Label).overflow = modelLabel.overflow;
                        } else {
                            node.getComponent(Label).overflow = Label.Overflow.NONE;
                        }
                    } else {
                        node.active = false;
                    }
                }
            }
        });

        this.scheduleOnce(() => {
            this.adjustElementPostion();
        });
    }

    private adjustElementPostion(): void {
        let totalHeight = 0;
        this.newNodeList.forEach((element) => {
            if (element.active) {
                let tmpHeight = 0;
                for (let i = 0; i < element.children.length; i++) {
                    let node = element.children[i];
                    node.active && (tmpHeight = Math.max(tmpHeight, node.getComponent(UITransform).height));
                }

                element.getComponent(UITransform).height = tmpHeight;
                element.children.forEach(node => {
                    node.active && node.position.add3f(0, (tmpHeight - node.getComponent(UITransform).height) * 0.5, 0);
                });
                totalHeight += tmpHeight;
            }
        });

        if (this.node.getComponent(UITransform).height < totalHeight) {
            this.node.getComponent(UITransform).height = this.newRootNode.getComponent(UITransform).height = totalHeight;
        }
    }

    private adjustRootWidth(childNode: Node): void {
        let maxWidth = 0;
        this.newNodeList.forEach((element) => {
            if (element.active) {
                let curWidth = 0;
                for (let i = 0; i < element.children.length; i++) {
                    let node = element.children[i];
                    if (!node.active) continue;
                    curWidth += node.getComponent(UITransform).width;
                }
                maxWidth = Math.max(curWidth, maxWidth);
            }
        });

        this.newRootNode.getComponent(UITransform).width = childNode.getComponent(UITransform).width = maxWidth;
        this.newRootNode.children.forEach(element => {
            element.getComponent(UITransform).width = maxWidth;
        });
    }

    private createRootNode(parentNode: Node): Node {
        let rootNode = new Node();
        rootNode.name = "newRoot";
        rootNode.parent = parentNode;
        rootNode.layer = parentNode.layer;

        let widget = rootNode.addComponent(Widget);
        widget.alignFlags = widgetManager.AlignFlags.RIGHT | widgetManager.AlignFlags.LEFT | widgetManager.AlignFlags.TOP | widgetManager.AlignFlags.BOT;

        let layout = rootNode.addComponent(Layout);
        layout.type = Layout.Type.VERTICAL;
        layout.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
        layout.resizeMode = Layout.ResizeMode.CONTAINER;

        return rootNode;
    }

    private createNewNode(parentNode: Node, modelNode: Node, index): Node {
        let newNode = new Node();
        newNode.name = "newNode" + index;
        newNode.parent = parentNode;
        newNode.layer = parentNode.layer;
        this.newNodeList.push(newNode);

        let widget = newNode.addComponent(Widget);
        widget.alignFlags = widgetManager.AlignFlags.RIGHT | widgetManager.AlignFlags.LEFT;

        let layout = newNode.addComponent(Layout);
        layout.type = Layout.Type.HORIZONTAL;
        layout.horizontalDirection = Layout.HorizontalDirection.RIGHT_TO_LEFT;

        let labelNode = new Node();
        labelNode.parent = newNode;
        labelNode.layer = newNode.layer;
        labelNode.name = "sudLabel";

        let modelLabel = modelNode.getComponent(Label) || modelNode.addComponent(Label);
        let label = labelNode.addComponent(Label);
        label.color = modelLabel.color;
        label.font = modelLabel.font;
        label.fontAtlas = modelLabel.fontAtlas;
        label.fontFamily = modelLabel.fontFamily;
        label.fontSize = modelLabel.fontSize;
        label.lineHeight = modelLabel.lineHeight;
        label.useSystemFont = modelLabel.useSystemFont;
        label.horizontalAlign = Label.HorizontalAlign.RIGHT;
        label.verticalAlign = modelLabel.verticalAlign;
        label.isBold = modelLabel.isBold;
        label.isItalic = modelLabel.isItalic;
        label.isUnderline = modelLabel.isUnderline;

        newNode.getComponent(UITransform).height = modelLabel.lineHeight;

        let modelOutLine = modelNode.getComponent(LabelOutline);
        if (modelOutLine) {
            let labelOutline = labelNode.addComponent(LabelOutline);
            labelOutline.color = modelOutLine.color.clone();
            labelOutline.width = modelOutLine.width;
        }

        return newNode;
    }

    private setRowText(childNode: Node, text: string) {
        let list: string[] = [""];
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) < 128) {
                list[0] = text.substring(i, i + 1) + list[0];
            } else {
                if (list[0].trim() == "") {
                    list[0] = text;
                } else {
                    list[1] = text.substring(i);
                }
                break;
            }
        }

        let len = list.length - 1;
        let str = list[len];
        let idx = str.length - 1;
        for (; idx > 0; idx--) {
            if (str.charCodeAt(idx) >= 128) {
                break;
            }
        }

        if (idx != str.length - 1) {
            let tmp = str.substring(idx + 1).trim();
            if (tmp != "") {
                list[len] = str.substring(0, idx + 1) + " ";
                list[len + 1] = tmp == ")" ? "(" : str.substring(idx + 1);
            }
        }

        for (let i = 0; i < list.length; i++) {
            let label = childNode.children[i] || instantiate(childNode.children[0]);
            label.name = "sudLabel" + i;
            label.active = true;
            label.parent = childNode;
            label.getComponent(Label).string = list[i];
            label.getComponent(Label).overflow = Label.Overflow.NONE;
        }

        for (let i = list.length; i < childNode.children.length; i++) {
            childNode.children[i].active = false;
        }

        childNode.active = true;
    }
}
