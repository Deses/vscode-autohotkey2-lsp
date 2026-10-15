import assert from 'assert';
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Diagnostic } from 'vscode-languageserver';
import { URI, clearLibSymbols, configCache, lexers, setWorkspaceFolders, utils } from '../common';
import { runProjectDiagnostics } from '../projectDiagnostics';

suite('Test project diagnostics', () => {
	test('reports a file that uses a class from a file it does not include', async () => {
		const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-project-'));
		const files: Record<string, string> = {
			'Defs.ahk2': 'class Widget {\n}\n',
			'Uses.ahk2': '#Requires AutoHotkey v2.0\n\nWidget.Run()\n',
			'Ready.ahk2': '#Requires AutoHotkey v2.0\n#Include Defs.ahk2\n\nWidget.Run()\n',
		};
		for (const [name, text] of Object.entries(files))
			writeFileSync(join(root, name), text);
		const sent = new Map<string, Diagnostic[]>();
		const previous = { send: utils.sendDiagnostics, project: configCache.ProjectMissingIncludes, explicit: configCache.ExplicitContextOnly };
		utils.sendDiagnostics = async (uri, diagnostics) => void sent.set(uri.toLowerCase(), diagnostics);
		configCache.ProjectMissingIncludes = true;
		configCache.ExplicitContextOnly = true;
		clearLibSymbols();
		setWorkspaceFolders(new Set([URI.file(root).toString().toLowerCase() + '/']));
		try {
			await runProjectDiagnostics();
			const messages = (name: string) => (sent.get(URI.file(join(root, name)).toString().toLowerCase()) ?? []).map(d => d.message);
			assert.equal(messages('Uses.ahk2').length, 1);
			assert.match(messages('Uses.ahk2')[0], /'Widget' is defined in Defs\.ahk2/);
			assert.deepEqual(messages('Ready.ahk2'), []);
			assert.deepEqual(messages('Defs.ahk2'), []);
		} finally {
			utils.sendDiagnostics = previous.send;
			configCache.ProjectMissingIncludes = previous.project;
			configCache.ExplicitContextOnly = previous.explicit;
			setWorkspaceFolders(new Set());
			for (const uri of Object.keys(lexers))
				if (uri.includes('ahk2-lsp-project-'))
					delete lexers[uri];
			clearLibSymbols();
			for (const name of Object.keys(files))
				unlinkSync(join(root, name));
			rmdirSync(root);
		}
	});
});
