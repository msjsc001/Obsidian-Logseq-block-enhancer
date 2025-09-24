import { Plugin, TFile, TAbstractFile, Editor, MarkdownView, Notice } from 'obsidian';
import { IndexService } from './services/IndexService';
import { LiveRenderer } from './rendering/LiveRenderer';
import { BlockSuggest } from './editor/BlockSuggest';
import { buildLivePreviewExtension } from './editor/LivePreviewExtension';

// 定义插件设置的接口
interface LogseqBlockRefEnhancerSettings {
	// 未来可能会在这里添加设置
}

// 默认设置
const DEFAULT_SETTINGS: LogseqBlockRefEnhancerSettings = {
	// 默认值
};

export default class LogseqBlockRefEnhancer extends Plugin {
	settings: LogseqBlockRefEnhancerSettings;
	indexService: IndexService;
	liveRenderer: LiveRenderer;

	async onload() {
		await this.loadSettings();
		
		this.indexService = new IndexService(this.app, this.manifest.dir!);
		this.liveRenderer = new LiveRenderer(this.app, this.indexService);
		
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
			
			this.registerEditorExtension(buildLivePreviewExtension(this.app, this.indexService));
			this.registerMarkdownPostProcessor((element, context) => {
				this.liveRenderer.process(element, context);
			});

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
			// Generate a new ID and insert it
			blockId = crypto.randomUUID();
			const indentationMatch = lineContent.match(/^(\s*)/);
			const indentation = indentationMatch ? indentationMatch[1] : '';
			const idLine = `\n${indentation}  id:: ${blockId}`;

			editor.replaceRange(idLine, { line: line, ch: lineContent.length });

			// The file change will be picked up by the event handler, but we can add it to the index immediately
			// for a snappier response.
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
}