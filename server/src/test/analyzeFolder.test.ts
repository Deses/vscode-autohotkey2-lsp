import assert from 'assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Diagnostic } from 'vscode-languageserver';
import { URI, clearLibSymbols, configCache, lexers, setWorkspaceFolders, utils } from '../common';
import { analyzeFolder, runProjectDiagnostics } from '../projectDiagnostics';

suite('Test analyze folder', () => {
	test('reports problems for closed files and keeps them through the project pass', async () => {
		const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-analyze-'));
		writeFileSync(join(root, 'Bad.ahk2'), '#Requires AutoHotkey v2.0\n\nShow() {\n    a := MissingValue\n}\n');
		writeFileSync(join(root, 'Good.ahk2'), '#Requires AutoHotkey v2.0\n\nShow() {\n    a := 1\n}\n');
		const sent = new Map<string, Diagnostic[]>();
		const previous = { send: utils.sendDiagnostics, project: configCache.ProjectMissingIncludes, warn: configCache.Warn };
		utils.sendDiagnostics = async (uri, diagnostics) => void sent.set(uri.toLowerCase(), diagnostics);
		configCache.ProjectMissingIncludes = true;
		configCache.Warn = { ...configCache.Warn, VarUnset: true };
		clearLibSymbols();
		setWorkspaceFolders(new Set([URI.file(root).toString().toLowerCase() + '/']));
		try {
			const result = await analyzeFolder(URI.file(root).toString());
			const messages = (name: string) => (sent.get(URI.file(join(root, name)).toString().toLowerCase()) ?? []).map(d => d.message);
			assert.equal(result.files, 2);
			assert.equal(result.problems, 1);
			assert.match(messages('Bad.ahk2')[0], /MissingValue/);
			assert.deepEqual(messages('Good.ahk2'), []);
			await runProjectDiagnostics();
			assert.match(messages('Bad.ahk2')[0], /MissingValue/);
		} finally {
			utils.sendDiagnostics = previous.send;
			configCache.ProjectMissingIncludes = previous.project;
			configCache.Warn = previous.warn;
			setWorkspaceFolders(new Set());
			for (const key of Object.keys(lexers))
				if (key.includes('ahk2-lsp-analyze-'))
					delete lexers[key];
			clearLibSymbols();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
