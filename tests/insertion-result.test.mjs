import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const state = globalThis.__igsInsertionResultTest = { result: null, fileSaves: [], chatSaves: 0 };
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hostURL = moduleURL(`
    const state = globalThis.__igsInsertionResultTest;
    export const eventSource = { emit: async () => {} };
    export const event_types = {};
    export const appendMediaToMessage = () => {};
    export const updateMessageBlock = () => {};
    export const getRequestHeaders = () => ({});
    export const substituteParams = value => value;
    export const getContext = () => ({ chat: [], saveChat: async () => { state.chatSaves++; } });
    export const saveBase64AsFile = async (...args) => { state.fileSaves.push(args); return '/custom.png'; };
    export const getCharaFilename = () => 'test';
    export const getMessageTimeStamp = () => '';
    export const generateImage = async () => state.result;
    export const scanForTriggers = async () => [];
    export const compileLoraPrompts = () => '';
    export const getSettings = () => ({ styleProfiles: {} });
    export const getActiveProfile = () => ({});
`);
const source = (await readFile(new URL('../src/insertion.js', import.meta.url), 'utf8'))
    .replace(/from '(\.\.\/[^']+)'/g, `from '${hostURL}'`)
    .replace(/from '\.\/(connection|lora|profiles)\.js'/g, `from '${hostURL}'`)
    .replaceAll("'./i18n.js'", JSON.stringify(new URL('../src/i18n.js', import.meta.url).href));
const { processImageGeneration } = await import(moduleURL(source));
const profile = { settings: { insertType: 'disabled' }, promptConstruction: {}, hub: {}, loras: {} };

test('native image URL bypasses base64 storage while custom results retain file saving', async () => {
    state.result = { url: '/native.png' };
    await processImageGeneration(profile, 'scene', 0, '<pic="scene">');
    assert.equal(state.fileSaves.length, 0);
    assert.equal(state.chatSaves, 1);
    state.result = { format: 'png', data: 'base64' };
    await processImageGeneration(profile, 'scene', 0, '<pic="scene">');
    assert.equal(state.fileSaves.length, 1);
    assert.equal(state.fileSaves[0][0], 'base64');
    assert.equal(state.chatSaves, 2);
});

test('empty generation results fail before saving files or chat', async () => {
    const files = state.fileSaves.length;
    const chats = state.chatSaves;
    state.result = {};
    await assert.rejects(processImageGeneration(profile, 'scene', 0, ''), /no data/i);
    assert.equal(state.fileSaves.length, files);
    assert.equal(state.chatSaves, chats);
});
