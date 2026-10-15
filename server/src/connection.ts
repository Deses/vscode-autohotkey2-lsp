import {
	DidChangeConfigurationNotification, FileChangeType, InitializeResult, MessageActionItem,
	ProposedFeatures, ShowMessageRequest, TextDocuments, TextDocumentSyncKind
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	a_Vars, ahkVars, chinesePunctuations, codeActionProvider, colorPresentation,
	colorProvider, completionProvider, configCache, defintionProvider, documentFormatting, enumNames,
	fullySemanticToken, getRequestHandlers, hoverProvider, initCaches, initLocalize, isahk2_h, Lexer, lexers,
	loadSyntax, LSConfig, MessageType, mountAffects, mountsChanged, parseProject, parseUserLib, prepareRename, rangeFormatting,
	readTextFile, referenceProvider, renameProvider, resolvePath, SemanticTokenModifiers, semanticTokensOnFull,
	semanticTokensOnRange, SemanticTokenTypes, setIsAhkH, setLocale, setMounts, setRootDir, setWorkspaceFolders,
	signatureProvider, symbolProvider, typeFormatting, updateConfig, URI, utils, winapis, workspaceSymbolProvider
} from './common';
import { inlayHintProvider } from './inlayHintProvider';
import { scheduleProjectDiagnostics } from './projectDiagnostics';

export let connection: ProposedFeatures.Connection;
export const documents = new TextDocuments(TextDocument);
const workspaceFolders = new Set<string>();
const folderUris = new Map<string, string>();
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
export let isInitialized = false;
let uri_switch_to_ahk2 = '';

