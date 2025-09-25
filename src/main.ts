import { Plugin, TFile, TAbstractFile, Editor, MarkdownView, Notice, MarkdownPostProcessorContext, MarkdownRenderer, MarkdownRenderChild, App } from 'obsidian';
import { IndexService } from './services/IndexService';
import { BlockSuggest } from './editor/BlockSuggest';
import { blockReferenceField } from './editor/BlockReferenceField';
import { createAsyncBlockRendererPlugin } from './editor/AsyncBlockRendererPlugin';
// StateField 和 Decoration 的类型不再需要在 main.ts 中直接引用
// import { StateField, RangeSet } from '@codemirror/state';
// import { Decoration } from '@codemirror/view';

// 定义插件设置的接口
interface LogseqBlockRefEnhancerSettings {
	// 未来可能会在这里添加设置
}

// 默认设置
const DEFAULT_SETTINGS: LogseqBlockRefEnhancerSettings = {
	// 默认值
};

class BlockRenderChild extends MarkdownRenderChild {
    constructor(
        containerEl: HTMLElement,
        private readonly markdown: string,
        private readonly app: App,
        private readonly sourcePath: string
    ) {
        super(containerEl);
    }

    async onload() {
        // 在子组件的生命周期内渲染 Markdown
        await MarkdownRenderer.render(this.app, this.markdown, this.containerEl, this.sourcePath, this);
    }
}


export default class LogseqBlockRefEnhancer extends Plugin {
	settings: LogseqBlockRefEnhancerSettings;
	indexService: IndexService;

	async onload() {
		await this.loadSettings();
		
		this.indexService = new IndexService(this.app, this.manifest.dir!);
		
		this.addCommand({
			id: 'rebuild-logseq-block-index',
			name: 'Rebuild block reference index',
			callback: () => {
				this.indexService.buildIndex();
			},
		});

		this.addCommand({
			id: 'copy-logseq-block-reference',
			name: 'Copy current block\'s Logseq reference',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				this.handleCopyBlockReference(editor, view);
			},
		});

		this.app.workspace.onLayoutReady(async () => {
			await this.indexService.initialize();
			
			// 确保在索引准备就绪后，再注册所有依赖它的功能
			this.registerMarkdownPostProcessor(this.readingModeRenderer.bind(this));
			
			const asyncPlugin = createAsyncBlockRendererPlugin(this);
			this.registerEditorExtension([blockReferenceField, asyncPlugin]);

			this.registerEditorSuggest(new BlockSuggest(this.app, this.indexService));
			
			this.setupFileEvents();
		});
	}

	setupFileEvents() {
		this.registerEvent(this.app.vault.on('create', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.indexService.processFileChange(file);
			}
		}));

		this.registerEvent(this.app.vault.on('modify', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.indexService.processFileChange(file);
			}
		}));

		this.registerEvent(this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.indexService.processFileDelete(file.path);
			}
		}));

		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				this.indexService.processFileRename(oldPath, file.path);
			}
		}));
	}

	onunload() {
		console.log('Unloading Logseq Block Ref Enhancer plugin.');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async handleCopyBlockReference(editor: Editor, view: MarkdownView) {
		const file = view.file;
		if (!file) return;

		const cursor = editor.getCursor();
		const line = cursor.line;
		const lineContent = editor.getLine(line);

		// Check if it is a block line
		const blockMatch = lineContent.match(/^\s*-\s(.+)/);
		if (!blockMatch) {
			new Notice('This line is not a valid Logseq block.');
			return;
		}

		let existingBlock = this.indexService.findBlockByFileAndLine(file.path, line);

		let blockId: string;

		if (existingBlock) {
			blockId = existingBlock.id;
		} else {
			blockId = crypto.randomUUID();
			const indentationMatch = lineContent.match(/^(\s*)/);
			const indentation = indentationMatch ? indentationMatch[1] : '';
			const idLine = `\n${indentation}  id:: ${blockId}`;

			editor.replaceRange(idLine, { line: line, ch: lineContent.length });
			
			this.indexService.addBlock(blockId, {
				filePath: file.path,
				rawContent: blockMatch[1],
				startLine: line,
				childrenIDs: [],
			});
		}

		navigator.clipboard.writeText(`((${blockId}))`);
		new Notice('Block reference copied to clipboard!');
	}

	async readingModeRenderer(element: HTMLElement, context: MarkdownPostProcessorContext) {
        const blockRefRegex = /\(\(([\w-]{36,})\)\)/g;
        // 使用 TreeWalker 查找所有包含我们引用的文本节点
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        const nodesToProcess: Text[] = [];

        // 步骤 1: 先收集所有相关的文本节点，避免在遍历时修改 DOM
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            if (node.nodeValue && blockRefRegex.test(node.nodeValue)) {
                nodesToProcess.push(node);
            }
            blockRefRegex.lastIndex = 0; // 重置正则表达式以备下次测试
        }

        // 步骤 2: 处理所有收集到的节点
        for (const node of nodesToProcess) {
            const text = node.nodeValue!;
            let lastIndex = 0;
            let match;
            const fragment = document.createDocumentFragment();

            blockRefRegex.lastIndex = 0; // 每次处理新节点时重置

            while ((match = blockRefRegex.exec(text))) {
                const uuid = match[1];
                console.log(`[Reading Mode] Querying block: ${uuid}`);
                const blockContent = this.indexService.getBlock(uuid)?.rawContent;
                const placeholder = match[0];
                const start = match.index;

                // 添加占位符之前的所有文本
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, start)));
                
                if (blockContent) {
                    // 步骤 3: 创建容器并使用 MarkdownRenderChild 管理生命周期
                    const container = document.createElement('div');
                    container.addClass('logseq-block-embed');
                    context.addChild(new BlockRenderChild(container, blockContent, this.app, context.sourcePath));
                    fragment.appendChild(container);
                } else {
                    // 如果块未找到，则仅显示占位符文本
                    const errorSpan = document.createElement('span');
                    errorSpan.addClass('logseq-block-ref-enhancer-error');
                    errorSpan.setText(placeholder);
                    fragment.appendChild(errorSpan);
                }
                lastIndex = start + placeholder.length;
            }

            // 添加最后一个匹配项之后的所有文本
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));

            // 步骤 4: 用我们精心构建的 fragment 替换原始的文本节点
            node.parentNode?.replaceChild(fragment, node);
        }
    }
}