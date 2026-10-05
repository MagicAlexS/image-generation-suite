import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDefaultConnection, setConnectionMode } from '../src/connectionSettings.js';

const state = globalThis.__igsConnectionTest = {
    extension_settings: {}, commands: {}, requests: [],
};
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const hostURL = moduleURL(`
    const state = globalThis.__igsConnectionTest;
    export const extension_settings = state.extension_settings;
    export const SlashCommandParser = { commands: state.commands };
    export const getRequestHeaders = () => ({ 'Content-Type': 'application/json' });
    export const getContext = () => ({ characterId: 0, characters: [{ avatar: 'test.png' }] });
    export const substituteParams = value => String(value).replaceAll('{{char}}', 'Test Character');
    export const getUserAvatar = () => '/user.png';
    export const getCharacterAvatar = () => 'test.png';
    export const formatCharacterAvatar = value => '/characters/' + value;
    export const user_avatar = 'user.png';
    export const getBase64Async = async () => 'data:image/png;base64,avatar';
`);
const connectionSource = (await readFile(new URL('../src/connection.js', import.meta.url), 'utf8'))
    .replace(/from '(\.\.\/[^']+)'/g, `from '${hostURL}'`)
    .replaceAll("'./connectionSettings.js'", JSON.stringify(new URL('../src/connectionSettings.js', import.meta.url).href))
    .replaceAll("'./i18n.js'", JSON.stringify(new URL('../src/i18n.js', import.meta.url).href));
const api = await import(moduleURL(connectionSource));
globalThis.toastr = Object.fromEntries(['info', 'warning', 'success', 'error'].map(key => [key, () => {}]));

function reset() {
    state.requests = [];
    for (const key of Object.keys(state.commands)) delete state.commands[key];
    state.extension_settings.sd = {
        source: 'comfy', comfy_url: 'http://comfy.test', comfy_workflow: 'scene.json',
        auto_url: 'http://auto.test', auto_auth: 'test:auth', model: 'host-model', vae: 'host-vae',
        sampler: 'euler', scheduler: 'normal', steps: 30, scale: 4.5, width: 1024, height: 768,
        denoising_strength: 0, clip_skip: 2, seed: 0,
        comfy_placeholders: [{ find: 'subject', replace: '{{char}}' }],
    };
    globalThis.fetch = async (endpoint, options = {}) => {
        state.requests.push({ endpoint, body: options.body && JSON.parse(options.body), signal: options.signal });
        throw new Error(`Unexpected request: ${endpoint}`);
    };
}

const workflow = {
    '1': { class_type: 'Example', inputs: {
        text: '%prompt%', negative: '%negative_prompt%', width: '%width%', seed: '%seed%',
        strength: '%strength%', enabled: '%enabled%', subject: '%subject%',
    } },
};
const customConnection = () => {
    const connection = createDefaultConnection();
    setConnectionMode(connection, 'comfy');
    Object.assign(connection, { comfyWorkflow: 'scene.json', width: 832, seed: 0,
        workflowVariables: [
            { name: 'strength', type: 'number', value: 0.25 },
            { name: 'enabled', type: 'boolean', value: false },
            { name: 'subject', type: 'string', value: '{{char}} $&' },
        ] });
    return connection;
};

test('Tavern mode calls the native command with literal structured prompts and returns its URL', async () => {
    reset();
    let argsSeen;
    let promptSeen;
    const sdBefore = structuredClone(state.extension_settings.sd);
    state.commands.imagine = { callback: async (args, prompt) => {
        argsSeen = args;
        promptSeen = prompt;
        return '/user/images/test.png';
    } };
    const controller = new AbortController();
    const prompt = 'A person | /sd model=other [brackets] $& "quoted"';
    assert.deepEqual(await api.generateImage({ connection: createDefaultConnection() }, prompt, 'negative $&', controller.signal),
        { url: '/user/images/test.png' });
    assert.equal(promptSeen, prompt);
    assert.equal(argsSeen.negative, 'negative $&');
    assert.equal(argsSeen.quiet, 'true');
    assert.equal(argsSeen.extend, 'false');
    assert.equal(argsSeen.edit, 'false');
    assert.equal(argsSeen._abortController, controller.signal);
    assert.equal(argsSeen.source, undefined);
    assert.equal(argsSeen.model, undefined);
    assert.deepEqual(state.extension_settings.sd, sdBefore);
    assert.equal(state.requests.length, 0);
});

