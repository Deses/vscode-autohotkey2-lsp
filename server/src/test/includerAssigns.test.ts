import assert from 'assert';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Diagnostic } from 'vscode-languageserver';
import { URI, clearLibSymbols, configCache, lexers, setWorkspaceFolders, utils } from '../common';
import { analyzeFolder } from '../projectDiagnostics';

suite('Test globals assigned by an including file', () => {
	test('a global assigned in the includer is not reported as never assigned', async () => {
		const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-includer-'));
		const files: Record<string, string> = {
			'Main.ahk2': '#Requires AutoHotkey v2.0\n#Include Sub.ahk2\n\nglobal CONF_FILE := "a.ini"\n',
			'Sub.ahk2': '#Requires AutoHotkey v2.0\n\nReadConf() {\n\tglobal CONF_FILE\n\treturn CONF_FILE\n}\n\nReadOther() {\n\treturn NEVER_SET\n}\n',
		};
		for (const [name, text] of Object.entries(files))
			writeFileSync(join(root, name), text);
		const sent = new Map<string, Diagnostic[]>();
		const previous = { send: utils.sendDiagnostics, project: configCache.ProjectMissingIncludes, explicit: configCache.ExplicitContextOnly, warn: configCache.Warn };
		utils.sendDiagnostics = async (uri, diagnostics) => void sent.set(uri.toLowerCase(), diagnostics);
		configCache.ProjectMissingIncludes = true;
		configCache.ExplicitContextOnly = true;
		configCache.Warn = { ...configCache.Warn, VarUnset: true };
		clearLibSymbols();
		setWorkspaceFolders(new Set([URI.file(root).toString().toLowerCase() + '/']));
		try {
			await analyzeFolder(URI.file(root).toString());
			const messages = (name: string) => (sent.get(URI.file(join(root, name)).toString().toLowerCase()) ?? []).map(d => d.message);
			const sub = messages('Sub.ahk2');
			assert.ok(sub.some(m => /NEVER_SET/.test(m)), 'a name nobody assigns is still reported');
			assert.ok(!sub.some(m => /CONF_FILE/.test(m)), 'a name the includer assigns is not');
		} finally {
			utils.sendDiagnostics = previous.send;
			configCache.ProjectMissingIncludes = previous.project;
			configCache.ExplicitContextOnly = previous.explicit;
			configCache.Warn = previous.warn;
			setWorkspaceFolders(new Set());
			for (const uri of Object.keys(lexers))
				if (uri.includes('ahk2-lsp-includer-'))
					delete lexers[uri];
			clearLibSymbols();
			for (const name of Object.keys(files))
				unlinkSync(join(root, name));
			rmdirSync(root);
		}
	});
});
