import assert from 'assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { lexers } from '../common';
import { Lexer } from '../lexer';

function loaded(uri: string, workspaceFolder: string) {
	const lex = new Lexer(TextDocument.create(uri, 'ahk2', 1, ''));
	lex.uri = uri;
	lex.workspaceFolder = workspaceFolder;
	lex.include = { 'file:///other.ahk2': 'other.ahk2' };
	lex.last_diags = 1;
	lex.actived = true;
	lexers[uri] = lex;
	return lex;
}

suite('Test closing a lexer', () => {
	test('a file in a workspace folder keeps its include list', () => {
		const lex = loaded('file:///project/a.ahk2', 'file:///project/');
		lex.close();
		assert.equal(lexers[lex.uri], lex);
		assert.deepEqual(Object.keys(lex.include), ['file:///other.ahk2']);
		assert.equal(lex.last_diags, 0);
		delete lexers[lex.uri];
	});

	test('a file outside any workspace folder is dropped', () => {
		const lex = loaded('file:///elsewhere/b.ahk2', '');
		lex.close();
		assert.equal(lexers[lex.uri], undefined);
		assert.deepEqual(Object.keys(lex.include), []);
	});
});
