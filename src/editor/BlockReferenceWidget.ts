import { WidgetType } from "@codemirror/view";

/**
 * 这是一个纯粹的“视图”组件。
 * 它只根据传入的状态来决定自己应该显示什么，不包含任何异步逻辑。
 */
export class BlockReferenceWidget extends WidgetType {
    constructor(readonly state: "loading" | "rendered", readonly content?: string) {
        super();
    }

    eq(other: BlockReferenceWidget): boolean {
        // 只有当状态和内容都完全相同时，才认为两个 Widget 相等，以避免不必要的重绘
        return this.state === other.state && this.content === other.content;
    }

    toDOM(): HTMLElement {
        const container = document.createElement("div");
        container.className = "logseq-block-ref-enhancer-widget";

        if (this.state === "loading") {
            container.setText("Loading..."); // 显示加载提示
            container.addClass("is-loading");
        } else if (this.state === "rendered" && this.content) {
            container.innerHTML = this.content; // 直接渲染已完成的 HTML
        } else {
            // 错误或未知状态
            container.setText("Error: Invalid state");
            container.addClass("is-error");
        }

        return container;
    }
}