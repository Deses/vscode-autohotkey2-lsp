import assert from 'assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CancellationToken, CodeAction } from 'vscode-languageserver';
import {
	Lexer, URI, clearLibSymbols, codeActionProvider, configCache, lexers, openFile, parseFolder,
	setWorkspaceFolders
} from '../common';

suite('Test code actions', () => {
	test('organize includes adds a missing include even when the request carries no diagnostics', async () => {
		const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-action-'));
		writeFileSync(join(root, 'Defs.ahk2'), 'class Widget {\n}\n');
		writeFileSync(join(root, 'Zed.ahk2'), 'class Zed {\n}\n');
		const usesPath = join(root, 'Uses.ahk2');
		writeFileSync(usesPath, '#Requires AutoHotkey v2.0\n#Include Zed.ahk2\n\nWidget.Run()\nZed.Run()\n');
		const previous = configCache.ExplicitContextOnly;
		configCache.ExplicitContextOnly = true;
		clearLibSymbols();
		setWorkspaceFolders(new Set([URI.file(root).toString().toLowerCase() + '/']));
		try {
			await parseFolder(root, true, 0);
			const uri = URI.file(usesPath).toString();
			const lex = new Lexer(openFile(usesPath)!);
			lexers[uri.toLowerCase()] = lex;
			lex.actived = true;
			lex.parseScript();
			const range = { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } };
			const actions = await codeActionProvider({
				textDocument: { uri }, range, context: { diagnostics: [], only: ['source.organizeImports'] }
			}, CancellationToken.None) as CodeAction[];
			const organize = actions.find(it => it.kind === 'source.organizeImports');
			assert.ok(organize);
			const text = organize.edit!.changes![uri].map(it => it.newText).join('\n');
			assert.match(text, /#Include Defs\.ahk2/);
			assert.match(text, /#Include Zed\.ahk2/);
		} finally {
			configCache.ExplicitContextOnly = previous;
			setWorkspaceFolders(new Set());
			for (const key of Object.keys(lexers))
				if (key.includes('ahk2-lsp-action-'))
					delete lexers[key];
			clearLibSymbols();
			rmSync(root, { recursive: true, force: true });
		}
	});
});
