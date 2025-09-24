import { Plugin } from 'obsidian';

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

	async onload() {
		console.log('Loading Logseq Block Ref Enhancer plugin...');

		await this.loadSettings();

		// 在这里添加插件核心逻辑的初始化代码
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
}