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
                const doc = this.view.state.doc;
                try { console.log('[Live Preview] scan start, docLen=%d', doc.length); } catch {}
                // 同时匹配 ASCII 双括号 ((UUID)) 与全角双括号 （（UUID））
                const blockRefRegex = new RegExp("(?:\\(\\(|\\uFF08\\uFF08)([\\w-]{36,})(?:\\)\\)|\\uFF09\\uFF09)", "g");
                // 使用 Map 来同时存储位置和提取到的 UUID
                const newRenderTargets = new Map<number, { from: number; to: number; uuid: string }>();
 
                // 扫描整篇文档，避免视口裁剪或折行导致未触发替换
                const text = doc.sliceString(0, doc.length);
                let match;
                while ((match = blockRefRegex.exec(text))) {
                    const start = match.index;
                    const end = start + match[0].length;
                    const uuid = match[1];
                    newRenderTargets.set(start, { from: start, to: end, uuid });
                }
                try { console.log('[Live Preview] matches=%d', newRenderTargets.size); } catch {}
 
                // 取消不再可见的渲染
                for (const [pos, controller] of this.runningRenders.entries()) {
                    if (!newRenderTargets.has(pos)) {
                        controller.abort();
                        this.runningRenders.delete(pos);
                    }
                }
 
                for (const [from, meta] of newRenderTargets.entries()) {
                    // 检查该范围内是否已有任何装饰（包括 replace 或 widget）
                    let hasDecoration = false;
                    currentWidgets.between(meta.from, meta.to, () => { hasDecoration = true; });
                    try { console.log('[Live Preview] schedule from=%d to=%d hasDeco=%s running=%s', meta.from, meta.to, String(hasDecoration), String(this.runningRenders.has(from))); } catch {}
                    
                    if (!hasDecoration && !this.runningRenders.has(from)) {
                        this.triggerRender(meta.from, meta.to, meta.uuid);
                    }
                }
            }

            async triggerRender(from: number, to: number, uuid: string) {
                const controller = new AbortController();
                this.runningRenders.set(from, controller);
 
                try {
                    // 1. 派发 "loading" 状态
                    try { console.log('[Live Preview] dispatch loading from=%d to=%d', from, to); } catch {}
                    this.view.dispatch({
                        effects: addLoadingWidgetEffect.of({ from, to, uuid }),
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
                        try { console.log('[Live Preview] dispatch rendered from=%d to=%d', from, to); } catch {}
                        this.view.dispatch({
                            effects: setRenderedWidgetEffect.of({ from, to, html: el.innerHTML }),
                        });
                    } else {
                        // 如果块不存在，也派发一个 "rendered" 状态来显示错误
                        try { console.log('[Live Preview] dispatch not-found from=%d to=%d', from, to); } catch {}
                        this.view.dispatch({
                            effects: setRenderedWidgetEffect.of({ from, to, html: `<span class="logseq-block-ref-enhancer-error">Block not found: ((${uuid}))</span>` }),
                        });
                    }
                } catch (e) {
                    console.error("Logseq Block Ref Enhancer Error:", e);
                } finally {
                    this.runningRenders.delete(from);
                }
            }
        }
    );
}