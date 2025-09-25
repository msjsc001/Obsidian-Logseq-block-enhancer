import { App, Component, MarkdownRenderer } from "obsidian";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import { editorInfoField, Plugin } from 'obsidian';
import { addLoadingWidgetEffect, setRenderedWidgetEffect, blockReferenceField } from './BlockReferenceField';
import LogseqBlockRefEnhancer from "src/main";

export function createAsyncBlockRendererPlugin(plugin: LogseqBlockRefEnhancer) {
    return ViewPlugin.fromClass(
        class {
            private component: Component;
            private runningRenders: Map<number, AbortController> = new Map();
            private debouncedScan: () => void;

            constructor(private view: EditorView) {
                this.component = new Component();
                plugin.addChild(this.component); // 关联生命周期

                this.debouncedScan = this.debounce(this.scanAndRender.bind(this), 300);
                this.debouncedScan();
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.debouncedScan();
                }
            }

            destroy() {
                this.component.unload();
                this.runningRenders.forEach((controller) => controller.abort());
            }

            debounce(func: () => void, delay: number) {
                let timeout: NodeJS.Timeout;
                return () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(func, delay);
                };
            }

            scanAndRender() {
                const currentWidgets = this.view.state.field(blockReferenceField);
                const blockRefRegex = /\(\(([\w-]{36,})\)\)/g;
                // 使用 Map 来同时存储位置和提取到的 UUID
                const newRenderTargets = new Map<number, string>();

                for (const { from, to } of this.view.visibleRanges) {
                    const text = this.view.state.doc.sliceString(from, to);
                    let match;
                    while ((match = blockRefRegex.exec(text))) {
                        const pos = from + match.index;
                        const uuid = match[1];
                        newRenderTargets.set(pos, uuid);
                    }
                }

                // 取消不再可见的渲染
                for (const [pos, controller] of this.runningRenders.entries()) {
                    if (!newRenderTargets.has(pos)) {
                        controller.abort();
                        this.runningRenders.delete(pos);
                    }
                }

                for (const [pos, uuid] of newRenderTargets.entries()) {
                    let widgetExists = false;
                    currentWidgets.between(pos, pos, () => { widgetExists = true; });
                    
                    if (!widgetExists && !this.runningRenders.has(pos)) {
                        // 直接使用从 Map 中获取的、正确的 uuid
                        this.triggerRender(pos, uuid);
                    }
                }
            }

            async triggerRender(pos: number, uuid: string) {
                const controller = new AbortController();
                this.runningRenders.set(pos, controller);

                try {
                    // 1. 派发 "loading" 状态
                    this.view.dispatch({
                        effects: addLoadingWidgetEffect.of({ pos, uuid }),
                    });

                    console.log(`%c[Live Preview] Querying block: ${uuid}`, 'background: #222; color: #ff8c00');
                    const block = plugin.indexService.getBlock(uuid);
                    
                    if (controller.signal.aborted) return;

                    if (block) {
                        const el = document.createElement("div");
                        const sourcePath = this.view.state.field(editorInfoField).file?.path ?? "";
                        await MarkdownRenderer.render(plugin.app, block.rawContent, el, sourcePath, this.component);
                        
                        if (controller.signal.aborted) return;

                        // 2. 渲染完成后, 派发 "rendered" 状态
                        this.view.dispatch({
                            effects: setRenderedWidgetEffect.of({ pos, html: el.innerHTML }),
                        });
                    } else {
                        // 如果块不存在，也派发一个 "rendered" 状态来显示错误
                         this.view.dispatch({
                            effects: setRenderedWidgetEffect.of({ pos, html: `<span class="logseq-block-ref-enhancer-error">Block not found: ((${uuid}))</span>` }),
                        });
                    }
                } catch (e) {
                    console.error("Logseq Block Ref Enhancer Error:", e);
                } finally {
                    this.runningRenders.delete(pos);
                }
            }
        }
    );
}