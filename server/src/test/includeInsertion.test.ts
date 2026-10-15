import assert from 'assert';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from '../common';
import { includeInsertion } from '../includeActions';
import { Lexer } from '../lexer';

const root = join(tmpdir(), 'ahk2-lsp-include-test');
const file = join(root, 'app', 'Main.ahk2');
const parentFile = join(root, 'Constants.ahk2');
const siblingFile = join(root, 'app', 'Other.ahk2');

function parse(text: string) {
	const lex = new Lexer(TextDocument.create(URI.file(file).toString(), 'ahk2', 1, text));
	lex.parseScript();
	return lex;
}

suite('Test includeInsertion', () => {
	test('goes after the last existing include, relative to the file', () => {
		const lex = parse('#Requires AutoHotkey v2.0\n#Include A.ahk2\n#Include B.ahk2\n\nFoo()\n');
		const { edit, texts } = includeInsertion(lex, [parentFile]);
		assert.deepEqual(texts, [`#Include ${relative(join(root, 'app'), parentFile)}`]);
		assert.deepEqual(edit.range.start, { line: 2, character: '#Include B.ahk2'.length });
		assert.equal(edit.newText, `\n#Include ${relative(join(root, 'app'), parentFile)}`);
	});

	test('goes after the header when there are no includes', () => {
		const lex = parse('#Requires AutoHotkey v2.0\n\nFoo()\n');
		const { edit } = includeInsertion(lex, [siblingFile]);
		assert.deepEqual(edit.range.start, { line: 2, character: 0 });
		assert.equal(edit.newText, '#Include Other.ahk2\n\n');
	});

	test('separates from a header that is directly followed by code', () => {
		const lex = parse('#Requires AutoHotkey v2.0\nFoo()\n');
		const { edit } = includeInsertion(lex, [siblingFile]);
		assert.deepEqual(edit.range.start, { line: 1, character: 0 });
		assert.equal(edit.newText, '\n#Include Other.ahk2\n\n');
	});

	test('goes at the top of a file without a header', () => {
		const lex = parse('Foo()\n');
		const { edit } = includeInsertion(lex, [siblingFile]);
		assert.deepEqual(edit.range.start, { line: 0, character: 0 });
		assert.equal(edit.newText, '#Include Other.ahk2\n\n');
	});

	test('several files go in one edit', () => {
		const lex = parse('#Requires AutoHotkey v2.0\n\nFoo()\n');
		const { edit } = includeInsertion(lex, [siblingFile, parentFile]);
		assert.equal(edit.newText.split('\n').filter(Boolean).length, 2);
	});
});
