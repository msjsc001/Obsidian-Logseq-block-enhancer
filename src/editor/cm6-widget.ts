import { WidgetType } from "@codemirror/view";
import { App, MarkdownRenderer } from "obsidian";
import { IndexService } from "src/services/IndexService";

export class BlockRefWidget extends WidgetType {
    constructor(
        private readonly app: App,
        private readonly indexService: IndexService,
        private readonly uuid: string,
        private readonly isEmbed: boolean
    ) {
        super();
    }

    toDOM() {
        const container = document.createElement(this.isEmbed ? "div" : "span");
        container.classList.add(this.isEmbed ? "logseq-embed" : "logseq-reference");
        this.renderContent(container, this.uuid);
        return container;
    }
    
    private async renderContent(containerEl: HTMLElement, uuid: string) {
        const block = this.indexService.getBlock(uuid);

        if (!block) {
            containerEl.setText(`((Block Ref Not Found: ${uuid}))`);
            containerEl.classList.add('logseq-error');
            return;
        }

        containerEl.empty();
        
        const contentEl = containerEl.createDiv();
        await MarkdownRenderer.render(this.app, block.rawContent, contentEl, block.filePath, null as any);

        this.correctAssetPaths(contentEl, block.filePath);

        if (block.childrenIDs && block.childrenIDs.length > 0) {
            const childrenContainer = containerEl.createDiv({ cls: 'logseq-children' });
            for (const childId of block.childrenIDs) {
                const childEl = childrenContainer.createDiv({ cls: 'logseq-child' });
                this.renderContent(childEl, childId);
            }
        }
    }
    
    private correctAssetPaths(element: HTMLElement, sourcePath: string) {
        const links = element.querySelectorAll('a');
        const images = element.querySelectorAll('img');

        links.forEach(link => {
            const href = link.getAttribute('href');
            if (href?.startsWith('../assets/')) {
                const newPath = this.resolveAssetPath(href, sourcePath);
                link.setAttribute('href', newPath);
                link.classList.add('internal-link');
            }
        });

        images.forEach(img => {
            const src = img.getAttribute('src');
            if (src?.startsWith('../assets/')) {
                const newPath = this.resolveAssetPath(src, sourcePath);
                img.setAttribute('src', this.app.vault.adapter.getResourcePath(newPath));
            }
        });
    }

    private resolveAssetPath(assetPath: string, sourcePath: string): string {
        const sourceFolder = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
        const path = `${sourceFolder}/${assetPath}`;
        
        const parts = path.split('/');
        const result = [];
        for(let i=0; i < parts.length; i++) {
            const part = parts[i];
            if (part === '..') {
                result.pop();
            } else if (part !== '.') {
                result.push(part);
            }
        }
        return result.join('/');
    }
}