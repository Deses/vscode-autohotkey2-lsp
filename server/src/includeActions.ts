import { relative, sep } from 'path';
import { CodeAction, CodeActionKind, Diagnostic, Position, TextEdit } from 'vscode-languageserver';
import { URI, codeaction, diagnostic, libSymbols, parseProject } from './common';
import type { Lexer } from './lexer';

const scans = new Map<string, Promise<void>>();
const headerLine = /^\s*(;.*)?$|^\s*#(requires|singleinstance|warn|noTrayIcon|persistent|winactivateforce)\b/i;

function projectDir(lex: Lexer) {
	const dir = lex.workspaceFolder ? URI.parse(lex.workspaceFolder).fsPath : lex.scriptdir;
	return dir.toLowerCase().replace(/[\\/]$/, '') + sep;
}

function scanProject(lex: Lexer, rescan = false) {
	const key = lex.workspaceFolder || lex.scriptdir;
	if (rescan)
		scans.delete(key);
	let scan = scans.get(key);
	if (!scan)
		scans.set(key, scan = parseProject(lex.uri, 0));
	return scan;
}

export function missingIncludeInfo(lex: Lexer, name: string) {
	const files = findDefiningFiles(lex, name);
	if (!files.length)
		return;
	const shown = files.slice(0, 3).map(file => relative(lex.scriptpath, file));
	return diagnostic.missinginclude(name, shown.join(' or ') + (files.length > 3 ? ', ...' : ''));
}

export function findDefiningFiles(lex: Lexer, name: string) {
	const upper = name.toUpperCase(), dir = projectDir(lex), paths: string[] = [];
	for (const uri in libSymbols) {
		const symbols = libSymbols[uri], path = symbols.fsPath;
		if (uri === lex.uri || !path || !path.toLowerCase().startsWith(dir))
			continue;
		if (symbols.some(s => s.name.toUpperCase() === upper))
			paths.push(path);
	}
	return paths.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

export function includeInsertion(lex: Lexer, paths: string[]): { edit: TextEdit, texts: string[] } {
	const { document } = lex;
	let last = -1;
	lex.includedir.forEach((_, line) => last = Math.max(last, line));
	const base = (last >= 0 && lex.includedir.get(last)) || lex.scriptpath;
	const texts = paths.map(path => `#Include ${relative(base, path).replace(/(\s);/g, '$1`;')}`);
	if (last >= 0) {
		const length = document.getText({ start: { line: last, character: 0 }, end: { line: last + 1, character: 0 } }).replace(/\r?\n$/, '').length;
		const position: Position = { line: last, character: length };
		return { edit: TextEdit.insert(position, '\n' + texts.join('\n')), texts };
	}
	let line = 0;
	while (line < document.lineCount) {
		const content = document.getText({ start: { line, character: 0 }, end: { line: line + 1, character: 0 } });
		if (!headerLine.test(content.replace(/\r?\n$/, '')))
			break;
		line++;
	}
	const previous = line > 0 && document.getText({ start: { line: line - 1, character: 0 }, end: { line, character: 0 } }).trim();
	return { edit: TextEdit.insert({ line, character: 0 }, (previous ? '\n' : '') + texts.join('\n') + '\n\n'), texts };
}

export interface MissingInclude {
	diagnostic: Diagnostic;
	paths: string[];
}

export async function resolveMissingIncludes(lex: Lexer, diagnostics: Diagnostic[]) {
	const names = new Map<string, MissingInclude>();
	for (const d of diagnostics)
		names.has(d.data.unset.toUpperCase()) || names.set(d.data.unset.toUpperCase(), { diagnostic: d, paths: [] });
	if (!names.size)
		return names;
	await scanProject(lex);
	for (const [upper, missing] of names) {
		missing.paths = findDefiningFiles(lex, upper);
		if (!missing.paths.length) {
			await scanProject(lex, true);
			missing.paths = findDefiningFiles(lex, upper);
		}
	}
	return names;
}

export function includeQuickFixes(lex: Lexer, names: Map<string, MissingInclude>, uri: string): CodeAction[] {
	const acts: CodeAction[] = [], unique: string[] = [];
	for (const { diagnostic, paths } of names.values()) {
		paths.length === 1 && unique.push(paths[0]);
		for (const path of paths.slice(0, 5)) {
			const { edit, texts } = includeInsertion(lex, [path]);
			acts.push({
				kind: CodeActionKind.QuickFix, diagnostics: [diagnostic], isPreferred: paths.length === 1,
				title: codeaction.addinclude(texts[0].replace(/^#Include /, '')),
				edit: { changes: { [uri]: [edit] } }
			});
		}
	}
	const distinct = [...new Set(unique)];
	if (distinct.length > 1) {
		const { edit } = includeInsertion(lex, distinct);
		acts.push({
			kind: CodeActionKind.QuickFix, title: codeaction.addincludes(String(distinct.length)),
			edit: { changes: { [uri]: [edit] } }
		});
	}
	return acts;
}
