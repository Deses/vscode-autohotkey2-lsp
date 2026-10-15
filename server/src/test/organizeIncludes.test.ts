import assert from 'assert';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from '../common';
import { Lexer } from '../lexer';
import { organizeEdits } from '../organizeIncludes';

const root = join(tmpdir(), 'ahk2-lsp-organize-test');
const file = join(root, 'app', 'Main.ahk2');

function organize(text: string, add: string[] = []) {
	const document = TextDocument.create(URI.file(file).toString(), 'ahk2', 1, text);
	const lex = new Lexer(document);
	lex.parseScript();
	return TextDocument.applyEdits(document, organizeEdits(lex, add));
}

suite('Test organizeIncludes', () => {
	test('sorts folders before files, case-insensitive', () => {
		const result = organize([
			'#Include ..\\commons\\utils\\Logger.ahk2',
			'#Include LibBattle.ahk2',
			'#Include ..\\commons\\types\\PixelDef.ahk2',
			'#Include ..\\ui_navigation\\Compendium.ahk2',
			'#Include ..\\commons\\LibCommon.ahk2',
			''
		].join('\n'));
		assert.equal(result, [
			'#Include ..\\commons\\types\\PixelDef.ahk2',
			'#Include ..\\commons\\utils\\Logger.ahk2',
			'#Include ..\\commons\\LibCommon.ahk2',
			'#Include ..\\ui_navigation\\Compendium.ahk2',
			'#Include LibBattle.ahk2',
			''
		].join('\n'));
	});

	test('blocks separated by a blank line or a comment stay separate', () => {
		const text = '#Include B.ahk2\n#Include A.ahk2\n\n#Include D.ahk2\n; keep\n#Include C.ahk2\n';
		assert.equal(organize(text), '#Include A.ahk2\n#Include B.ahk2\n\n#Include D.ahk2\n; keep\n#Include C.ahk2\n');
	});

	test('removes duplicate lines and keeps trailing comments', () => {
		const text = '#Include B.ahk2 ; the base\n#Include a.ahk2\n#Include b.ahk2\n';
		assert.equal(organize(text), '#Include a.ahk2\n#Include B.ahk2 ; the base\n');
	});

	test('a directory include is a barrier', () => {
		const text = '#Include b.ahk2\n#Include a.ahk2\n#Include somedir\n#Include d.ahk2\n#Include c.ahk2\n';
		assert.equal(organize(text), '#Include a.ahk2\n#Include b.ahk2\n#Include somedir\n#Include c.ahk2\n#Include d.ahk2\n');
	});

	test('an already sorted file is left alone', () => {
		const text = '#Requires AutoHotkey v2.0\n#Include A.ahk2\n#Include B.ahk2\n\nFoo()\n';
		assert.equal(organize(text), text);
	});

	test('keeps CRLF line endings', () => {
		const text = '#Include B.ahk2\r\n#Include A.ahk2\r\n';
		assert.equal(organize(text), '#Include A.ahk2\r\n#Include B.ahk2\r\n');
	});

	test('a missing include joins the last block and is sorted in', () => {
		const added = join(root, 'app', 'A2.ahk2');
		const result = organize('#Include B.ahk2\n#Include A.ahk2\n\nFoo()\n', [added]);
		assert.equal(result, `#Include A.ahk2\n#Include ${relative(join(root, 'app'), added)}\n#Include B.ahk2\n\nFoo()\n`);
	});
});
