import assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Lexer, URI, clearLibSymbols, lexers, openFile, parseFolder, setMounts, setWorkspaceFolders } from '../common';
import { findDefiningFiles } from '../includeActions';

suite('Test definers reached through a directory symlink', () => {
	for (const mounted of [false, true]) {
		test(mounted ? 'with the shared folder mounted elsewhere' : 'plain', async () => {
			const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-link-'));
			const shared = join(root, 'shared'), project = join(root, 'project'), other = join(root, 'other');
			mkdirSync(shared);
			mkdirSync(join(project, 'app'), { recursive: true });
			mkdirSync(join(other, 'app'), { recursive: true });
			symlinkSync(shared, join(project, 'app', 'commons'), 'junction');
			symlinkSync(shared, join(other, 'app', 'commons'), 'junction');
			writeFileSync(join(shared, 'Tool.ahk2'), 'class Tool {\n}\n');
			const usesPath = join(project, 'app', 'Uses.ahk2');
			writeFileSync(usesPath, '#Requires AutoHotkey v2.0\n\nTool.Run()\n');
			mounted && setMounts([{ folder: shared, mountedAt: '../other/app/commons' }]);
			clearLibSymbols();
			setWorkspaceFolders(new Set([project, shared, other].map(p => URI.file(p).toString().toLowerCase() + '/')));
			try {
				for (const folder of [project, shared, other])
					await parseFolder(folder, true, 0);
				const lex = new Lexer(openFile(usesPath)!);
				lexers[lex.uri] = lex;
				lex.parseScript();
				assert.deepEqual(findDefiningFiles(lex, 'Tool'), [join(project, 'app', 'commons', 'Tool.ahk2')]);
			} finally {
				setMounts([]);
				setWorkspaceFolders(new Set());
				for (const key of Object.keys(lexers))
					if (key.includes('ahk2-lsp-link-'))
						delete lexers[key];
				clearLibSymbols();
				rmSync(root, { recursive: true, force: true });
			}
		});
	}
});
