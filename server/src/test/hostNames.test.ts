import assert from 'assert';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Lexer, configCache, lexers, openFile } from '../common';
import { hostNames } from '../hostNames';
import { getSymbolInfo } from '../symbolProvider';

function unsetWarnings(text: string) {
	const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-host-'));
	const path = join(root, 'Shared.ahk2'), previous = configCache.Warn?.VarUnset;
	configCache.Warn = { ...configCache.Warn, VarUnset: true };
	writeFileSync(path, text);
	try {
		const lex = new Lexer(openFile(path)!);
		lexers[lex.uri] = lex;
		lex.actived = true;
		lex.parseScript();
		getSymbolInfo(lex);
		return lex.diagnostics.map(d => d.message).filter(m => /never be assigned/.test(m));
	} finally {
		configCache.Warn = { ...configCache.Warn, VarUnset: previous };
		for (const key of Object.keys(lexers))
			if (key.includes('ahk2-lsp-host-'))
				delete lexers[key];
		rmSync(root, { recursive: true, force: true });
	}
}

suite('Test @host directive', () => {
	test('collects names from every directive, case-insensitively', () => {
		const document = TextDocument.create('file:///x.ahk2', 'ahk2', 1, '; @host CONF_FILE, GlobalReport\n  ;@HOST   Other\nx := 1\n');
		assert.deepEqual([...hostNames(document)].sort(), ['CONF_FILE', 'GLOBALREPORT', 'OTHER']);
	});

	test('silences only the declared names', () => {
		const body = '#Requires AutoHotkey v2.0\n\nShow() {\n    a := CONF_FILE\n    b := OTHER_FILE\n}\n';
		assert.equal(unsetWarnings(body).length, 2);
		const declared = unsetWarnings('#Requires AutoHotkey v2.0\n; @host CONF_FILE\n\nShow() {\n    a := CONF_FILE\n    b := OTHER_FILE\n}\n');
		assert.equal(declared.length, 1);
		assert.match(declared[0], /OTHER_FILE/);
	});
});