test('Tavern summary and copies read live settings and preserve custom placeholder macros', () => {
    reset();
    state.commands.imagine = { callback() {} };
    assert.equal(api.getTavernSummary().available, true);
    assert.equal(api.getTavernSummary().model, 'host-model');
    const copied = api.readTavernConnection('comfy');
    assert.equal(copied.cfgScale, 4.5);
    assert.equal(copied.denoisingStrength, 0);
    assert.equal(copied.seed, 0);
    assert.equal(copied.workflowVariables[0].value, '{{char}}');
    state.extension_settings.sd.model = 'changed-model';
    assert.equal(api.getTavernSummary().model, 'changed-model');
    assert.equal(copied.model, 'host-model');
    assert.throws(() => api.readTavernConnection('auto'));
    state.extension_settings.sd.source = 'auto';
    const auto = api.readTavernConnection('auto');
    assert.equal(auto.autoUrl, 'http://auto.test');
    assert.equal(auto.autoAuth, 'test:auth');
});

test('Tavern unavailable, cancelled and empty results fail explicitly', async () => {
    reset();
    assert.equal(api.getTavernSummary().available, false);
    await assert.rejects(api.generateImage({ connection: createDefaultConnection() }, 'scene', ''), /command|ready|available/i);
    let calls = 0;
    state.commands.imagine = { callback: async () => { calls++; return ''; } };
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(api.generateImage({ connection: createDefaultConnection() }, 'scene', '', controller.signal), { name: 'AbortError' });
    for (const mode of ['comfy', 'auto']) {
        await assert.rejects(api.generateImage({ connection: createDefaultConnection(mode) }, 'scene', '', controller.signal), { name: 'AbortError' });
    }
    assert.equal(calls, 0);
    assert.equal(state.requests.length, 0);
    await assert.rejects(api.generateImage({ connection: createDefaultConnection() }, 'scene', ''), /failed|image/i);
});

test('literal native trigger keywords stay in free prompt mode', async () => {
    reset();
    const seen = [];
    state.commands.imagine = { callback: async (_args, prompt) => { seen.push(prompt); return '/test.png'; } };
    for (const keyword of ['you', 'me', 'scene', 'raw_last', 'last', 'face', 'background']) {
        await api.generateImage({ connection: createDefaultConnection() }, keyword, '');
        assert.equal(seen.at(-1), `${keyword},`);
    }
});

test('Comfy generation substitutes typed values and literal dollars without corrupting JSON', async () => {
    reset();
    const connection = customConnection();
    globalThis.fetch = async (endpoint, options = {}) => {
        state.requests.push({ endpoint, body: options.body && JSON.parse(options.body), signal: options.signal });
        if (endpoint.endsWith('/workflows')) return Response.json(['scene.json']);
        if (endpoint.endsWith('/workflow')) return Response.json(JSON.stringify(workflow));
        if (endpoint.endsWith('/generate')) return Response.json({ format: 'png', data: 'base64' });
        throw new Error(endpoint);
    };
    const signal = new AbortController().signal;
    assert.deepEqual(await api.generateImage({ connection }, 'literal $& "$1" \n %width%', 'negative $`', signal), { format: 'png', data: 'base64' });
    const request = state.requests.find(item => item.endpoint.endsWith('/generate'));
    const inputs = JSON.parse(request.body.prompt).prompt['1'].inputs;
    assert.equal(inputs.text, 'literal $& "$1" \n %width%');
    assert.equal(inputs.negative, 'negative $`');
    assert.equal(inputs.width, 832);
    assert.equal(inputs.seed, 0);
    assert.equal(inputs.strength, 0.25);
    assert.equal(inputs.enabled, false);
    const fixedSeedPreview = api.inspectWorkflow(JSON.stringify({ '1': { class_type: 'Example', inputs: {
        seed: '%seed%', clip: '%clip_skip%',
    } } }), { ...connection, seed: 17, clipSkip: 2 });
    assert.equal(JSON.parse(fixedSeedPreview.preview)['1'].inputs.seed, 17);
    assert.equal(JSON.parse(fixedSeedPreview.preview)['1'].inputs.clip, -2);
    assert.equal(inputs.subject, 'Test Character $&');
    assert.equal(request.signal, signal);
});

