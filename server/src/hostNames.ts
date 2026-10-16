import { TextDocument } from 'vscode-languageserver-textdocument';

const directive = /^[ \t]*;[ \t]*@host[ \t]+(.+?)[ \t]*$/gim;

export function hostNames(document: TextDocument): Set<string> {
	const names = new Set<string>();
	for (const match of document.getText().matchAll(directive))
		for (const name of match[1].split(/[\s,]+/))
			name && names.add(name.toUpperCase());
	return names;
}
