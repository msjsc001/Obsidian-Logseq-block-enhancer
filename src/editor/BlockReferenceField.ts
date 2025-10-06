import { StateField, StateEffect, RangeSet, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { BlockReferenceWidget } from "./BlockReferenceWidget";

// --- 消息定义 (StateEffects) ---

// 消息1: 请求在某个位置添加一个“加载中”状态的 Widget
export const addLoadingWidgetEffect = StateEffect.define<{ from: number, to: number, uuid: string }>();

// 消息2: 请求将某个位置的 Widget 更新为“已渲染”状态，并提供 HTML 内容
export const setRenderedWidgetEffect = StateEffect.define<{ from: number, to: number, html: string }>();

// --- 状态容器 (StateField) ---

export const blockReferenceField = StateField.define<DecorationSet>({
    // 创建一个空的装饰集
    create() {
        return Decoration.none;
    },

    // `update` 函数现在是状态机：它只响应传入的消息 (effects)
    update(widgets: DecorationSet, tr: Transaction): DecorationSet {
        // 首先，通过映射自动调整现有装饰的位置以响应文档变化
        widgets = widgets.map(tr.changes);

        // 然后，处理本交易中我们关心的所有消息
        for (const effect of tr.effects) {
            if (effect.is(addLoadingWidgetEffect)) {
                const { from, to } = effect.value;
                // 使用 replace+widget 一体化装饰，直接以小部件替换占位文本，避免排序冲突
                const loading = Decoration.replace({
                    widget: new BlockReferenceWidget("loading"),
                }).range(from, to);

                widgets = widgets.update({
                    // 移除与此范围重叠的旧装饰，避免重复
                    filter: (aFrom, aTo) => aTo <= from || aFrom >= to,
                    add: [loading],
                });
            }
            else if (effect.is(setRenderedWidgetEffect)) {
                const { from, to, html } = effect.value;
                const rendered = Decoration.replace({
                    widget: new BlockReferenceWidget("rendered", html),
                }).range(from, to);

                // 关键：移除与此范围重叠的旧装饰，并添加新的 replace+widget
                widgets = widgets.update({
                    filter: (aFrom, aTo) => aTo <= from || aFrom >= to,
                    add: [rendered],
                });
            }
        }

        return widgets;
    },

    // 告诉编辑器，这个 StateField 提供了需要被渲染到视图中的装饰
    provide: (f) => EditorView.decorations.from(f),
});