export function setConnection(conn: ProposedFeatures.Connection, extensionUri = '.') {
	connection = conn;
	connection.onInitialize(async params => {
		const capabilities = params.capabilities;
		const configs: LSConfig = params.initializationOptions ?? {};
		const result: InitializeResult = {
			serverInfo: { name: 'ahk2-language-server', },
			capabilities: {
				codeActionProvider: { codeActionKinds: ['quickfix', 'refactor.rewrite', 'source.organizeImports'] },
				colorProvider: true,
				completionProvider: { resolveProvider: false, triggerCharacters: `.#*@'"`.split('') },
				definitionProvider: true,
				documentFormattingProvider: true,
				documentOnTypeFormattingProvider: { firstTriggerCharacter: '}', moreTriggerCharacter: ['\n', ...Object.keys(chinesePunctuations)] },
				documentRangeFormattingProvider: true,
				documentSymbolProvider: true,
				foldingRangeProvider: true,
				hoverProvider: true,
				inlayHintProvider: true,
				referencesProvider: true,
				renameProvider: { prepareProvider: true },
				semanticTokensProvider: {
					legend: { tokenTypes: enumNames(SemanticTokenTypes), tokenModifiers: enumNames(SemanticTokenModifiers), },
					full: true, range: true
				},
				signatureHelpProvider: { triggerCharacters: ['(', ',', ' '] },
				textDocumentSync: { change: TextDocumentSyncKind.Incremental, openClose: true },
				workspaceSymbolProvider: true,
			}
		};
		for (const [k, v] of Object.entries(getRequestHandlers(configs.commands)))
			connection.onRequest(k, v);
		hasConfigurationCapability = !!capabilities.workspace?.configuration;
		hasWorkspaceFolderCapability = !!capabilities.workspace?.workspaceFolders;
		if (hasWorkspaceFolderCapability) {
			params.workspaceFolders?.forEach(it => addFolder(it.uri));
			result.capabilities.workspace = { workspaceFolders: { supported: true } };
		}

		if (process.env.BROWSER)
			setIsAhkH(true);
		else configs.fullySemanticToken && fullySemanticToken();
		setRootDir(configs.extensionUri ?? extensionUri);
		setLocale(configs.locale ?? params.locale);
		await initLocalize();
		initCaches();
		const prev = ahkVars;
		updateConfig(configs);
		setWorkspaceFolders(workspaceFolders);
		if (process.env.BROWSER) {
			loadSyntax();
			loadSyntax('ahk2_h', 5);
			loadSyntax('winapi', 2);
		} else {
			await utils.setInterpreter?.(resolvePath(configCache.InterpreterPath ??= ''));
			prev === ahkVars && loadSyntax();
		}
		return result;
	});
	connection.onInitialized(() => {
		if (hasConfigurationCapability)
			connection.client.register(DidChangeConfigurationNotification.type);
		if (hasWorkspaceFolderCapability) {
			connection.workspace.onDidChangeWorkspaceFolders(event => {
				event.removed.forEach(it => removeFolder(it.uri));
				event.added.forEach(it => addFolder(it.uri));
				setWorkspaceFolders(workspaceFolders);
				loadMounts().then(() => scheduleProjectDiagnostics(1500));
			});
		}
		isInitialized = true;
		loadMounts().then(() => scheduleProjectDiagnostics(1500));
		if (process.env.BROWSER) return;
		utils.updateStatusBar?.(a_Vars.ahkpath ? undefined : '');
		utils.getDllExport?.(['user32', 'kernel32', 'comctl32', 'gdi32'].map(name => `C:\\Windows\\System32\\${name}.dll`))
			.then(val => winapis.push(...val));
	});
	connection.onDidChangeConfiguration(async change => {
		let newset: LSConfig | undefined = change?.settings;
		if (hasConfigurationCapability && !newset)
			newset = await connection.workspace.getConfiguration('AutoHotkey2');
		if (!newset) {
			connection.window.showWarningMessage('Failed to obtain the configuration');
			return;
		}
		const { AutoLibInclude, InterpreterPath, Syntaxes } = configCache, prev = ahkVars;
		updateConfig(newset);
		setWorkspaceFolders(workspaceFolders);
		loadMounts().then(() => scheduleProjectDiagnostics(1000));
		if (process.env.BROWSER) return;
		if (InterpreterPath !== configCache.InterpreterPath)
			await utils.setInterpreter?.(resolvePath(configCache.InterpreterPath ??= ''));
		if (AutoLibInclude !== configCache.AutoLibInclude) {
			if ((configCache.AutoLibInclude > 1) && (AutoLibInclude <= 1))
				parseUserLib();
			if ((configCache.AutoLibInclude & 1) && !(AutoLibInclude & 1))
				documents.keys().forEach(uri => parseProject(uri.toLowerCase()));
		}
		if (prev === ahkVars && Syntaxes !== configCache.Syntaxes) {
			initCaches(), loadSyntax();
			if (isahk2_h)
				loadSyntax('ahk_h', 5), loadSyntax('winapi', 2);
		}
	});
	!process.env.BROWSER && connection.onDidChangeWatchedFiles((change) => {
		let lex;
		for (const c of change.changes)
			switch (c.type) {
				case FileChangeType.Changed:
					if ((lex = lexers[c.uri.toLowerCase()])?.actived === false)
						TextDocument.update(lex.document, [{ text: readTextFile(lex.fsPath) ?? '' }], 0), lex.update();
					break;
				case FileChangeType.Deleted:
					lexers[c.uri.toLowerCase()]?.close(true);
					break;
			}
		scheduleProjectDiagnostics(1500);
	});

	documents.listen(connection);
	documents.onDidChangeContent(e => (lexers[e.document.uri.toLowerCase()]?.update(), scheduleProjectDiagnostics()));
	documents.onDidClose(e => (lexers[e.document.uri.toLowerCase()]?.close(), scheduleProjectDiagnostics(1500)));
	documents.onDidOpen(e => openDocument(e.document));

	connection.languages.inlayHint.on(inlayHintProvider);
	connection.languages.semanticTokens.on(semanticTokensOnFull);
	connection.languages.semanticTokens.onRange(semanticTokensOnRange);
	connection.onCodeAction(codeActionProvider);
	connection.onCompletion(completionProvider);
	connection.onColorPresentation(colorPresentation);
	connection.onDocumentColor(colorProvider);
	connection.onDefinition(defintionProvider);
	connection.onDocumentFormatting(documentFormatting);
	connection.onDocumentRangeFormatting(rangeFormatting);
	connection.onDocumentOnTypeFormatting(typeFormatting);
	connection.onDocumentSymbol(symbolProvider);
	connection.onFoldingRanges(params => lexers[params.textDocument.uri.toLowerCase()]?.folding_ranges);
	connection.onHover(hoverProvider);
	connection.onPrepareRename(prepareRename);
	connection.onReferences(referenceProvider);
	connection.onRenameRequest(renameProvider);
	connection.onSignatureHelp(signatureProvider);
	connection.onWorkspaceSymbol(workspaceSymbolProvider);
	connection.onNotification('resetInterpreter', path => utils.setInterpreter?.(configCache.InterpreterPath = path));
	connection.onNotification('changeIndent', (params: { uri: string, value: string }) =>
		(lexers[params.uri.toLowerCase()] ?? {}).indent = params.value);
	connection.onNotification('closeTextDocument', (params: { uri: string, id: string }) => {
		if (params.id === 'ahk2')
			lexers[params.uri.toLowerCase()]?.close(true);
		else uri_switch_to_ahk2 = params.uri;
	});
	Object.assign(utils, {
		sendDiagnostics,
		sendNotification,
		sendRequest,
		showMessage,
	});
	connection.listen();
}

