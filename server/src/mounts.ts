import { resolve } from 'path';
import { URI } from 'vscode-uri';

interface Mount {
	realPrefix: string;
	mountPrefix: string;
}

let mounts: Mount[] = [];

function folderPrefix(fsPath: string) {
	return URI.file(fsPath).toString().replace(/\/?$/, '/');
}

export function hasMounts() {
	return mounts.length > 0;
}

export function setMounts(entries: { folder: string, mountedAt: string }[]) {
	const next = entries.filter(it => it.mountedAt).map(it => ({
		realPrefix: folderPrefix(it.folder),
		mountPrefix: folderPrefix(resolve(it.folder, it.mountedAt))
	})).filter(it => it.realPrefix.toLowerCase() !== it.mountPrefix.toLowerCase());
	const changed = next.length !== mounts.length || next.some((it, i) =>
		it.realPrefix !== mounts[i].realPrefix || it.mountPrefix !== mounts[i].mountPrefix);
	mounts = next;
	return changed;
}

export function mountedUri(uri: string) {
	if (!mounts.length || !uri.startsWith('file:'))
		return uri;
	const lower = uri.toLowerCase();
	for (const { realPrefix, mountPrefix } of mounts) {
		const prefix = realPrefix.toLowerCase();
		if (lower.startsWith(prefix))
			return mountPrefix + uri.slice(prefix.length);
	}
	return uri;
}

export function mountedKey(key: string) {
	return mounts.length ? mountedUri(key).toLowerCase() : key;
}