test('workflow replacement does not recursively interpret placeholders supplied as values', async () => {
    reset();
    const connection = customConnection();
    connection.workflowVariables[2].value = '%width%';
    globalThis.fetch = async (endpoint, options = {}) => {
        state.requests.push({ endpoint, body: options.body && JSON.parse(options.body) });
        if (endpoint.endsWith('/workflows')) return Response.json(['scene.json']);
        if (endpoint.endsWith('/workflow')) return Response.json(JSON.stringify(workflow));
        return Response.json({ format: 'png', data: 'base64' });
    };
    await api.generateImage({ connection }, '%width%', '%seed%');
    const inputs = JSON.parse(state.requests.at(-1).body.prompt).prompt['1'].inputs;
    assert.equal(inputs.text, '%width%');
    assert.equal(inputs.negative, '%seed%');
    assert.equal(inputs.subject, '%width%');
    assert.equal(inputs.width, 832);
});

test('workflow inspection lists actual parameters, previews typed values and flags unknown variables', () => {
    reset();
    const connection = customConnection();
    const inspected = api.inspectWorkflow(JSON.stringify(workflow), connection);
    assert.ok(inspected.used.includes('width'));
    assert.ok(inspected.used.includes('strength'));
    assert.deepEqual(inspected.unknown, []);
    assert.deepEqual(JSON.parse(inspected.template), workflow, 'saved templates retain placeholders');
    const inputs = JSON.parse(inspected.preview)['1'].inputs;
    assert.equal(inputs.strength, 0.25);
    assert.equal(inputs.enabled, false);
    const unknown = api.inspectWorkflow(JSON.stringify({ '1': { class_type: 'Example', inputs: { text: '%unknown%' } } }), connection);
    assert.deepEqual(unknown.unknown, ['unknown']);
    assert.throws(() => api.inspectWorkflow('{', connection));
    assert.throws(() => api.inspectWorkflow(JSON.stringify({ nodes: [], links: [] }), connection));
    assert.throws(() => api.inspectWorkflow(JSON.stringify(workflow), { ...connection,
        workflowVariables: [{ name: 'width', type: 'number', value: 99 }] }));
    assert.throws(() => api.inspectWorkflow(JSON.stringify(workflow), { ...connection,
        workflowVariables: [{ name: 'strength', type: 'number', value: 'not-a-number' }] }));
});

test('wrapped API imports normalize to a shared native-compatible template', () => {
    reset();
    const inspected = api.inspectWorkflow(JSON.stringify({ prompt: workflow }), customConnection());
    assert.deepEqual(JSON.parse(inspected.template), workflow);
    assert.throws(() => api.inspectWorkflow(JSON.stringify({ '1': { class_type: '%enabled%', inputs: {} } }),
        customConnection()), /class_type|inputs/i);
});

test('missing workflows never silently generate with the host default and list errors are distinct from empty lists', async () => {
    reset();
    globalThis.fetch = async (endpoint, options = {}) => {
        state.requests.push({ endpoint, body: options.body && JSON.parse(options.body) });
        return Response.json([]);
    };
    assert.deepEqual(await api.loadWorkflows(), []);
    await assert.rejects(api.generateImage({ connection: customConnection() }, 'scene', ''), /workflow/i);
    assert.equal(state.requests.some(item => item.endpoint.endsWith('/generate')), false);
    globalThis.fetch = async () => new Response('failed', { status: 500 });
    await assert.rejects(api.loadWorkflows());
});

test('custom A1111 sends the selected model and exact zero-valued parameters', async () => {
    reset();
    const connection = createDefaultConnection();
    setConnectionMode(connection, 'auto');
    Object.assign(connection, { model: 'selected.safetensors', seed: 0, denoisingStrength: 0 });
    globalThis.fetch = async (endpoint, options) => {
        state.requests.push({ endpoint, body: JSON.parse(options.body) });
        return Response.json({ images: ['base64'] });
    };
    assert.deepEqual(await api.generateImage({ connection }, 'scene', 'negative'), { format: 'png', data: 'base64' });
    assert.equal(state.requests[0].body.override_settings.sd_model_checkpoint, 'selected.safetensors');
    assert.equal(state.requests[0].body.seed, 0);
    assert.equal(state.requests[0].body.denoising_strength, 0);
});
