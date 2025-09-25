import { StateField, StateEffect, RangeSet, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { BlockReferenceWidget } from "./BlockReferenceWidget";

// --- 消息定义 (StateEffects) ---

// 消息1: 请求在某个位置添加一个“加载中”状态的 Widget
export const addLoadingWidgetEffect = StateEffect.define<{ pos: number, uuid: string }>();

// 消息2: 请求将某个位置的 Widget 更新为“已渲染”状态，并提供 HTML 内容
export const setRenderedWidgetEffect = StateEffect.define<{ pos: number, html: string }>();

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
                const loadingWidget = Decoration.widget({
                    widget: new BlockReferenceWidget("loading"),
                    side: -1, // 确保光标可以在 widget 旁边
                }).range(effect.value.pos);
                widgets = widgets.update({ add: [loadingWidget] });
            } 
            else if (effect.is(setRenderedWidgetEffect)) {
                const renderedWidget = Decoration.widget({
                    widget: new BlockReferenceWidget("rendered", effect.value.html),
                    side: -1,
                }).range(effect.value.pos);

                // 关键：移除该位置的旧 widget，并添加新 widget
                widgets = widgets.update({
                    filter: (from) => from !== effect.value.pos,
                    add: [renderedWidget],
                });
            }
        }

        return widgets;
    },

    // 告诉编辑器，这个 StateField 提供了需要被渲染到视图中的装饰
    provide: (f) => EditorView.decorations.from(f),
});