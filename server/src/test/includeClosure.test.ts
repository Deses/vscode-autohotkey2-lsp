import assert from 'assert';
import { lexers } from '../common';
import type { Lexer } from '../lexer';
import { includeCache, includedCache, traverseInclude, updateIncludeCache } from '../lexer2';

type Graph = Record<string, string[]>;

function load(graph: Graph, modules: Record<string, Record<string, string[]>> = {}) {
	for (const uri in lexers)
		delete lexers[uri];
	for (const uri in graph) {
		const module = modules[uri] && Object.fromEntries(Object.entries(modules[uri])
			.map(([name, targets]) => [name, { include: toIncludes(targets) }]));
		lexers[uri] = { uri, fsPath: `${uri}.ahk`, is_virtual: false, include: toIncludes(graph[uri]), module } as unknown as Lexer;
	}
}

function toIncludes(targets: string[]) {
	return Object.fromEntries(targets.map(target => [target, `${target}.ahk`]));
}

function reachable(graph: Graph, from: string) {
	const seen = new Set<string>();
	const pending = [...graph[from] ?? []];
	let uri: string | undefined;
	while ((uri = pending.pop()) !== undefined) {
		if (seen.has(uri))
			continue;
		seen.add(uri);
		pending.push(...graph[uri] ?? []);
	}
	return seen;
}

function entries(cache: Record<string, string> | undefined) {
	return Object.entries(cache ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function expectedInclude(graph: Graph, uri: string) {
	const closure = [uri, ...reachable(graph, uri)].filter(u => u === uri || u in graph);
	return entries(Object.fromEntries(closure.map(u => [u, `${u}.ahk`])));
}

function expectedIncluded(graph: Graph, uri: string) {
	const ancestors = Object.keys(graph).filter(u => reachable(graph, u).has(uri));
	return entries(Object.fromEntries(ancestors.map(u => [u, `${u}.ahk`])));
}

function check(graph: Graph) {
	for (const uri in graph)
		assert.deepEqual(entries(includeCache[uri]), expectedInclude(graph, uri), `includeCache[${uri}]`);
	const targets = new Set(Object.keys(graph).concat(...Object.values(graph)));
	for (const uri of targets)
		assert.deepEqual(entries(includedCache[uri]), expectedIncluded(graph, uri), `includedCache[${uri}]`);
}

suite('Test include closure', () => {
	const shapes: Record<string, Graph> = {
		chain: { a: ['b'], b: ['c'], c: [] },
		diamond: { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] },
		cycle: { a: ['b'], b: ['a', 'c'], c: [] },
		selfInclude: { a: ['a', 'b'], b: [] },
		sharedLeaf: { a: ['c'], b: ['c'], c: ['d'], d: [] },
		unloadedInclude: { a: ['x', 'b'], b: ['x'] },
		twoCycles: { a: ['b'], b: ['a', 'c'], c: ['d'], d: ['c', 'e'], e: [] },
	};

	for (const [name, graph] of Object.entries(shapes)) {
		test(`${name} (full rebuild)`, () => {
			load(graph);
			updateIncludeCache();
			check(graph);
		});
		test(`${name} (per root)`, () => {
			load(graph);
			updateIncludeCache();
			for (const uri in graph)
				traverseInclude(lexers[uri]);
			check(graph);
		});
	}

	test('adding an include after the first traversal', () => {
		const graph: Graph = { a: ['b'], b: [], c: [] };
		load(graph);
		updateIncludeCache();
		graph.b = ['c'];
		lexers.b.include = toIncludes(graph.b);
		traverseInclude(lexers.b);
		traverseInclude(lexers.a);
		check(graph);
	});

	test('module includes are separate nodes', () => {
		load({ a: [], b: [], c: [] }, { a: { m: ['b'] } });
		updateIncludeCache();
		assert.deepEqual(entries(includeCache.a), [['a', 'a.ahk']]);
		assert.deepEqual(entries(includeCache['a|m']), [['a|m', ''], ['b', 'b.ahk']]);
		assert.deepEqual(entries(includedCache.b), [['a|m', '']]);
	});

	test('layered graph with 5^40 paths finishes quickly', () => {
		const layers = 40, width = 5, graph: Graph = {};
		for (let layer = 0; layer < layers; layer++)
			for (let i = 0; i < width; i++) {
				const next = layer + 1 < layers ? Array.from({ length: width }, (_, j) => `n${layer + 1}_${j}`) : [];
				graph[`n${layer}_${i}`] = next;
			}
		load(graph);
		const start = Date.now();
		updateIncludeCache();
		assert.ok(Date.now() - start < 2000, `took ${Date.now() - start} ms`);
		assert.equal(Object.keys(includeCache.n0_0).length, 1 + (layers - 1) * width);
		assert.equal(Object.keys(includedCache[`n${layers - 1}_0`]).length, (layers - 1) * width);
	});
});
