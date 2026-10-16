import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';
import { DiagnosticCode, URI, configCache, lexers, parseFolder, sleep, symbolProvider, utils, workspaceFolders } from './common';

const published = new Set<string>();
const analyzed = new Set<string>();
let timer: NodeJS.Timeout | undefined;
let running = false;
let again = false;

export function scheduleProjectDiagnostics(delay = 3000) {
	if (process.env.BROWSER || !configCache.ProjectMissingIncludes)
		return;
	clearTimeout(timer);
	timer = setTimeout(runProjectDiagnostics, delay);
}

export async function runProjectDiagnostics() {
	if (running)
		return void (again = true);
	running = true;
	try {
		do {
			again = false;
			if (configCache.ProjectMissingIncludes)
				await publishMissingIncludes();
			else await clearPublished();
		} while (again);
	} finally {
		running = false;
	}
}

async function clearPublished() {
	for (const uri of published)
		await utils.sendDiagnostics?.(uri, []);
	published.clear();
}

async function publishMissingIncludes() {
	const checked = new Map<string, Diagnostic[]>();
	const uris: string[] = [];
	for (const folder of workspaceFolders)
		await parseFolder(URI.parse(folder).fsPath, true, 0, Infinity, uri => uris.push(uri));
	for (const uri of uris) {
		const lex = lexers[uri];
		if (!lex || lex.d || lex.actived || checked.has(lex.uri) || analyzed.has(lex.uri))
			continue;
		lex.parseScript();
		symbolProvider({ textDocument: { uri: lex.document.uri } });
		const names = new Set<string>();
		checked.set(lex.uri, lex.diagnostics.filter(d => d.code === DiagnosticCode.missing_include &&
			!names.has(d.data.unset.toUpperCase()) && names.add(d.data.unset.toUpperCase())));
		await sleep(0);
	}
	for (const [uri, diagnostics] of checked) {
		const lex = lexers[uri];
		if (lex.actived)
			continue;
		if (diagnostics.length || published.has(uri))
			await utils.sendDiagnostics?.(lex.document.uri, diagnostics);
		diagnostics.length ? published.add(uri) : published.delete(uri);
	}
	for (const uri of published)
		if (!checked.has(uri) && !analyzed.has(uri)) {
			await utils.sendDiagnostics?.(lexers[uri]?.document.uri ?? uri, []);
			published.delete(uri);
		}
}

export async function analyzeFolder(folderUri: string) {
	const uris: string[] = [];
	await parseFolder(URI.parse(folderUri).fsPath, true, 0, Infinity, uri => uris.push(uri));
	let files = 0, problems = 0;
	for (const uri of uris) {
		const lex = lexers[uri];
		if (!lex || lex.d || lex.actived)
			continue;
		lex.parseScript();
		lex.actived = true;
		try {
			symbolProvider({ textDocument: { uri: lex.document.uri } });
		} finally {
			lex.actived = false;
		}
		const diagnostics = lex.diagnostics.filter(d => (d.severity ?? DiagnosticSeverity.Error) <= DiagnosticSeverity.Warning);
		await utils.sendDiagnostics?.(lex.document.uri, diagnostics);
		analyzed.add(lex.uri);
		published.add(lex.uri);
		files++;
		problems += diagnostics.length;
		await sleep(0);
	}
	return { files, problems };
}
