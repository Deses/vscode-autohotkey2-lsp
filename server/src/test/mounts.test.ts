import assert from 'assert';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Diagnostic } from 'vscode-languageserver';
import {
	Lexer, URI, clearLibSymbols, configCache, hasMounts, lexers, mountAffects, mountedUri, mountsChanged, openFile,
	parseFolder, setMounts, setWorkspaceFolders, utils
} from '../common';
import { runProjectDiagnostics } from '../projectDiagnostics';

const key = (path: string) => URI.file(path).toString().toLowerCase();

suite('Test mounted folders', () => {
	let root: string, shared: string, host: string;
	let sent: Map<string, Diagnostic[]>;
	const previous = {} as { send?: typeof utils.sendDiagnostics, project?: boolean, explicit?: boolean };

	suiteSetup(() => {
		root = mkdtempSync(join(tmpdir(), 'ahk2-lsp-mount-'));
		shared = join(root, 'shared');
		host = join(root, 'host');
		mkdirSync(shared);
		mkdirSync(join(host, 'app'), { recursive: true });
		mkdirSync(join(host, 'types'));
		symlinkSync(shared, join(host, 'app', 'commons'), 'junction');
		writeFileSync(join(host, 'types', 'Extra.ahk2'), 'class Extra {\n\tstatic Run() => 1\n}\n');
		writeFileSync(join(shared, 'Core.ahk2'), '#Requires AutoHotkey v2.0\n#Include ..\\..\\types\\Extra.ahk2\n\nExtra.Run()\n');
		writeFileSync(join(shared, 'Loose.ahk2'), '#Requires AutoHotkey v2.0\n\nExtra.Run()\n');
		writeFileSync(join(host, 'app', 'Main.ahk2'), '#Requires AutoHotkey v2.0\n#Include commons\\Core.ahk2\n');
		previous.send = utils.sendDiagnostics;
		previous.project = configCache.ProjectMissingIncludes;
		previous.explicit = configCache.ExplicitContextOnly;
	});

	setup(() => {
		sent = new Map();
		utils.sendDiagnostics = async (uri, diagnostics) => void sent.set(uri.toLowerCase(), diagnostics);
		setMounts([{ folder: shared, mountedAt: '../host/app/commons' }]);
	});

	teardown(() => {
		setMounts([]);
		utils.sendDiagnostics = previous.send;
		configCache.ProjectMissingIncludes = previous.project;
		configCache.ExplicitContextOnly = previous.explicit;
		setWorkspaceFolders(new Set());
		for (const uri of Object.keys(lexers))
			if (uri.includes('ahk2-lsp-mount-'))
				delete lexers[uri];
		clearLibSymbols();
	});

	suiteTeardown(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('maps uris under the mounted folder and leaves the rest alone', () => {
		assert.ok(hasMounts());
		const file = URI.file(join(shared, 'Core.ahk2')).toString();
		assert.equal(mountedUri(file).toLowerCase(), key(join(host, 'app', 'commons', 'Core.ahk2')));
		const other = URI.file(join(host, 'app', 'Main.ahk2')).toString();
		assert.equal(mountedUri(other), other);
		setMounts([]);
		assert.equal(mountedUri(file), file);
	});

	test('lexers lookups by the real uri reach the lexer keyed at the mount', () => {
		const path = join(shared, 'Core.ahk2');
		const lex = new Lexer(openFile(path)!);
		lexers[key(path)] = lex;
		assert.equal(lex.uri, key(join(host, 'app', 'commons', 'Core.ahk2')));
		assert.equal(lex.document.uri.toLowerCase(), key(path));
		assert.equal(lexers[lex.uri], lex);
		assert.equal(lexers[key(path)], lex);
		assert.ok(key(path) in lexers);
		assert.deepEqual(Object.keys(lexers).filter(k => k.includes('ahk2-lsp-mount-')), [lex.uri]);
		delete lexers[key(path)];
		assert.equal(lexers[lex.uri], undefined);
	});

	test('keys outside the mounted folder are used exactly as given', () => {
		const builtin = 'file:///c%3A/Ext/Syntaxes/Ahk2.d.ahk';
		const lex = new Lexer(openFile(join(shared, 'Core.ahk2'))!);
		lexers[builtin] = lex;
		assert.equal(lexers[builtin], lex);
		assert.deepEqual(Object.keys(lexers).filter(k => k === builtin), [builtin]);
		delete lexers[builtin];
		assert.equal(lexers[builtin], undefined);
	});

	test('a mount change only affects uris inside the old or new mount', () => {
		const affects = mountAffects([{ folder: shared, mountedAt: '../elsewhere' }]);
		assert.equal(affects(URI.file(join(shared, 'Core.ahk2')).toString()), true);
		assert.equal(affects(URI.file(join(host, 'app', 'commons', 'Core.ahk2')).toString()), true);
		assert.equal(affects(URI.file(join(root, 'elsewhere', 'X.ahk2')).toString()), true);
		assert.equal(affects(URI.file(join(host, 'app', 'Main.ahk2')).toString()), false);
		assert.equal(affects('file:///c%3A/Ext/Syntaxes/Ahk2.d.ahk'), false);
	});

	test('mountsChanged compares against the active table without applying it', () => {
		assert.equal(mountsChanged([{ folder: shared, mountedAt: '../host/app/commons' }]), false);
		assert.equal(mountsChanged([]), true);
		assert.ok(hasMounts());
	});

	test('relative includes resolve through the mount into the host', () => {
		const lex = new Lexer(openFile(join(shared, 'Core.ahk2'))!);
		lex.parseScript();
		const included = Object.values(lex.include).map(p => p.toLowerCase());
		assert.deepEqual(included, [join(host, 'types', 'Extra.ahk2').toLowerCase()]);
	});

	test('the project pass reports on the real file and keeps one lexer per file', async () => {
		configCache.ProjectMissingIncludes = true;
		configCache.ExplicitContextOnly = true;
		clearLibSymbols();
		setWorkspaceFolders(new Set([key(shared) + '/', key(host) + '/']));
		const hostLoaded = new Lexer(openFile(join(host, 'app', 'Main.ahk2'))!);
		lexers[hostLoaded.uri] = hostLoaded;
		hostLoaded.parseScript();
		await parseFolder(shared, true, 0);
		await runProjectDiagnostics();
		const messages = (path: string) => (sent.get(key(path)) ?? []).map(d => d.message);
		assert.match(messages(join(shared, 'Loose.ahk2')).join('\n'), /'Extra' is defined in \.\.\\\.\.\\types\\Extra\.ahk2/);
		assert.deepEqual(messages(join(shared, 'Core.ahk2')), []);
		assert.equal(sent.has(key(join(host, 'app', 'commons', 'Loose.ahk2'))), false);
		const lexs = Object.keys(lexers).filter(k => k.endsWith('/core.ahk2'));
		assert.equal(lexs.length, 1);
		assert.equal(lexers[key(join(shared, 'Core.ahk2'))].document.uri.toLowerCase(), key(join(shared, 'Core.ahk2')));
	});
});
