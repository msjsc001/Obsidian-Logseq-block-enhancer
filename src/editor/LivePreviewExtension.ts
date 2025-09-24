import { ViewPlugin, Decoration, DecorationSet, ViewUpdate, EditorView } from "@codemirror/view";
import { App } from "obsidian";
import { IndexService } from "src/services/IndexService";
import { BlockRefWidget } from "./cm6-widget";

export function buildLivePreviewExtension(app: App, indexService: IndexService) {
    // Regex for ((uuid)) but not when inside {{embed ...}}
    const blockRefRegex = /(?<!\{\{embed\s)\(\((([a-fA-F0-9]{8}-){4}[a-fA-F0-9]{12})\)\)/g;
    const embedRefRegex = /\{\{embed \(\((([a-fA-F0-9]{8}-){4}[a-fA-F0-9]{12})\)\)\}\}/g;

    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(view: EditorView) {
                this.decorations = this.buildDecorations(view);
            }

            update(update: ViewUpdate) {
                if (update.docChanged || update.viewportChanged) {
                    this.decorations = this.buildDecorations(update.view);
                }
            }

            private buildDecorations(view: EditorView): DecorationSet {
                const widgets: any[] = [];
                
                for (const { from, to } of view.visibleRanges) {
                    const text = view.state.doc.sliceString(from, to);
                    
                    let embedMatch;
                    while ((embedMatch = embedRefRegex.exec(text))) {
                        const start = from + embedMatch.index;
                        const end = start + embedMatch[0].length;
                        const uuid = embedMatch[1];
                        widgets.push(
                            Decoration.replace({
                                widget: new BlockRefWidget(app, indexService, uuid, true),
                            }).range(start, end)
                        );
                    }

                    let refMatch;
                    while ((refMatch = blockRefRegex.exec(text))) {
                         // We need to check if this range is already covered by an embed widget.
                        const start = from + refMatch.index;
                        const end = start + refMatch[0].length;
                        const uuid = refMatch[1];

                        const isCovered = widgets.some(d => d.from <= start && d.to >= end);
                        if (isCovered) continue;

                        widgets.push(
                            Decoration.replace({
                                widget: new BlockRefWidget(app, indexService, uuid, false),
                            }).range(start, end)
                        );
                    }
                }
                return Decoration.set(widgets, true);
            }
        },
        {
            decorations: (v) => v.decorations,
        }
    );
}