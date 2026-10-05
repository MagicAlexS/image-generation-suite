import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TAG_SCENE_PROMPT, TAG_CHARACTER_PROMPT } from '../src/promptTemplates.js';

// Exercise the real profiles, LoRA matching, and event handlers with only
// SillyTavern host services and the image backend replaced by local doubles.
const source = file => readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
const moduleURL = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const state = globalThis.__igsPromptInjectionTest = {
    extension_settings: {}, handlers: new Map(), chat: [], saves: 0,
    classifications: 0, generations: [],
};
globalThis.toastr = Object.fromEntries(['info', 'warning', 'error', 'success'].map(key => [key, () => {}]));
const hostURL = moduleURL(`
    const state = globalThis.__igsPromptInjectionTest;
    export const extension_settings = state.extension_settings;
    export const event_types = { CHAT_COMPLETION_PROMPT_READY: 'prompt', MESSAGE_RECEIVED: 'message' };
    export const eventSource = {
        on(type, handler) { state.handlers.set(type, handler); },
        removeListener(type, handler) { if (state.handlers.get(type) === handler) state.handlers.delete(type); }
    };
    export function getContext() { return { chat: state.chat }; }
    export function saveSettingsDebounced() { state.saves++; }
    export function regexFromString(value) {
        const end = value.lastIndexOf('/');
        return new RegExp(value.slice(1, end), value.slice(end + 1));
    }
`);
const templatesURL = moduleURL(await source('promptTemplates.js'));
const i18nURL = moduleURL(await source('i18n.js'));
const profilesURL = moduleURL((await source('profiles.js'))
    .replaceAll("'../../../../extensions.js'", JSON.stringify(hostURL))
    .replaceAll("'../../../../../script.js'", JSON.stringify(hostURL))
    .replaceAll("'./promptTemplates.js'", JSON.stringify(templatesURL))
    .replaceAll("'./i18n.js'", JSON.stringify(i18nURL)));
const classifierURL = moduleURL(`export async function classifySceneWithLLM() {
    globalThis.__igsPromptInjectionTest.classifications++;
    throw new Error('The ordinary scene injection must not call a separate LLM');
}`);
const loraURL = moduleURL((await source('lora.js'))
    .replaceAll("'../../../../../script.js'", JSON.stringify(hostURL))
    .replaceAll("'./profiles.js'", JSON.stringify(profilesURL))
    .replaceAll("'./lora_agent.js'", JSON.stringify(classifierURL)));
const insertionURL = moduleURL(`export async function processImageGeneration(...args) {
    globalThis.__igsPromptInjectionTest.generations.push(args);
}`);
const detectionURL = moduleURL((await source('detection.js'))
    .replaceAll("'../../../../../script.js'", JSON.stringify(hostURL))
    .replaceAll("'../../../../extensions.js'", JSON.stringify(hostURL))
    .replaceAll("'../../../../utils.js'", JSON.stringify(hostURL))
    .replaceAll("'./profiles.js'", JSON.stringify(profilesURL))
    .replaceAll("'./lora.js'", JSON.stringify(loraURL))
    .replaceAll("'./promptTemplates.js'", JSON.stringify(templatesURL))
    .replaceAll("'./i18n.js'", JSON.stringify(i18nURL))
    .replaceAll("'./insertion.js'", JSON.stringify(insertionURL)));
const profiles = await import(profilesURL);
const detection = await import(detectionURL);

function reset() {
    delete state.extension_settings['image-generation-suite'];
    state.chat = [];
    state.generations = [];
    state.classifications = 0;
    detection.initDetection();
    return { settings: profiles.getSettings(), profile: profiles.getActiveProfile() };
}

test('scene rules reach the real event request alongside named character and LoRA references', async () => {
    const { settings, profile } = reset();
    profile.activeCharacterId = 'anna';
    settings.characterProfiles[profile.activeCharacterProfileId].characters = [{
        id: 'anna', name: 'Anna $&', prompt: 'adult woman, brown eyes, long red hair; identity token anna_xyz',
        outfits: [{ name: 'Formal', description: 'white dress' }],
    }];
    settings.loraProfiles[profile.activeLoraProfileId].entries = [{
        id: 'identity', enabled: true, triggers: ['Anna'], caseSensitive: false,
        description: 'Anna identity reference', prompt: '<lora:anna:1>, anna_xyz',
    }];
    state.chat = [{ is_user: true, mes: 'Anna puts on a black coat and cuts her hair short.' }];
    const prior = [
        { role: 'system', content: 'Anna: adult, brown eyes, long red hair, white dress.' },
        { role: 'assistant', content: '<pic="Anna with long red hair in a white dress beside a window.">' },
        { role: 'user', content: state.chat[0].mes },
    ];
    const request = { chat: structuredClone(prior) };
    await state.handlers.get('prompt')(request);
    assert.deepEqual(request.chat.slice(0, -1), prior, 'available cards and history remain in the request');
    assert.equal(request.chat.at(-1).role, 'system');
    const content = request.chat.at(-1).content;
    assert.ok(content.includes('Anna $&'), 'character name is inserted literally');
    assert.ok(content.includes('identity token anna_xyz'));
    assert.ok(content.includes('Formal, white dress'));
    assert.ok(content.includes('[Active LoRA context]'));
    assert.ok(!/\{(?:characterName|character|outfits|minwords|maxwords|perspective|camera|mood|focus|tone)\}/.test(content));
    assert.equal(state.classifications, 0);
    assert.equal(state.generations.length, 0);
});

