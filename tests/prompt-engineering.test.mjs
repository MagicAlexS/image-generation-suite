import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import {
    DEFAULT_SCENE_PROMPT,
    DEFAULT_CHARACTER_PROMPT,
    TAG_SCENE_PROMPT,
    TAG_CHARACTER_PROMPT,
    PREVIOUS_DEFAULT_SCENE_PROMPT,
    PREVIOUS_DEFAULT_CHARACTER_PROMPT,
    getPromptPreset,
    LEGACY_DEFAULT_SCENE_PROMPT,
    LEGACY_DEFAULT_CHARACTER_PROMPT_LORA,
    LEGACY_DEFAULT_CHARACTER_PROMPT_GENERIC,
    upgradePromptDefaults,
    applyPromptPreset,
    applyScenePromptDefaults,
    restorePromptDefaults,
} from '../src/promptTemplates.js';

globalThis.crypto ??= webcrypto;

test('new profiles use the centralized prompt defaults and expanded fresh word range', async () => {
    const { getDefaultProfile } = await loadProfilesModule();
    const profile = getDefaultProfile('Test');

    assert.equal(profile.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(profile.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
    assert.equal(profile.customMacros.find(macro => macro.id === 'minwords').value, 120);
    assert.equal(profile.customMacros.find(macro => macro.id === 'minwords').max, 300);
    assert.equal(profile.customMacros.find(macro => macro.id === 'maxwords').value, 500);
    assert.equal(profile.customMacros.find(macro => macro.id === 'maxwords').max, 1000);
    assert.equal(profile.connection.mode, 'tavern');
});

test('connection migration and import preserve existing custom backends and values', async () => {
    const { extensionSettings, initSettings, importProfiles } = await loadProfilesModule();
    const settings = createMigratableSettings({
        legacyTemplate: 'custom', legacyCharacter: 'custom',
        customTemplate: 'custom', customCharacter: 'custom',
    });
    const legacyConnection = {
        serverType: 'auto', autoUrl: 'http://example.test:7860', autoAuth: 'test:auth',
        model: 'my-model', cfgScale: 0, steps: 31, width: 832, height: 1216,
        seed: 0, denoisingStrength: 0, comfyWorkflow: 'saved.json',
    };
    settings.profiles.legacy.connection = legacyConnection;
    settings.profiles.custom.connection = { serverType: 'comfy', comfyWorkflow: 'custom.json', steps: 12 };
    extensionSettings['image-generation-suite'] = settings;
    initSettings();
    assert.equal(settings.profiles.legacy.connection.mode, 'auto');
    for (const [key, value] of Object.entries(legacyConnection)) {
        assert.equal(settings.profiles.legacy.connection[key], value, key);
    }
    assert.equal(settings.profiles.custom.connection.mode, 'comfy');
    const migrated = structuredClone(settings.profiles);
    const saves = globalThis.__igsSaveCount;
    initSettings();
    assert.deepEqual(settings.profiles, migrated);
    assert.equal(globalThis.__igsSaveCount, saves, 'migration must be idempotent');
    assert.equal(importProfiles(JSON.stringify(settings)), true);
    assert.deepEqual(extensionSettings['image-generation-suite'].profiles, migrated);
});

test('migration upgrades only exact bundled defaults and is idempotent', () => {
    const profile = {
        prompt: { template: LEGACY_DEFAULT_SCENE_PROMPT },
        promptConstruction: { characterDefining: LEGACY_DEFAULT_CHARACTER_PROMPT_LORA }
    };

    assert.equal(upgradePromptDefaults(profile), true);
    assert.equal(profile.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(profile.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
    assert.equal(upgradePromptDefaults(profile), false);
});

test('migration recognizes the other historical character default', () => {
    const profile = { promptConstruction: { characterDefining: LEGACY_DEFAULT_CHARACTER_PROMPT_GENERIC } };
    assert.equal(upgradePromptDefaults(profile), true);
    assert.equal(profile.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
});

test('migration upgrades the exact previous natural preset snapshots and leaves tag presets intact', () => {
    const previousNatural = {
        prompt: { template: PREVIOUS_DEFAULT_SCENE_PROMPT },
        promptConstruction: { characterDefining: PREVIOUS_DEFAULT_CHARACTER_PROMPT },
    };
    assert.equal(upgradePromptDefaults(previousNatural), true);
    assert.equal(getPromptPreset(previousNatural), 'natural');
    assert.equal(previousNatural.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(previousNatural.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
    assert.equal(upgradePromptDefaults(previousNatural), false);

    const tags = { prompt: { template: TAG_SCENE_PROMPT }, promptConstruction: { characterDefining: TAG_CHARACTER_PROMPT } };
    assert.equal(upgradePromptDefaults(tags), false);
    assert.equal(getPromptPreset(tags), 'tags');
    assert.equal(tags.prompt.template, TAG_SCENE_PROMPT);
    assert.equal(tags.promptConstruction.characterDefining, TAG_CHARACTER_PROMPT);
});

test('migration fills absent fields while preserving empty and customized text', () => {
    const profile = {
        prompt: { template: '' },
        promptConstruction: { characterDefining: 'My custom character rules.' }
    };

    assert.equal(upgradePromptDefaults(profile), false);
    assert.equal(profile.prompt.template, '');
    assert.equal(profile.promptConstruction.characterDefining, 'My custom character rules.');

    const missing = {};
    assert.equal(upgradePromptDefaults(missing), true);
    assert.equal(missing.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(missing.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
});

test('explicit apply preserves the first backup and restore removes it', () => {
    const profile = {
        prompt: { template: 'custom scene prompt' },
        promptConstruction: { characterDefining: '' }
    };

    assert.equal(applyScenePromptDefaults(profile), true);
    assert.deepEqual(profile.promptEngineeringBackup, {
        template: 'custom scene prompt',
        characterDefining: ''
    });
    assert.equal(profile.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(profile.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
    assert.equal(applyScenePromptDefaults(profile), false);

    profile.promptEngineeringBackup = { template: 'first', characterDefining: 'backup' };
    profile.prompt.template = 'later edit';
    assert.equal(applyScenePromptDefaults(profile), true);
    assert.deepEqual(profile.promptEngineeringBackup, { template: 'first', characterDefining: 'backup' });
    assert.equal(restorePromptDefaults(profile), true);
    assert.equal(profile.prompt.template, 'first');
    assert.equal(profile.promptConstruction.characterDefining, 'backup');
    assert.equal('promptEngineeringBackup' in profile, false);
    assert.equal(restorePromptDefaults(profile), false);
});

test('both presets share the first backup across switching and restore the original text', () => {
    const profile = {
        prompt: { template: 'custom scene' },
        promptConstruction: { characterDefining: 'custom character' },
    };
    assert.equal(applyPromptPreset(profile, 'tags'), true);
    assert.equal(getPromptPreset(profile), 'tags');
    assert.deepEqual(profile.promptEngineeringBackup, {
        template: 'custom scene', characterDefining: 'custom character',
    });
    assert.equal(applyPromptPreset(profile, 'natural'), true);
    assert.equal(getPromptPreset(profile), 'natural');
    assert.deepEqual(profile.promptEngineeringBackup, {
        template: 'custom scene', characterDefining: 'custom character',
    });
    assert.equal(restorePromptDefaults(profile), true);
    assert.equal(profile.prompt.template, 'custom scene');
    assert.equal(profile.promptConstruction.characterDefining, 'custom character');
    assert.equal(getPromptPreset(profile), null);
    assert.equal(applyPromptPreset(profile, 'unknown'), false);
    for (const invalidId of ['__proto__', 'toString']) {
        const before = structuredClone(profile);
        assert.equal(applyPromptPreset(profile, invalidId), false);
        assert.deepEqual(profile, before, `${invalidId} must not mutate the profile`);
    }
});

test('initSettings migrates exact legacy profile text but keeps custom profiles intact', async () => {
    const { extensionSettings, initSettings } = await loadProfilesModule();
    extensionSettings['image-generation-suite'] = createMigratableSettings({
        legacyTemplate: LEGACY_DEFAULT_SCENE_PROMPT,
        legacyCharacter: LEGACY_DEFAULT_CHARACTER_PROMPT_GENERIC,
        customTemplate: 'custom template',
        customCharacter: ''
    });

    initSettings();
    const profiles = extensionSettings['image-generation-suite'].profiles;
    assert.equal(profiles.legacy.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(profiles.legacy.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
    assert.equal(profiles.custom.prompt.template, 'custom template');
    assert.equal(profiles.custom.promptConstruction.characterDefining, '');
});

test('explicitly restored historical defaults survive later initialization and import', async () => {
    const { extensionSettings, initSettings, importProfiles } = await loadProfilesModule();
    const settings = createMigratableSettings({
        legacyTemplate: LEGACY_DEFAULT_SCENE_PROMPT,
        legacyCharacter: LEGACY_DEFAULT_CHARACTER_PROMPT_LORA,
        customTemplate: 'custom', customCharacter: 'custom',
    });
    const profile = settings.profiles.legacy;
    applyScenePromptDefaults(profile);
    assert.equal(restorePromptDefaults(profile), true);
    extensionSettings['image-generation-suite'] = settings;
    initSettings();
    assert.equal(profile.prompt.template, LEGACY_DEFAULT_SCENE_PROMPT);
    assert.equal(profile.promptConstruction.characterDefining, LEGACY_DEFAULT_CHARACTER_PROMPT_LORA);
    assert.equal(importProfiles(JSON.stringify(settings)), true);
    assert.equal(extensionSettings['image-generation-suite'].profiles.legacy.prompt.template, LEGACY_DEFAULT_SCENE_PROMPT);
    assert.equal(applyScenePromptDefaults(profile), true);
    assert.equal(profile.preserveRestoredPrompts, undefined);
    assert.equal(profile.prompt.template, DEFAULT_SCENE_PROMPT);
});

test('importProfiles immediately migrates imported exact legacy defaults', async () => {
    const { extensionSettings, initSettings, importProfiles } = await loadProfilesModule();
    extensionSettings['image-generation-suite'] = {};
    initSettings();

    const importedSettings = createMigratableSettings({
        legacyTemplate: LEGACY_DEFAULT_SCENE_PROMPT,
        legacyCharacter: LEGACY_DEFAULT_CHARACTER_PROMPT_LORA,
        customTemplate: 'custom survives import',
        customCharacter: 'custom character survives import'
    });
    assert.equal(importProfiles(JSON.stringify(importedSettings)), true);

    const profiles = extensionSettings['image-generation-suite'].profiles;
    assert.equal(profiles.legacy.prompt.template, DEFAULT_SCENE_PROMPT);
    assert.equal(profiles.legacy.promptConstruction.characterDefining, DEFAULT_CHARACTER_PROMPT);
    assert.equal(profiles.custom.prompt.template, 'custom survives import');
    assert.equal(profiles.custom.promptConstruction.characterDefining, 'custom character survives import');
});

test('tag preset survives settings initialization and profile import', async () => {
    const { extensionSettings, initSettings, importProfiles } = await loadProfilesModule();
    extensionSettings['image-generation-suite'] = createMigratableSettings({
        legacyTemplate: TAG_SCENE_PROMPT,
        legacyCharacter: TAG_CHARACTER_PROMPT,
        customTemplate: 'custom template',
        customCharacter: 'custom character',
    });
    initSettings();
    let profiles = extensionSettings['image-generation-suite'].profiles;
    assert.equal(getPromptPreset(profiles.legacy), 'tags');
    assert.equal(profiles.legacy.prompt.template, TAG_SCENE_PROMPT);

    const importedSettings = createMigratableSettings({
        legacyTemplate: TAG_SCENE_PROMPT,
        legacyCharacter: TAG_CHARACTER_PROMPT,
        customTemplate: 'custom survives import',
        customCharacter: 'custom character survives import',
    });
    assert.equal(importProfiles(JSON.stringify(importedSettings)), true);
    profiles = extensionSettings['image-generation-suite'].profiles;
    assert.equal(getPromptPreset(profiles.legacy), 'tags');
    assert.equal(profiles.legacy.promptConstruction.characterDefining, TAG_CHARACTER_PROMPT);
    assert.equal(profiles.custom.prompt.template, 'custom survives import');
});

function createMigratableSettings({ legacyTemplate, legacyCharacter, customTemplate, customCharacter }) {
    const legacy = minimalProfile('legacy', legacyTemplate, legacyCharacter);
    const custom = minimalProfile('custom', customTemplate, customCharacter);
    return {
        version: 1,
        activeProfileId: 'legacy',
        profiles: { legacy, custom },
        styleProfiles: { style: { id: 'style', name: 'Styles', styles: [] } },
        activeStyleProfileId: 'style',
        loraProfiles: { lora: { id: 'lora', name: 'LoRA', entries: [] } },
        activeLoraProfileId: 'lora',
        characterProfiles: { chars: { id: 'chars', name: 'Characters', characters: [] } },
        activeCharacterProfileId: 'chars'
    };
}

function minimalProfile(id, template, characterDefining) {
    return {
        id,
        name: id,
        prompt: { template },
        promptConstruction: { characterDefining },
        activeStyleProfileId: 'style',
        activeCharacterProfileId: 'chars',
        activeLoraProfileId: 'lora',
        hub: { promptExtra: '', negativeExtra: '' },
        customMacros: []
    };
}

async function loadProfilesModule() {
    const source = await readFile(new URL('../src/profiles.js', import.meta.url), 'utf8');
    const moduleNonce = crypto.randomUUID();
    const settingsKey = `__igsTestSettings_${moduleNonce.replaceAll('-', '')}`;
    const extensionStubUrl = dataUrl(`globalThis.${settingsKey} = {}; export const extension_settings = globalThis.${settingsKey};`);
    const scriptStubUrl = dataUrl(`export const saveSettingsDebounced = () => { globalThis.__igsSaveCount = (globalThis.__igsSaveCount || 0) + 1; }; // ${moduleNonce}`);
    const templatesUrl = new URL('../src/promptTemplates.js', import.meta.url).href;
    const rewritten = source
        .replace("import { extension_settings } from '../../../../extensions.js';", `import { extension_settings } from '${extensionStubUrl}';`)
        .replace("import { saveSettingsDebounced } from '../../../../../script.js';", `import { saveSettingsDebounced } from '${scriptStubUrl}';`)
        .replace("from './promptTemplates.js';", `from '${templatesUrl}';`)
        .replace("from './connectionSettings.js';", `from '${new URL('../src/connectionSettings.js', import.meta.url).href}';`)
        .replace("from './i18n.js';", `from '${new URL('../src/i18n.js', import.meta.url).href}';`);

    globalThis.__igsSaveCount = 0;
    globalThis.toastr = { error() {}, warning() {}, success() {} };
    const module = await import(dataUrl(rewritten));
    return { ...module, extensionSettings: globalThis[settingsKey] };
}

function dataUrl(source) {
    return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
