import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createDefaultConnection, normalizeConnection, getConnectionMode, setConnectionMode,
} from '../src/connectionSettings.js';

test('new profiles follow Tavern while custom defaults are independent', () => {
    const first = createDefaultConnection();
    const second = createDefaultConnection();
    assert.equal(getConnectionMode(first), 'tavern');
    setConnectionMode(first, 'comfy');
    first.workflowVariables.push({ name: 'strength', type: 'number', value: 0.5 });
    setConnectionMode(first, 'auto');
    assert.deepEqual(first.workflowVariables, []);
    setConnectionMode(second, 'comfy');
    assert.deepEqual(second.workflowVariables, []);
    const auto = createDefaultConnection('auto');
    assert.equal(auto.serverType, 'auto');
    assert.equal(getConnectionMode(auto), 'auto');
});

test('legacy normalization keeps the backend, zero values and original data', () => {
    const original = { serverType: 'auto', model: 'existing', seed: 0, cfgScale: 0, denoisingStrength: 0,
        autoUrl: 'http://example.test', extraLegacyField: 'preserved' };
    const before = structuredClone(original);
    const normalized = normalizeConnection(original);
    assert.deepEqual(original, before);
    assert.equal(normalized.mode, 'auto');
    for (const [key, value] of Object.entries(original)) assert.equal(normalized[key], value);
    assert.deepEqual(normalizeConnection(normalized), normalized);
    assert.equal(getConnectionMode(normalizeConnection()), 'comfy');
});

test('switching among all three modes restores each custom configuration', () => {
    const connection = normalizeConnection({ serverType: 'comfy', comfyUrl: 'http://comfy.test',
        model: 'comfy-model', width: 1216, height: 832, comfyWorkflow: 'scene.json', seed: 42,
        workflowVariables: [{ name: 'strength', type: 'number', value: 0.25 }] });
    setConnectionMode(connection, 'auto');
    Object.assign(connection, { model: 'auto-model', width: 768, height: 1024,
        autoUrl: 'http://auto.test', autoAuth: 'user:password', seed: 0 });
    setConnectionMode(connection, 'tavern');
    assert.equal(connection.model, 'auto-model', 'following Tavern must not overwrite custom values');
    setConnectionMode(connection, 'comfy');
    assert.equal(connection.model, 'comfy-model');
    assert.equal(connection.comfyUrl, 'http://comfy.test');
    assert.equal(connection.comfyWorkflow, 'scene.json');
    assert.equal(connection.width, 1216);
    assert.equal(connection.seed, 42);
    assert.equal(connection.workflowVariables[0].value, 0.25);
    setConnectionMode(connection, 'auto');
    assert.equal(connection.autoAuth, 'user:password');
    assert.equal(connection.model, 'auto-model');
    assert.equal(connection.seed, 0);
});

test('invalid mode selections preserve the saved connection', () => {
    const connection = createDefaultConnection();
    const before = structuredClone(connection);
    for (const mode of ['__proto__', '', 'unknown']) {
        setConnectionMode(connection, mode);
        assert.deepEqual(connection, before);
    }
});

test('legacy implicit default workflow remains usable after migration and switching', () => {
    const connection = normalizeConnection({ serverType: 'comfy', comfyWorkflow: '' });
    assert.equal(connection.comfyWorkflow, 'Default_Comfy_Workflow.json');
    setConnectionMode(connection, 'auto');
    setConnectionMode(connection, 'comfy');
    assert.equal(connection.comfyWorkflow, 'Default_Comfy_Workflow.json');
    assert.equal(createDefaultConnection('comfy').comfyWorkflow, '', 'new custom modes ask for an explicit workflow');
});
