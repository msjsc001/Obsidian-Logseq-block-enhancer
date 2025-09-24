import { App, MarkdownPostProcessorContext, MarkdownRenderer, TFile } from 'obsidian';
import { IndexService } from '../services/IndexService';
import { BlockCache } from '../types';

export class LiveRenderer {
    private app: App;
    private indexService: IndexService;
    // Regex to find ((uuid)) style references, avoiding those inside {{embed}}
    private readonly blockRefRegex = /(?<!\{)\(\((([a-fA-F0-9]{8}-){4}[a-fA-F0-9]{12})\)\)(?!\})/g;
    // Regex to find {{embed ((uuid))}} style references
    private readonly embedRefRegex = /\{\{embed \(\((([a-fA-F0-9]{8}-){4}[a-fA-F0-9]{12})\)\)\}\}/g;


    constructor(app: App, indexService: IndexService) {
        this.app = app;
        this.indexService = indexService;
    }

    public process(element: HTMLElement, context: MarkdownPostProcessorContext) {
        // This processor is for Reading View.
        // We check if we are in a live preview source view, and if so, we do nothing.
        if (element.closest('.markdown-source-view')) {
            return;
        }
        this.processEmbeds(element);
        this.processReferences(element);
    }

    private processEmbeds(element: HTMLElement) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node;
        const nodesToReplace: { node: Text, uuid: string }[] = [];

        while (node = walker.nextNode()) {
            if (node.nodeValue?.match(this.embedRefRegex)) {
                const uuid = this.embedRefRegex.exec(node.nodeValue)?.[1];
                if(uuid) {
                    nodesToReplace.push({ node: node as Text, uuid });
                }
                this.embedRefRegex.lastIndex = 0; // Reset regex state
            }
        }
        
        nodesToReplace.forEach(({ node, uuid }) => {
            const container = document.createElement('span');
            container.classList.add("logseq-embed");
            node.replaceWith(container);
            this.renderBlock(uuid, container, true);
        });
    }
    
    private processReferences(element: HTMLElement) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let node;
        const nodesToReplace: { node: Text, uuid: string }[] = [];

        while (node = walker.nextNode()) {
            if (node.nodeValue?.match(this.blockRefRegex)) {
                const uuid = this.blockRefRegex.exec(node.nodeValue)?.[1];
                if(uuid) {
                    nodesToReplace.push({ node: node as Text, uuid });
                }
                 this.blockRefRegex.lastIndex = 0; // Reset regex state
            }
        }

        nodesToReplace.forEach(({ node, uuid }) => {
            const container = document.createElement('span');
            container.classList.add("logseq-reference");
            node.replaceWith(container);
            this.renderBlock(uuid, container, false);
        });
    }

    private async renderBlock(uuid: string, containerEl: HTMLElement, isEmbed: boolean) {
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
                this.renderBlock(childId, childEl, isEmbed);
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
        // Logseq paths are relative to the markdown file.
        // Obsidian needs paths relative to the vault root.
        // The asset path is like "../assets/image.png"
        const sourceFolder = sourcePath.substring(0, sourcePath.lastIndexOf('/'));
        // This is a simplified resolver. A more robust one might be needed for complex vaults.
        const path = `${sourceFolder}/${assetPath}`; // e.g., notes/../assets/image.png -> assets/image.png
        
        // Normalize the path (e.g., handle '..')
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