function openDocument(document: TextDocument) {
	const uri = document.uri.toLowerCase();
	let lex = lexers[uri];
	if (lex) lex.document = document;
	else lexers[uri] = lex = new Lexer(document);
	lex.actived = true;
	scheduleProjectDiagnostics();
	if (uri_switch_to_ahk2 === document.uri)
		lex.actionwhenv1 = 'Continue';
	if (process.env.BROWSER) return;
	Object.defineProperty(lex.include, '', { value: '', enumerable: false });
	if (configCache.AutoLibInclude & 1)
		parseProject(uri).then(() => lex.last_diags &&
			Object.keys(lex.included).length && lex.update());
}

function addFolder(uri: string) {
	const key = uri.toLowerCase() + '/';
	workspaceFolders.add(key);
	folderUris.set(key, uri);
}

function removeFolder(uri: string) {
	const key = uri.toLowerCase() + '/';
	workspaceFolders.delete(key);
	folderUris.delete(key);
}

async function loadMounts() {
	if (process.env.BROWSER || !hasConfigurationCapability)
		return;
	const folders = [...folderUris.values()];
	const values: (string | null | undefined)[] = await connection.workspace.getConfiguration(
		folders.map(scopeUri => ({ scopeUri, section: 'AutoHotkey2.MountedAt' })));
	const entries = folders.map((uri, i) => ({ folder: URI.parse(uri).fsPath, mountedAt: values[i] ?? '' }));
	if (!mountsChanged(entries))
		return;
	const affected = mountAffects(entries), open = new Set<TextDocument>();
	for (const lex of new Set(Object.values(lexers))) {
		if (!affected(lex.document.uri) && !affected(lex.uri))
			continue;
		lex.actived && open.add(lex.document);
		lex.close(true);
	}
	setMounts(entries);
	open.forEach(openDocument);
}

function sendDiagnostics(uri: string, diagnostics = []) {
	return connection.sendDiagnostics({ uri, diagnostics });
}

export function sendNotification(method: string, params?: unknown) {
	connection.sendNotification(method, params);
}

function sendRequest<T>(method: string, params?: unknown) {
	return connection.sendRequest<T>(method, params);
}

function showMessage(type: MessageType, message: string, ...actions: MessageActionItem[]) {
	return connection.sendRequest<MessageActionItem | null>(ShowMessageRequest.method, { type, message, actions });
}
