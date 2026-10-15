import { Range, TextEdit } from 'vscode-languageserver';
import { includeInsertion } from './includeActions';
import type { Lexer } from './lexer';

const includeLine = /^(\s*)#Include(\s+\*i)?\s+([^;\r\n]*?)\s*(\s;.*)?$/i;

interface IncludeBlock {
	indent: string;
	start: number;
	lines: { text: string, path: string, skip: string }[];
}

function sortKey(path: string) {
	const parts = path.toLowerCase().split(/[\\/]/);
	return parts.map((part, i) => (i < parts.length - 1 ? '0' : '1') + part);
}

function compareKeys(a: string[], b: string[]) {
	for (let i = 0; i < Math.min(a.length, b.length); i++)
		if (a[i] !== b[i])
			return a[i] < b[i] ? -1 : 1;
	return a.length - b.length;
}

function isFileInclude(path: string) {
	return /\.(ahk2?|ah2)$/i.test(path) || path.startsWith('<') && path.endsWith('>');
}

function findBlocks(lines: string[]) {
	const blocks: IncludeBlock[] = [];
	let block: IncludeBlock | undefined;
	lines.forEach((line, i) => {
		const m = includeLine.exec(line);
		if (!m || !isFileInclude(m[3])) {
			block = undefined;
			return;
		}
		if (!block || block.indent !== m[1])
			blocks.push(block = { indent: m[1], start: i, lines: [] });
		block.lines.push({ text: line, path: m[3], skip: (m[2] ?? '').trim() });
	});
	return blocks;
}

export function organizeEdits(lex: Lexer, addPaths: string[]): TextEdit[] {
	const text = lex.document.getText();
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const lines = text.split(/\r?\n/);
	const blocks = findBlocks(lines);
	if (!blocks.length)
		return addPaths.length ? [includeInsertion(lex, addPaths).edit] : [];
	if (addPaths.length) {
		const last = blocks[blocks.length - 1];
		for (const added of includeInsertion(lex, addPaths).texts)
			last.lines.push({ text: last.indent + added, path: added.replace(/^#Include\s+/, ''), skip: '' });
	}
	const edits: TextEdit[] = [];
	for (const block of blocks) {
		const seen = new Set<string>();
		const unique = block.lines.filter(l => {
			const id = `${l.skip}|${l.path.toLowerCase().replaceAll('/', '\\')}`;
			return !seen.has(id) && seen.add(id);
		});
		const sorted = unique.map((l, i) => ({ l, key: sortKey(l.path), i }))
			.sort((a, b) => compareKeys(a.key, b.key) || a.i - b.i).map(x => x.l.text);
		const original = lines.slice(block.start, block.start + block.lines.length - (addPaths.length && block === blocks[blocks.length - 1] ? addPaths.length : 0));
		if (sorted.join(eol) === original.join(eol))
			continue;
		const endLine = block.start + original.length - 1;
		edits.push(TextEdit.replace(Range.create(block.start, 0, endLine, lines[endLine].length), sorted.join(eol)));
	}
	return edits;
}
