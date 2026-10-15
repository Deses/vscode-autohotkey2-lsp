import { lexers } from './common';
import type { Lexer } from './lexer';
import { findLibrary, includeCache } from './lexer2';
import { SymbolKind } from './lsp-enums';
import { includeLine, isFileInclude } from './organizeIncludes';

function wordsOf(text: string) {
	const words = text.replace(/^\s*#Include.*$/gim, '').match(/[A-Za-z_\u0080-￿][\w\u0080-￿]*/g) ?? [];
	return new Set(words.map(w => w.toUpperCase()));
}

function declarationsOnly(lex: Lexer) {
	return lex.is_parsed && lex.children.every(c => c.kind === SymbolKind.Class || c.kind === SymbolKind.Function);
}

export function unusedIncludeLines(lex: Lexer) {
	const words = new Map<string, Set<string>>();
	const scope = Object.keys(lex.getRelevance(false, true)).map(u => lexers[u]).filter(l => l && !l.d);
	const wordsFor = (l: Lexer) => {
		let set = words.get(l.uri);
		if (!set)
			words.set(l.uri, set = wordsOf(l.document.getText()));
		return set;
	};
	const entries: { line: number, target?: Lexer, removable: boolean }[] = [];
	lex.document.getText().split(/\r?\n/).forEach((text, line) => {
		const m = includeLine.exec(text);
		if (!m || !isFileInclude(m[3]))
			return;
		const found = findLibrary(m[3], lex.libdirs, lex.includedir.get(line) ?? lex.scriptpath, true);
		const target = found && lexers[found.uri];
		entries.push({ line, target, removable: !m[2] && !m[4] && !!target && target !== lex });
	});
	const unused = new Set<number>();
	for (const entry of entries) {
		if (!entry.removable)
			continue;
		const target = entry.target!;
		const covered = new Set<string>();
		for (const other of entries)
			if (other !== entry && other.target)
				Object.keys(includeCache[other.target.uri] ?? {}).forEach(u => covered.add(u));
		const exclusive = Object.keys(includeCache[target.uri] ?? {}).filter(u => !covered.has(u));
		const files = exclusive.map(u => lexers[u]);
		if (!files.length || files.some(f => !f || f.d || !declarationsOnly(f)))
			continue;
		const names = new Set(files.flatMap(f => Object.keys(f.declaration)));
		if (!names.size)
			continue;
		const own = new Set(exclusive);
		if (!scope.some(other => !own.has(other.uri) && wordsFor(other).values().some(w => names.has(w))))
			unused.add(entry.line);
	}
	return unused;
}
