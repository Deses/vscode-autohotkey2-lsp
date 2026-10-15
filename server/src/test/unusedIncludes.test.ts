import assert from 'assert';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, clearLibSymbols, lexers, parseFolder, setWorkspaceFolders } from '../common';
import { organizeEdits } from '../organizeIncludes';
import { unusedIncludeLines } from '../unusedIncludes';

async function withProject(files: Record<string, string>, run: (root: string) => void) {
	const root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-unused-'));
	for (const [name, text] of Object.entries(files))
		writeFileSync(join(root, name), text);
	for (const uri of Object.keys(lexers))
		delete lexers[uri];
	clearLibSymbols();
	setWorkspaceFolders(new Set([URI.file(root).toString().toLowerCase() + '/']));
	try {
		await parseFolder(root, true, 0, Infinity);
		run(root);
	} finally {
		setWorkspaceFolders(new Set());
		for (const uri of Object.keys(lexers))
			delete lexers[uri];
		clearLibSymbols();
		for (const name of Object.keys(files))
			unlinkSync(join(root, name));
		rmdirSync(root);
	}
}

const project = {
	'Defs.ahk2': 'class Widget {\n}\n',
	'Other.ahk2': 'class Gadget {\n}\n',
	'Setup.ahk2': 'started := 1\nclass Thing {\n}\n',
	'Main.ahk2': '#Include Defs.ahk2\n#Include Other.ahk2\n#Include Setup.ahk2\n\nWidget.Run()\n',
};

function mainLexer(root: string) {
	return lexers[URI.file(join(root, 'Main.ahk2')).toString().toLowerCase()];
}

suite('Test unused includes', () => {
	test('removes a declaration-only include nothing uses, keeps the rest', () => withProject(project, root => {
		assert.deepEqual([...unusedIncludeLines(mainLexer(root))], [1]);
	}));

	test('keeps an include whose names a file that includes this one relies on', () => withProject(
		{ ...project, 'Boss.ahk2': '#Include Main.ahk2\n\nGadget.Run()\n' },
		root => assert.deepEqual([...unusedIncludeLines(mainLexer(root))], [])
	));

	test('organize deletes the unused line', () => withProject(project, root => {
		const lex = mainLexer(root);
		const result = TextDocument.applyEdits(lex.document, organizeEdits(lex, [], unusedIncludeLines(lex)));
		assert.equal(result, '#Include Defs.ahk2\n#Include Setup.ahk2\n\nWidget.Run()\n');
	}));

	test('organize deletes a block that is entirely unused', async () => {
		const text = '#Include Other.ahk2\n\nFoo()\n';
		await withProject({ ...project, 'Main.ahk2': text }, root => {
			const lex = mainLexer(root);
			const result = TextDocument.applyEdits(lex.document, organizeEdits(lex, [], unusedIncludeLines(lex)));
			assert.equal(result, '\nFoo()\n');
		});
	});
});