test('character reference substitution is literal and does not recursively expand other fields', async () => {
    const { settings, profile } = reset();
    profile.prompt.template = 'Scene instruction';
    profile.promptConstruction.characterDefining = 'Name={characterName}; Body={character}; Outfits={outfits}';
    profile.activeCharacterId = 'literal';
    settings.characterProfiles[profile.activeCharacterProfileId].characters = [{
        id: 'literal', name: 'A $& {character}', prompt: 'cost $5; literal {outfits} $&',
        outfits: [{ name: 'O $&', description: 'fabric $5 {characterName}' }],
    }];
    const request = { chat: [] };
    await state.handlers.get('prompt')(request);
    assert.equal(request.chat[0].content,
        'Scene instruction\nName=A $& {character}; Body=cost $5; literal {outfits} $&; Outfits="O $&, fabric $5 {characterName}"');
});

test('custom templates, frequency, role/depth, and custom macro types keep working', async () => {
    const { profile } = reset();
    profile.prompt.template = '{list}|{enabled}|{off}|{count}|{amount}';
    profile.customMacros = [
        { id: 'list', type: 'list', value: 0, options: [{ label: 'Literal', text: '$& literal' }] },
        { id: 'enabled', type: 'bool', value: true, text: 'on' },
        { id: 'off', type: 'bool', value: false, text: 'hidden' },
        { id: 'count', type: 'int', value: 7 },
        { id: 'amount', type: 'float', value: 1.25 },
    ];
    profile.prompt.frequency = 2;
    profile.prompt.position = 'deep_user';
    profile.prompt.depth = 1;
    const first = { chat: [{ role: 'user', content: 'hello' }] };
    await state.handlers.get('prompt')(first);
    assert.equal(first.chat.length, 1);
    const second = { chat: [{ role: 'system', content: 'card' }, { role: 'user', content: 'latest' }] };
    await state.handlers.get('prompt')(second);
    assert.deepEqual(second.chat[1], { role: 'user', content: '$& literal|on||7|1.25' });
    assert.equal(profile.prompt.messageCounter, 0);
    profile.prompt.enabled = false;
    const disabled = { chat: [] };
    await state.handlers.get('prompt')(disabled);
    assert.deepEqual(disabled.chat, []);
});

test('no selected character leaves the scene instructions without a forced character reference', async () => {
    const { profile } = reset();
    profile.prompt.template = 'Current scene only';
    const request = { chat: [] };
    await state.handlers.get('prompt')(request);
    assert.equal(request.chat[0].content, 'Current scene only');
});

test('scene defaults work without optional macros while custom templates retain their own placeholders', async () => {
    const { profile } = reset();
    profile.customMacros = [];
    const request = { chat: [] };
    await state.handlers.get('prompt')(request);
    assert.ok(request.chat[0].content.includes('120 to 500 words'));
    assert.ok(!/\{(?:minwords|maxwords|perspective|camera|mood|focus|tone)\}/.test(request.chat[0].content));
    assert.deepEqual(profile.customMacros, []);
    profile.prompt.template = 'My custom {minwords} and {camera}';
    const custom = { chat: [] };
    await state.handlers.get('prompt')(custom);
    assert.equal(custom.chat[0].content, 'My custom {minwords} and {camera}');
});

test('tag preset injects tag-specific rules, preserves identity names, and resolves built-in macros', async () => {
    const { settings, profile } = reset();
    profile.prompt.template = TAG_SCENE_PROMPT;
    profile.promptConstruction.characterDefining = TAG_CHARACTER_PROMPT;
    profile.customMacros = [];
    profile.activeCharacterId = 'ada';
    settings.characterProfiles[profile.activeCharacterProfileId].characters = [{
        id: 'ada', name: 'Ada Lovelace from Analytical Engine Tales',
        prompt: 'woman mathematician, dark curls, white collar', outfits: [],
    }];

    const request = { chat: [] };
    await state.handlers.get('prompt')(request);
    const content = request.chat.at(-1).content;
    assert.ok(content.includes('comma-separated English tag list on one line'));
    assert.ok(content.includes('not sentences, prose'));
    assert.ok(content.includes('Do not use a word-count target'));
    assert.ok(!content.includes('{minwords}') && !content.includes('{maxwords}'));
    assert.ok(!content.includes('120 to 500'));
    assert.ok(content.includes('Ada Lovelace from Analytical Engine Tales'));
    assert.ok(content.includes('woman mathematician, dark curls, white collar'));
    assert.ok(!/\{(?:characterName|character|outfits|minwords|maxwords|perspective|camera|mood|focus|tone)\}/.test(content));
});

test('a single-line English description is still extracted by the unchanged default regex', async () => {
    const { profile } = reset();
    const description = 'An adult woman with brown eyes and short red hair stands at the open door in a black coat, her right hand on the handle. An eye-level medium shot shows warm evening light falling from the room behind her.';
    const tag = `<pic="${description}">`;
    state.chat = [{ is_user: false, mes: `She opens the door.\n${tag}` }];
    state.handlers.get('message')(0);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(state.generations.length, 1);
    assert.deepEqual(state.generations[0], [profile, description, 0, tag]);
    assert.equal(state.chat[0].mes, `She opens the door.\n${tag}`);
});

test('comma-separated tag output is extracted and passed unchanged to image generation', async () => {
    const { profile } = reset();
    const description = 'Ada Lovelace, Analytical Engine Tales, dark curls, white collar, rainy library, medium shot, warm window light';
    const tag = `<pic="${description}">`;
    state.chat = [{ is_user: false, mes: `She studies the brass machine.\n${tag}` }];
    state.handlers.get('message')(0);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(state.generations.length, 1);
    assert.deepEqual(state.generations[0], [profile, description, 0, tag]);
});
