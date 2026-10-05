import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tr } from '../src/i18n.js';

test('UI text follows the host translator and falls back to English', () => {
    delete globalThis.SillyTavern;
    assert.equal(tr('igs.example', 'Connect'), 'Connect');
    globalThis.SillyTavern = { getContext: () => ({ translate: (fallback, key) =>
        key === 'igs.example' ? '连接' : fallback }) };
    assert.equal(tr('igs.example', 'Connect'), '连接');
    assert.equal(tr('igs.missing', 'Missing translation'), 'Missing translation');
    delete globalThis.SillyTavern;
});

test('named parameters are inserted literally once and unknown tokens survive', () => {
    globalThis.SillyTavern = { getContext: () => ({ translate: () => '删除「{name}」？{macroId}' }) };
    const params = { name: '$& {name} <b>用户名称</b>' };
    assert.equal(tr('igs.delete', 'Delete {name}?', params), '删除「$& {name} <b>用户名称</b>」？{macroId}');
    assert.deepEqual(params, { name: '$& {name} <b>用户名称</b>' });
    delete globalThis.SillyTavern;
});

test('registered Chinese catalog contains every UI key and matching parameters', async () => {
    const root = new URL('../', import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
    assert.equal(manifest.i18n['zh-cn'], 'locales/zh-cn.json');
    const catalog = JSON.parse(await readFile(new URL(manifest.i18n['zh-cn'], root), 'utf8'));
    const files = ['index.js', 'settings.html', 'src/settingsModal.js', 'src/connection.js',
        'src/detection.js', 'src/profiles.js', 'src/insertion.js'];
    const keys = new Set();
    const tokens = text => [...new Set(text.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || [])].sort();
    for (const file of files) {
        const source = await readFile(new URL(file, root), 'utf8');
        for (const match of source.matchAll(/\bigs\.[a-zA-Z][\w.-]*/g)) {
            if (!match[0].endsWith('.')) keys.add(match[0]);
        }
        for (const match of source.matchAll(/\btr\(\s*(['"])(igs\.[\w.-]+)\1\s*,\s*((?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*'))/g)) {
            const [, , key, literal] = match;
            const fallback = runInNewContext(literal);
            assert.deepEqual(tokens(catalog[key] || ''), tokens(fallback), `Parameters differ: ${key}`);
        }
        for (const match of source.matchAll(/\bT\(\s*(['"])([\w.-]+)\1\s*,\s*((?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*'))/g)) {
            const key = `igs.connectionUi.${match[2]}`;
            keys.add(key);
            assert.deepEqual(tokens(catalog[key] || ''), tokens(runInNewContext(match[3])), `Parameters differ: ${key}`);
        }
        if (file === 'src/connection.js') {
            const variables = source.match(/export const WORKFLOW_VARIABLES = (\[[\s\S]*?\]);/);
            for (const variable of runInNewContext(variables[1])) {
                keys.add(`igs.connectionUi.variable.${variable.name}`);
            }
        }
    }
    assert.ok(keys.size > 100, 'the settings and runtime UI should both be localized');
    for (const key of keys) assert.ok(catalog[key]?.trim(), `Missing Chinese translation: ${key}`);
    for (const [key, value] of Object.entries(catalog)) {
        assert.ok(key.startsWith('igs.'), `Unscoped translation: ${key}`);
        assert.equal(typeof value, 'string');
    }
});
