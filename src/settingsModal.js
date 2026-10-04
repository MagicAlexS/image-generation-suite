/**
 * @file settingsModal.js
 * @description Renders the full settings UI inside the extension drawer.
 *
 * Replaces the old accordion-based settings that were in settings.html.
 * Each tab is rendered dynamically -- switching tabs replaces the content area.
 *
 * @exports openSettingsModal
 * @exports closeSettingsModal
 * @exports refreshModalUI
 */

import {
    getSettings,
    getActiveProfile,
    setActiveProfile,
    createProfile,
    deleteProfile,
    duplicateProfile,
    renameProfile,
    exportAllProfiles,
    importProfiles,
    saveProfiles,
    addStyleProfile,
    deleteStyleProfile,
    renameStyleProfile,
    duplicateStyleProfile,
    importStyleProfile,
    exportStyleProfile,
    addLoraProfile,
    deleteLoraProfile,
    renameLoraProfile,
    duplicateLoraProfile,
    importLoraProfile,
    exportLoraProfile,
    addCharacterProfile,
    deleteCharacterProfile,
    renameCharacterProfile,
    duplicateCharacterProfile,
    importCharacterProfile,
    exportCharacterProfile
} from './profiles.js';

import {
    testConnection,
    loadModels,
    loadVaes,
    loadSamplers,
    loadSchedulers,
    loadWorkflows,
    loadWorkflow,
    saveWorkflow,
    deleteWorkflow,
    renameWorkflow
} from './connection.js';

import {
    addLoraEntry,
    deleteLoraEntry,
    updateLoraEntry,
    toggleLoraEntry
} from './lora.js';

import { discoverConnectionProfiles } from './lora_agent.js';
import {
    DEFAULT_SCENE_PROMPT,
    DEFAULT_CHARACTER_PROMPT,
    applyScenePromptDefaults,
    restorePromptDefaults,
} from './promptTemplates.js';

// ============================================================
// Module-level State
// ============================================================

/** @type {string} Currently active tab ID */
let activeTabId = 'suite-hub';

/** @type {object|null} Callbacks provided by the caller */
let modalCallbacks = null;

/** @type {number} Currently selected style index in the Styles tab */
let selectedStyleIndex = -1;

/** @type {number} Currently selected character index in the Characters tab */
let selectedCharIndex = -1;

/** @type {number} Currently selected LoRA index in the LoRAs tab */
let selectedLoraIndex = -1;

/** @type {number} Currently selected macro index in the Prompt Injection tab */
let selectedMacroIndex = -1;

/** Reserved macro IDs that cannot be used for user custom macros */
const RESERVED_MACRO_IDS = new Set([
    'prefix', 'prompt', 'style', 'styles', 'suffix', 'loras',
    'promptExtra', 'negativeExtra', 'negativePrefix', 'negative', 'negativeSuffix',
    'character', 'characterName', 'outfits'
]);

// ============================================================
// Tab Definitions
// ============================================================

const TABS = [
    { id: 'suite-hub', label: 'Quick Controls', icon: 'fa-sliders', description: 'Choose the scene references and prompt additions used for the next image.' },
    { id: 'prompt-injection', label: 'Prompt Injection', icon: 'fa-wand-magic-sparkles', description: 'Control how image instructions and reusable macros enter the conversation.' },
    { id: 'detection-settings', label: 'Detection', icon: 'fa-magnifying-glass', description: 'Choose how image requests are detected and inserted into chat.' },
    { id: 'connection', label: 'Connection', icon: 'fa-plug', description: 'Connect an image backend and choose generation settings and workflows.' },
    { id: 'prompt-construction', label: 'Prompt Construction', icon: 'fa-shapes', description: 'Build the positive and negative prompts sent to the image backend.' },
    { id: 'styles', label: 'Styles', icon: 'fa-palette', description: 'Organize style collections and edit their prompts and previews.' },
    { id: 'characters', label: 'Characters', icon: 'fa-users', description: 'Organize character references and optional outfit descriptions.' },
    { id: 'loras', label: 'LoRAs', icon: 'fa-sliders', description: 'Manage LoRA trigger words, prompt content, and scan depth.' },
];

function renderSettingsGroup(title, content, description = '', className = '') {
    return `
        <section class="igs-settings-group ${className}">
            <h3>${title}</h3>
            ${description ? `<p class="igs-settings-group-description">${description}</p>` : ''}
            <div class="igs-settings-group-content">${content}</div>
        </section>
    `;
}

// ============================================================
// Helper Utilities
// ============================================================

/**
 * Escapes HTML special characters for safe interpolation into templates.
 * @param {string} str - Raw string.
 * @returns {string} Escaped string.
 */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Binds an input field to a callback. Uses delegated events on the inline settings root.
 *
 * @param {string} id - The HTML element ID.
 * @param {Function} callback - Callback receiving the new value.
 * @param {boolean} [isCheckbox=false] - True if binding a checkbox.
 */
function bindModalInput(id, callback, isCheckbox = false) {
    const modal = $('#igs_settings_root');
    if (isCheckbox) {
        modal.on('change.igstab', `#${id}`, function () {
            callback($(this).prop('checked'));
            saveProfiles();
        });
    } else {
        modal.on('input.igstab change.igstab', `#${id}`, function () {
            callback($(this).val());
            saveProfiles();
        });
    }
}

/**
 * Synchronizes a range slider and paired number input inside the settings panel.
 *
 * @param {string} sliderId - The range slider input ID.
 * @param {string} valueId - The paired number input ID.
 * @param {Function} onUpdate - Callback receiving the new value.
 */
function bindModalSlider(sliderId, valueId, onUpdate) {
    const modal = $('#igs_settings_root');

    modal.on('input.igstab change.igstab', `#${sliderId}`, function () {
        const val = $(this).val();
        $(`#${valueId}`).val(val);
        onUpdate(val);
        saveProfiles();
    });

    modal.on('input.igstab change.igstab', `#${valueId}`, function () {
        let val = parseFloat($(this).val());
        if (isNaN(val)) return;

        const slider = $(`#${sliderId}`);
        const min = parseFloat(slider.attr('min'));
        const max = parseFloat(slider.attr('max'));
        val = Math.max(min, Math.min(max, val));

        slider.val(val);
        onUpdate(val);
        saveProfiles();
    });
}

/**
 * Populates a <select> element with option tags, preserving or selecting the current value.
 *
 * @param {string} selectId - The select element ID.
 * @param {string[]} options - Array of option string values.
 * @param {string} currentValue - The currently selected value.
 */
function populateModalSelect(selectId, options, currentValue) {
    const select = $(`#${selectId}`);
    select.empty();

    if (!options || options.length === 0) {
        select.append($('<option>', { value: '', text: 'None/Default' }));
        if (currentValue) {
            select.prepend($('<option>', { value: currentValue, text: currentValue }));
            select.val(currentValue);
        }
        return;
    }

    let found = false;
    options.forEach(opt => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const name = typeof opt === 'string' ? opt : opt.name || opt.value;
        select.append($('<option>', { value: val, text: name }));
        if (val === currentValue) found = true;
    });

    if (currentValue && !found) {
        select.prepend($('<option>', { value: currentValue, text: currentValue }));
    }

    select.val(currentValue || '');
}

// ============================================================
// Inline Settings Shell
// ============================================================

/**
 * Builds the inline settings navigation and content area.
 * @returns {string} HTML string.
 */
function buildModalShell() {
    const sidebarButtons = TABS.map(tab => `
        <button type="button" id="igs_tab_${tab.id}" role="tab" aria-selected="${tab.id === activeTabId}" aria-controls="igs_modal_content" tabindex="${tab.id === activeTabId ? '0' : '-1'}" class="igs-modal-tab-btn${tab.id === activeTabId ? ' active' : ''}" data-tab="${tab.id}">
            <i class="fa-solid ${tab.icon}"></i>
            <span>${tab.label}</span>
        </button>
    `).join('');

    return `
        <div class="igs-settings-panel" id="igs_settings_root">
            <div class="igs-settings-nav">
                <div class="igs-modal-sidebar" role="tablist" aria-label="Settings categories">
                    ${sidebarButtons}
                </div>
            </div>
            <div class="igs-modal-content" id="igs_modal_content" role="tabpanel" tabindex="0"><!-- Tab content rendered here --></div>
        </div>
    `;
}

// ============================================================
// Tab 1: Suite Hub
// ============================================================

function renderSuiteHubTab() {
    const settings = getSettings();
    const profile = getActiveProfile();
    return `
        <div class="igs-modal-section igs-quick-controls">
            ${renderSettingsGroup('Scene controls', `
            <div class="igs-quick-control-grid">
                <div class="igs-modal-field">
                    <label for="igs_hub_character_select">Character</label>
                    <select id="igs_hub_character_select" class="text_pole"><option value="">(None)</option></select>
                </div>
                <div class="igs-modal-field">
                    <label for="igs_hub_prompt_extra">Prompt Addition</label>
                    <input type="text" id="igs_hub_prompt_extra" class="text_pole" placeholder="Extra positive prompt..." value="${esc(profile?.hub?.promptExtra || '')}">
                </div>
                <div class="igs-modal-field">
                    <label for="igs_hub_negative_extra">Negative Addition</label>
                    <input type="text" id="igs_hub_negative_extra" class="text_pole" placeholder="Extra negative prompt..." value="${esc(profile?.hub?.negativeExtra || '')}">
                </div>
                <div class="igs-modal-field">
                    <label>Style</label>
                    <div id="igs_custom_style_select" class="igs-custom-select">
                        <div class="igs-custom-select-trigger"><span>Default (No Style)</span><i class="fa-solid fa-chevron-down"></i></div>
                        <div class="igs-custom-select-options"></div>
                    </div>
                </div>
            </div>
            <div class="igs-quick-preview" id="igs_window_preview_container" style="display:none;">
                <div class="igs-window-preview-img-wrapper"><img id="igs_window_preview_img" class="igs-window-preview-img" src="" alt="Style preview"></div>
                <div id="igs_window_desc" class="igs-window-desc"></div>
            </div>
            `, 'Set the character, style, and prompt additions for this image.')}
            ${renderSettingsGroup('Macro values', `
            <div class="igs-quick-macros">
                <div id="igs_hub_macros_container" class="igs-hub-macros"></div>
            </div>
            `, 'Adjust values for custom macros used by the prompt template.')}
            ${renderSettingsGroup('Actions', `
            <div class="igs-quick-actions">
                <button id="igs_hub_retrigger" class="menu_button"><i class="fa-solid fa-arrows-rotate"></i> Re-trigger Image Generation</button>
            </div>
            `)}
        </div>
        <div class="igs-modal-section igs-modal-section-settings">
            ${renderSettingsGroup('Preview', `
            <div class="igs-modal-field">
                <label class="igs-toggle-row" for="igs_m_hub_show_previews">
                    <input type="checkbox" id="igs_m_hub_show_previews" class="checkbox"
                        ${settings.style_show_previews ? 'checked' : ''}>
                    <span>Preview Image Style</span>
                </label>
                <div class="igs-hint">Show the active style preview in Quick Controls.</div>
            </div>
            `)}
        </div>
    `;
}

function bindSuiteHubTab() {
    const settings = getSettings();
    bindModalInput('igs_hub_character_select', val => {
        const profile = getActiveProfile();
        if (profile) profile.activeCharacterId = val;
    });
    bindModalInput('igs_hub_prompt_extra', val => {
        const profile = getActiveProfile();
        if (profile) {
            if (!profile.hub) profile.hub = {};
            profile.hub.promptExtra = val;
        }
    });
    bindModalInput('igs_hub_negative_extra', val => {
        const profile = getActiveProfile();
        if (profile) {
            if (!profile.hub) profile.hub = {};
            profile.hub.negativeExtra = val;
        }
    });
    bindModalInput('igs_m_hub_show_previews', val => {
        settings.style_show_previews = val;
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
    }, true);
}

// ============================================================
// Tab 2: Prompt Injection
// ============================================================

function renderPromptInjectionTab() {
    const profile = getActiveProfile();
    const usingSceneDefaults = profile.prompt.template === DEFAULT_SCENE_PROMPT
        && profile.promptConstruction.characterDefining === DEFAULT_CHARACTER_PROMPT;
    const backup = profile.promptEngineeringBackup;
    const canRestore = typeof backup?.template === 'string'
        && typeof backup?.characterDefining === 'string';
    const macros = profile.customMacros || [];

    // Build the macro list items
    let macroListHtml = '';
    macros.forEach((macro, i) => {
        const isActive = i === selectedMacroIndex;
        const typeBadge = `<span class="igs-macro-type-badge igs-macro-type-${macro.type}">${macro.type.toUpperCase()}</span>`;
        macroListHtml += `<div class="igs-modal-list-item igs-m-macro-item ${isActive ? 'active' : ''}" data-index="${i}">
            <span>${macro.id || '(unnamed)'}</span>
            ${typeBadge}
        </div>`;
    });
    if (macros.length === 0) {
        macroListHtml = '<div class="igs-modal-empty-msg">No custom macros yet. Add one to create a reusable prompt value.</div>';
    }

    // Build the macro editor (right panel)
    let macroEditorHtml = '';
    if (selectedMacroIndex >= 0 && selectedMacroIndex < macros.length) {
        const macro = macros[selectedMacroIndex];
        macroEditorHtml = renderMacroEditor(macro, selectedMacroIndex);
    } else {
        macroEditorHtml = '<div class="igs-modal-empty-editor">Select a macro to edit, or add a new one.</div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('Prompt behavior', `
            <div class="igs-modal-field">
                <label class="igs-toggle-row" for="igs_m_prompt_enabled">
                    <input type="checkbox" id="igs_m_prompt_enabled" class="checkbox"
                        ${profile.prompt.enabled ? 'checked' : ''}>
                    <span>Enable Prompt Injection</span>
                </label>
                <div class="igs-hint">When enabled, the prompt template is injected into the conversation at the configured frequency.</div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_frequency">Injection Frequency</label>
                <input type="number" id="igs_m_prompt_frequency" class="text_pole"
                    min="1" max="100" value="${profile.prompt.frequency || 1}">
                <div class="igs-hint">Generate an image every N messages.</div>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label">Position &amp; Depth</label>
                <div class="igs-inline-group">
                    <select id="igs_m_prompt_position" class="text_pole">
                        <option value="deep_system" ${profile.prompt.position === 'deep_system' ? 'selected' : ''}>System (deep)</option>
                        <option value="deep_user" ${profile.prompt.position === 'deep_user' ? 'selected' : ''}>User (deep)</option>
                        <option value="deep_assistant" ${profile.prompt.position === 'deep_assistant' ? 'selected' : ''}>Assistant (deep)</option>
                    </select>
                    <input type="number" id="igs_m_prompt_depth" class="text_pole"
                        min="0" max="100" value="${profile.prompt.depth || 0}" style="width: 70px;">
                </div>
                <div class="igs-hint">Where in the conversation history the injection is placed.</div>
            </div>
            `, 'Choose when and where image instructions enter the conversation.')}

            ${renderSettingsGroup('Prompt template', `
            <div class="igs-modal-field">
                <div class="igs-hint">Scene rules combine character background, ongoing story changes, consistent earlier image descriptions, and the latest scene into one complete English image description.</div>
                <div class="igs-inline-group" style="flex-wrap: wrap;">
                    <button type="button" id="igs_m_use_scene_defaults" class="menu_button" ${usingSceneDefaults ? 'disabled' : ''}>Use Scene Defaults</button>
                    ${canRestore ? '<button type="button" id="igs_m_restore_prompts" class="menu_button">Restore Previous Prompts</button>' : ''}
                </div>
                <div class="igs-hint">Replaces both prompt fields below and keeps a saved copy for Restore Previous Prompts. Macro values and other settings stay as configured.</div>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_template">Prompt Template</label>
                <textarea id="igs_m_prompt_template" class="text_pole" rows="4">${esc(profile.prompt.template)}</textarea>
                <div class="igs-hint">The injection prompt sent to the LLM. Use {macroId} to insert custom macro values.</div>
            </div>
            `, 'Set the instruction sent to the language model. Scene defaults can be restored from the saved previous version.')}

            ${renderSettingsGroup('Character reference', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_character_defining">Character Defining Prompt</label>
                <textarea id="igs_m_character_defining" class="text_pole" rows="4"
                    placeholder="${esc(DEFAULT_CHARACTER_PROMPT)}">${esc(profile.promptConstruction.characterDefining || '')}</textarea>
                <div class="igs-hint">Appended for the manually selected character. Use {characterName}, {character}, and {outfits}. Background and outfit references do not override current story changes.</div>
            </div>
            `)}
        </div>

        <div class="igs-modal-divider"></div>

        <div class="igs-modal-section">
            ${renderSettingsGroup('Custom macro editor', `
            <div class="igs-hint" style="margin-bottom: 8px;">Define macros to use as <code>{macroId}</code> placeholders in your prompt template. Control their values from Quick Controls.</div>
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header">Macro list</div>
                    ${macroListHtml}
                    <button class="igs-m-macro-add menu_button">+ Add Macro</button>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header">Macro details</div>
                    ${macroEditorHtml}
                </div>
            </div>
            `)}
        </div>
    `;
}

/**
 * Renders the right-panel editor for a single macro.
 */
function renderMacroEditor(macro, index) {
    let typeFields = '';

    switch (macro.type) {
        case 'list': {
            let optionsHtml = '';
            (macro.options || []).forEach((opt, oi) => {
                const label = (typeof opt === 'object') ? (opt.label || '') : '';
                const text = (typeof opt === 'object') ? (opt.text || '') : (opt || '');
                optionsHtml += `
                    <div class="igs-macro-option-entry" data-option-index="${oi}">
                        <div class="igs-macro-option-fields">
                            <input type="text" class="text_pole igs-m-macro-option-label" value="${esc(label)}" placeholder="Label (short name)">
                            <textarea class="text_pole igs-m-macro-option-text" rows="2" placeholder="Substitution text...">${esc(text)}</textarea>
                        </div>
                        <button class="igs-m-macro-option-delete menu_button" title="Delete option"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
            });
            typeFields = `
                <label class="igs-field-label">Options</label>
                <div class="igs-hint" style="margin-bottom: 4px;">Each option has a short label (shown in dropdowns) and the full text that gets substituted.</div>
                <div class="igs-macro-options-list">${optionsHtml}</div>
                <button class="igs-m-macro-option-add menu_button" style="margin-top: 4px;">+ Add Option</button>`;
            break;
        }
        case 'bool':
            typeFields = `
                <div class="igs-modal-field">
                    <label class="igs-field-label">Text When Enabled</label>
                    <textarea class="text_pole igs-m-macro-bool-text" rows="2">${esc(macro.text || '')}</textarea>
                    <div class="igs-hint">This text replaces {${macro.id}} when ON. When OFF, nothing is inserted.</div>
                </div>`;
            break;
        case 'int':
            typeFields = `
                <div class="igs-inline-group" style="gap: 8px;">
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label">Min</label>
                        <input type="number" class="text_pole igs-m-macro-min" value="${macro.min ?? 0}">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label">Max</label>
                        <input type="number" class="text_pole igs-m-macro-max" value="${macro.max ?? 100}">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label">Step</label>
                        <input type="number" class="text_pole igs-m-macro-step" value="${macro.step ?? 1}" min="1">
                    </div>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Current Value</label>
                    <input type="number" class="text_pole igs-m-macro-value" value="${macro.value ?? 0}"
                        min="${macro.min ?? 0}" max="${macro.max ?? 100}" step="${macro.step ?? 1}">
                </div>`;
            break;
        case 'float':
            typeFields = `
                <div class="igs-inline-group" style="gap: 8px;">
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label">Min</label>
                        <input type="number" class="text_pole igs-m-macro-min" value="${macro.min ?? 0}" step="any">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label">Max</label>
                        <input type="number" class="text_pole igs-m-macro-max" value="${macro.max ?? 1}" step="any">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label">Step</label>
                        <input type="number" class="text_pole igs-m-macro-step" value="${macro.step ?? 0.1}" step="any" min="0.001">
                    </div>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Current Value</label>
                    <input type="number" class="text_pole igs-m-macro-value" value="${macro.value ?? 0}"
                        min="${macro.min ?? 0}" max="${macro.max ?? 1}" step="${macro.step ?? 0.1}">
                </div>`;
            break;
    }

    return `
        <div class="igs-modal-field">
            <label class="igs-field-label">Macro ID</label>
            <input type="text" class="text_pole igs-m-macro-id" value="${esc(macro.id || '')}"
                placeholder="e.g. perspective" pattern="[a-z0-9_]+"
                title="Lowercase letters, numbers, and underscores only">
            <div class="igs-hint">Used as {${macro.id || 'macroId'}} in the prompt template.</div>
        </div>
        <div class="igs-modal-field">
            <label class="igs-field-label">Type</label>
            <select class="text_pole igs-m-macro-type">
                <option value="list" ${macro.type === 'list' ? 'selected' : ''}>List</option>
                <option value="bool" ${macro.type === 'bool' ? 'selected' : ''}>Bool</option>
                <option value="int" ${macro.type === 'int' ? 'selected' : ''}>Int</option>
                <option value="float" ${macro.type === 'float' ? 'selected' : ''}>Float</option>
            </select>
        </div>
        ${typeFields}
        <div class="igs-modal-divider"></div>
        <button class="igs-m-macro-delete menu_button" style="color: #f44336;">
            <i class="fa-solid fa-trash"></i> Delete Macro
        </button>
    `;
}

/**
 * Validates a macro ID for format, reserved words, and uniqueness.
 * @returns {string|null} Error message, or null if valid.
 */
function validateMacroId(id, currentIndex) {
    if (!id || id.trim() === '') return 'Macro ID cannot be empty.';
    if (!/^[a-z0-9_]+$/.test(id)) return 'Macro ID must be lowercase letters, numbers, and underscores only.';
    if (RESERVED_MACRO_IDS.has(id)) return `"${id}" is a reserved macro name and cannot be used.`;
    const profile = getActiveProfile();
    const duplicate = (profile.customMacros || []).findIndex((m, i) => i !== currentIndex && m.id === id);
    if (duplicate >= 0) return `A macro with ID "${id}" already exists.`;
    return null;
}

function bindPromptInjectionTab() {
    const modal = $('#igs_settings_root');
    const profile = getActiveProfile();
    const updateSceneDefaultsButton = () => {
        modal.find('#igs_m_use_scene_defaults').prop('disabled',
            profile.prompt.template === DEFAULT_SCENE_PROMPT
            && profile.promptConstruction.characterDefining === DEFAULT_CHARACTER_PROMPT);
    };

    // Standard prompt injection field bindings
    bindModalInput('igs_m_prompt_enabled', val => { profile.prompt.enabled = val; }, true);
    bindModalInput('igs_m_prompt_frequency', val => {
        profile.prompt.frequency = parseInt(val, 10) || 1;
        profile.prompt.messageCounter = 0;
    });
    bindModalInput('igs_m_prompt_template', val => {
        profile.prompt.template = val;
        updateSceneDefaultsButton();
    });
    bindModalInput('igs_m_prompt_position', val => { profile.prompt.position = val; });
    bindModalInput('igs_m_prompt_depth', val => { profile.prompt.depth = parseInt(val, 10) || 0; });
    bindModalInput('igs_m_character_defining', val => {
        profile.promptConstruction.characterDefining = val;
        updateSceneDefaultsButton();
    });

    modal.on('click.igstab', '#igs_m_use_scene_defaults', () => {
        if (!applyScenePromptDefaults(profile)) return;
        saveProfiles();
        renderActiveTab();
    });
    modal.on('click.igstab', '#igs_m_restore_prompts', () => {
        if (!restorePromptDefaults(profile)) return;
        saveProfiles();
        renderActiveTab();
    });

    // === Custom Macros bindings ===

    // Select a macro in the list
    modal.on('click.igstab', '.igs-m-macro-item', function () {
        selectedMacroIndex = parseInt($(this).data('index'), 10);
        renderActiveTab();
    });

    // Add a new macro
    modal.on('click.igstab', '.igs-m-macro-add', () => {
        if (!profile.customMacros) profile.customMacros = [];
        profile.customMacros.push({
            id: 'new_macro',
            type: 'list',
            value: 0,
            options: [{ label: 'Option 1', text: '' }],
        });
        selectedMacroIndex = profile.customMacros.length - 1;
        saveProfiles();
        renderActiveTab();
    });

    // Delete the selected macro
    modal.on('click.igstab', '.igs-m-macro-delete', () => {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const macro = profile.customMacros[selectedMacroIndex];
        if (!confirm(`Delete macro "${macro.id}"?`)) return;
        profile.customMacros.splice(selectedMacroIndex, 1);
        selectedMacroIndex = -1;
        saveProfiles();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        renderActiveTab();
    });

    // Macro ID change (with validation)
    modal.on('change.igstab', '.igs-m-macro-id', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const newId = $(this).val().trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        const error = validateMacroId(newId, selectedMacroIndex);
        if (error) {
            toastr.error(error);
            $(this).val(profile.customMacros[selectedMacroIndex].id);
            return;
        }
        profile.customMacros[selectedMacroIndex].id = newId;
        saveProfiles();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        // Update the list item label
        modal.find(`.igs-m-macro-item[data-index="${selectedMacroIndex}"] span`).text(newId);
    });

    // Macro type change
    modal.on('change.igstab', '.igs-m-macro-type', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const macro = profile.customMacros[selectedMacroIndex];
        const newType = $(this).val();
        macro.type = newType;
        // Reset value/fields to defaults for the new type
        switch (newType) {
            case 'list':
                macro.value = 0;
                macro.options = macro.options || [{ label: 'Option 1', text: '' }];
                break;
            case 'bool':
                macro.value = false;
                macro.text = macro.text || '';
                break;
            case 'int':
                macro.value = 0;
                macro.min = 0; macro.max = 100; macro.step = 1;
                break;
            case 'float':
                macro.value = 0;
                macro.min = 0; macro.max = 1; macro.step = 0.1;
                break;
        }
        saveProfiles();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        renderActiveTab();
    });

    // Bool text change
    modal.on('input.igstab', '.igs-m-macro-bool-text', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        profile.customMacros[selectedMacroIndex].text = $(this).val();
        saveProfiles();
    });

    // Int/Float min/max/step/value changes
    modal.on('input.igstab', '.igs-m-macro-min', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        profile.customMacros[selectedMacroIndex].min = parseFloat($(this).val()) || 0;
        saveProfiles();
    });
    modal.on('input.igstab', '.igs-m-macro-max', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        profile.customMacros[selectedMacroIndex].max = parseFloat($(this).val()) || 100;
        saveProfiles();
    });
    modal.on('input.igstab', '.igs-m-macro-step', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        profile.customMacros[selectedMacroIndex].step = parseFloat($(this).val()) || 1;
        saveProfiles();
    });
    modal.on('input.igstab', '.igs-m-macro-value', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const macro = profile.customMacros[selectedMacroIndex];
        let val = parseFloat($(this).val());
        if (isNaN(val)) return;
        macro.value = macro.type === 'int' ? Math.round(val) : val;
        saveProfiles();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
    });

    // List option label change
    modal.on('input.igstab', '.igs-m-macro-option-label', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const oi = parseInt($(this).closest('.igs-macro-option-entry').data('option-index'), 10);
        const macro = profile.customMacros[selectedMacroIndex];
        if (macro.options && macro.options[oi] !== undefined) {
            if (typeof macro.options[oi] !== 'object') macro.options[oi] = { label: '', text: macro.options[oi] };
            macro.options[oi].label = $(this).val();
            saveProfiles();
            if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        }
    });

    // List option text change
    modal.on('input.igstab', '.igs-m-macro-option-text', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const oi = parseInt($(this).closest('.igs-macro-option-entry').data('option-index'), 10);
        const macro = profile.customMacros[selectedMacroIndex];
        if (macro.options && macro.options[oi] !== undefined) {
            if (typeof macro.options[oi] !== 'object') macro.options[oi] = { label: '', text: macro.options[oi] };
            macro.options[oi].text = $(this).val();
            saveProfiles();
            if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        }
    });

    // Add list option
    modal.on('click.igstab', '.igs-m-macro-option-add', () => {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const macro = profile.customMacros[selectedMacroIndex];
        if (!macro.options) macro.options = [];
        macro.options.push({ label: '', text: '' });
        saveProfiles();
        renderActiveTab();
    });

    // Delete list option
    modal.on('click.igstab', '.igs-m-macro-option-delete', function () {
        if (selectedMacroIndex < 0 || !profile.customMacros) return;
        const oi = parseInt($(this).closest('.igs-macro-option-entry').data('option-index'), 10);
        const macro = profile.customMacros[selectedMacroIndex];
        if (macro.options) {
            macro.options.splice(oi, 1);
            // Adjust active value index if needed
            if (macro.value >= macro.options.length) {
                macro.value = Math.max(0, macro.options.length - 1);
            }
            saveProfiles();
            if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
            renderActiveTab();
        }
    });
}

// ============================================================
// Tab 3: Detection Settings
// ============================================================

function renderDetectionSettingsTab() {
    const profile = getActiveProfile();
    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('Extraction', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_regex">Regex Pattern</label>
                <input type="text" id="igs_m_regex" class="text_pole"
                    value="${esc(profile.settings.regex)}">
                <div class="igs-hint">The regex pattern used to detect image generation tags in LLM output.</div>
            </div>
            `, 'Control how image-generation tags are recognized in model output.')}

            ${renderSettingsGroup('Insertion', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_insert_type">Insert Type</label>
                <select id="igs_m_insert_type" class="text_pole">
                    <option value="new_message" ${profile.settings.insertType === 'new_message' ? 'selected' : ''}>New Message</option>
                    <option value="in_message" ${profile.settings.insertType === 'in_message' ? 'selected' : ''}>In Message</option>
                </select>
                <div class="igs-hint">How the generated image is inserted into the chat.</div>
            </div>
            <div class="igs-modal-field">
                <label class="igs-toggle-row" for="igs_m_hide_from_llm">
                    <input type="checkbox" id="igs_m_hide_from_llm" class="checkbox"
                        ${profile.settings.hideFromLLM ? 'checked' : ''}>
                    <span>Hide from LLM</span>
                </label>
                <div class="igs-hint">When enabled, generated image messages are hidden from the LLM context.</div>
            </div>
            `, 'Choose where the generated image appears in the conversation.')}
        </div>
    `;
}

function bindDetectionSettingsTab() {
    const profile = getActiveProfile();
    bindModalInput('igs_m_insert_type', val => { profile.settings.insertType = val; });
    bindModalInput('igs_m_regex', val => { profile.settings.regex = val; });
    bindModalInput('igs_m_hide_from_llm', val => { profile.settings.hideFromLLM = val; }, true);
}

// ============================================================
// Tab 4: Connection
// ============================================================

function renderConnectionTab() {
    const profile = getActiveProfile();
    const conn = profile.connection;
    const isComfy = conn.serverType === 'comfy';

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('Backend', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_server_type">Server Type</label>
                <select id="igs_m_server_type" class="text_pole">
                    <option value="comfy" ${conn.serverType === 'comfy' ? 'selected' : ''}>ComfyUI</option>
                    <option value="auto" ${conn.serverType === 'auto' ? 'selected' : ''}>A1111 / Forge</option>
                </select>
            </div>

            <!-- ComfyUI Section -->
            <div class="igs-m-comfy-only" style="${isComfy ? '' : 'display:none;'}">
                <div class="igs-modal-field">
                    <label class="igs-field-label" for="igs_m_comfy_url">ComfyUI URL</label>
                    <div class="igs-inline-group">
                        <input type="text" id="igs_m_comfy_url" class="text_pole"
                            value="${esc(conn.comfyUrl)}" placeholder="http://127.0.0.1:8188">
                        <div id="igs_m_connect_btn" class="menu_button" title="Connect">
                            <i class="fa-solid fa-plug"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- A1111 Section -->
            <div class="igs-m-auto-only" style="${isComfy ? 'display:none;' : ''}">
                <div class="igs-modal-field">
                    <label class="igs-field-label" for="igs_m_auto_url">A1111 URL</label>
                    <input type="text" id="igs_m_auto_url" class="text_pole"
                        value="${esc(conn.autoUrl)}" placeholder="http://localhost:7860">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label" for="igs_m_auto_auth">A1111 Auth</label>
                    <div class="igs-inline-group">
                        <input type="text" id="igs_m_auto_auth" class="text_pole"
                            value="${esc(conn.autoAuth)}" placeholder="user:password (optional)">
                        <div id="igs_m_connect_btn_auto" class="menu_button" title="Connect">
                            <i class="fa-solid fa-plug"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Connection Status -->
            <div class="igs-modal-field">
                <div id="igs_m_connection_status" class="igs-connection-status">
                    <span class="igs-status-dot disconnected"></span>
                    <span>Not connected</span>
                </div>
            </div>
            `, 'Choose a server and connect to it. Backend-specific fields follow the selected server type.')}

            ${renderSettingsGroup('Generation parameters', `
            <!-- Resource Selects -->
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_model">Model</label>
                <select id="igs_m_model" class="text_pole">
                    <option value="${esc(conn.model)}">${esc(conn.model) || 'None/Default'}</option>
                </select>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_vae">VAE</label>
                <select id="igs_m_vae" class="text_pole">
                    <option value="${esc(conn.vae)}">${esc(conn.vae) || 'None/Default'}</option>
                </select>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_sampler">Sampler</label>
                <select id="igs_m_sampler" class="text_pole">
                    <option value="${esc(conn.sampler)}">${esc(conn.sampler) || 'None/Default'}</option>
                </select>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_scheduler">Scheduler</label>
                <select id="igs_m_scheduler" class="text_pole">
                    <option value="${esc(conn.scheduler)}">${esc(conn.scheduler) || 'None/Default'}</option>
                </select>
            </div>

            <hr>

            <!-- Sliders -->
            <div class="igs-modal-field">
                <label class="igs-field-label">Steps</label>
                <div class="igs-slider-container">
                    <input type="range" id="igs_m_steps" min="1" max="150" value="${conn.steps || 20}">
                    <input type="number" id="igs_m_steps_value" min="1" max="150" value="${conn.steps || 20}">
                </div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label">CFG Scale</label>
                <div class="igs-slider-container">
                    <input type="range" id="igs_m_cfg_scale" min="1" max="30" step="0.5" value="${conn.cfgScale || 7}">
                    <input type="number" id="igs_m_cfg_scale_value" min="1" max="30" step="0.5" value="${conn.cfgScale || 7}">
                </div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label">Width</label>
                <div class="igs-slider-container">
                    <input type="range" id="igs_m_width" min="64" max="2048" step="64" value="${conn.width || 512}">
                    <input type="number" id="igs_m_width_value" min="64" max="2048" step="64" value="${conn.width || 512}">
                </div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label">Height</label>
                <div class="igs-slider-container">
                    <input type="range" id="igs_m_height" min="64" max="2048" step="64" value="${conn.height || 512}">
                    <input type="number" id="igs_m_height_value" min="64" max="2048" step="64" value="${conn.height || 512}">
                </div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label">Denoising Strength</label>
                <div class="igs-slider-container">
                    <input type="range" id="igs_m_denoising" min="0" max="1" step="0.05" value="${conn.denoisingStrength ?? 0.7}">
                    <input type="number" id="igs_m_denoising_value" min="0" max="1" step="0.05" value="${conn.denoisingStrength ?? 0.7}">
                </div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label">Clip Skip</label>
                <div class="igs-slider-container">
                    <input type="range" id="igs_m_clip_skip" min="1" max="12" value="${conn.clipSkip || 1}">
                    <input type="number" id="igs_m_clip_skip_value" min="1" max="12" value="${conn.clipSkip || 1}">
                </div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_seed">Seed</label>
                <input type="number" id="igs_m_seed" class="text_pole" value="${conn.seed ?? -1}">
                <div class="igs-hint">Use -1 for random seed.</div>
            </div>
            `, 'Select the model and tune image size, sampling, and seed.')}

            ${renderSettingsGroup('Workflow', `
            <!-- ComfyUI Workflow -->
            <div class="igs-m-comfy-only" style="${isComfy ? '' : 'display:none;'}">
                <div class="igs-modal-field">
                    <label class="igs-field-label">ComfyUI Workflow</label>
                    <div class="igs-workflow-bar">
                        <select id="igs_m_comfy_workflow" class="text_pole">
                            <option value="${esc(conn.comfyWorkflow)}">${esc(conn.comfyWorkflow) || 'None/Default'}</option>
                        </select>
                        <div class="igs-workflow-actions">
                            <div class="menu_button" id="igs_m_workflow_edit" title="Edit Workflow"><i class="fa-solid fa-pen-to-square"></i></div>
                            <div class="menu_button" id="igs_m_workflow_new" title="New Workflow"><i class="fa-solid fa-plus"></i></div>
                            <div class="menu_button" id="igs_m_workflow_rename" title="Rename Workflow"><i class="fa-solid fa-pencil"></i></div>
                            <div class="menu_button" id="igs_m_workflow_delete" title="Delete Workflow"><i class="fa-solid fa-trash-can"></i></div>
                        </div>
                    </div>
                </div>
                <div id="igs_workflow_editor_mount"></div>
            </div>
            `, 'Choose or edit the ComfyUI workflow used for generation.', isComfy ? 'igs-workflow-settings-group' : 'igs-workflow-settings-group igs-settings-group-hidden')}
        </div>
    `;
}

/**
 * Connects to the active backend, validates connection,
 * and populates resource selects (models, vaes, samplers, etc.) in the Connection tab.
 *
 * @param {'comfy'|'auto'} type - The backend type.
 */
async function handleModalConnect(type) {
    try {
        const profile = getActiveProfile();
        const url = type === 'comfy' ? profile.connection.comfyUrl : profile.connection.autoUrl;
        const auth = type === 'auto' ? profile.connection.autoAuth : '';

        const statusDot = $('#igs_m_connection_status .igs-status-dot');
        const statusText = $('#igs_m_connection_status span').last();
        statusDot.removeClass('connected disconnected').addClass('connecting');
        statusText.text('Connecting...');

        const success = await testConnection(type, url, auth);

        if (success) {
            statusDot.removeClass('connecting').addClass('connected');
            statusText.text('Connected');

            toastr.info('Loading models and resources...');
            const [models, vaes, samplers, schedulers, workflows] = await Promise.all([
                loadModels(type, url, auth),
                loadVaes(type, url, auth),
                loadSamplers(type, url, auth),
                loadSchedulers(type, url, auth),
                type === 'comfy' ? loadWorkflows(url) : Promise.resolve([])
            ]);

            populateModalSelect('igs_m_model', models, profile.connection.model);
            populateModalSelect('igs_m_vae', vaes, profile.connection.vae);
            populateModalSelect('igs_m_sampler', samplers, profile.connection.sampler);
            populateModalSelect('igs_m_scheduler', schedulers, profile.connection.scheduler);

            if (type === 'comfy') {
                populateModalSelect('igs_m_comfy_workflow', workflows, profile.connection.comfyWorkflow);
            }

            toastr.success('Resources loaded!');
        } else {
            statusDot.removeClass('connecting').addClass('disconnected');
            statusText.text('Failed');
        }
    } catch (err) {
        console.error('[IGS] Connection error:', err);
        toastr.error('Connection failed: ' + err.message);

        const statusDot = $('#igs_m_connection_status .igs-status-dot');
        const statusText = $('#igs_m_connection_status span').last();
        statusDot.removeClass('connecting').addClass('disconnected');
        statusText.text('Failed');
    }
}

function bindConnectionTab() {
    const profile = getActiveProfile();
    const conn = profile.connection;
    const modal = $('#igs_settings_root');

    // Server type toggle
    modal.on('change.igstab', '#igs_m_server_type', function () {
        conn.serverType = $(this).val();
        saveProfiles();
        if (conn.serverType === 'comfy') {
            modal.find('.igs-m-comfy-only').show();
            modal.find('.igs-m-auto-only').hide();
        } else {
            modal.find('.igs-m-comfy-only').hide();
            modal.find('.igs-m-auto-only').show();
        }
        modal.find('.igs-workflow-settings-group').toggle(conn.serverType === 'comfy');
    });

    // URL / Auth inputs
    bindModalInput('igs_m_comfy_url', val => { conn.comfyUrl = val; });
    bindModalInput('igs_m_auto_url', val => { conn.autoUrl = val; });
    bindModalInput('igs_m_auto_auth', val => { conn.autoAuth = val; });

    // Connect buttons
    modal.on('click.igstab', '#igs_m_connect_btn', () => handleModalConnect('comfy'));
    modal.on('click.igstab', '#igs_m_connect_btn_auto', () => handleModalConnect('auto'));

    // Resource selects
    bindModalInput('igs_m_model', val => { conn.model = val; });
    bindModalInput('igs_m_vae', val => { conn.vae = val; });
    bindModalInput('igs_m_sampler', val => { conn.sampler = val; });
    bindModalInput('igs_m_scheduler', val => { conn.scheduler = val; });
    bindModalInput('igs_m_comfy_workflow', val => { conn.comfyWorkflow = val; });

    // --- Workflow Management Handlers ---

    /**
     * Opens the inline editor for the given workflow file.
     * @param {string} fileName - The workflow filename to edit.
     */
    async function openWorkflowEditor(fileName) {
        try {
            const mount = document.getElementById('igs_workflow_editor_mount');
            const profileId = profile.id;
            if (!mount) return;

            const workflowData = await loadWorkflow(fileName);
            if (!mount.isConnected || getActiveProfile()?.id !== profileId) return;
            const jsonText = typeof workflowData === 'string' ? workflowData : JSON.stringify(workflowData, null, 2);

            const popup = document.createElement('div');
            popup.className = 'igs-workflow-editor-popup';
            popup.innerHTML = `
                <div class="igs-workflow-editor-header">
                    <h3>Edit Workflow: ${esc(fileName)}</h3>
                    <i class="fa-solid fa-xmark igs-workflow-editor-close" title="Cancel"></i>
                </div>
                <textarea class="igs-workflow-editor-textarea" spellcheck="false">${esc(jsonText)}</textarea>
                <div class="igs-workflow-editor-footer">
                    <button class="menu_button igs-workflow-editor-save">Save</button>
                    <button class="menu_button igs-workflow-editor-cancel">Cancel</button>
                </div>
            `;
            mount.replaceChildren(popup);

            const closePopup = () => popup.remove();

            popup.querySelector('.igs-workflow-editor-close').addEventListener('click', closePopup);
            popup.querySelector('.igs-workflow-editor-cancel').addEventListener('click', closePopup);
            popup.querySelector('.igs-workflow-editor-save').addEventListener('click', async () => {
                try {
                    const editedJson = popup.querySelector('.igs-workflow-editor-textarea').value;
                    // Validate JSON before saving
                    JSON.parse(editedJson);
                    await saveWorkflow(fileName, editedJson);
                    toastr.success('Workflow saved!');
                    closePopup();
                } catch (err) {
                    toastr.error('Save failed: ' + err.message);
                }
            });
        } catch (err) {
            toastr.error('Failed to load workflow: ' + err.message);
        }
    }

    /**
     * Helper to reload the workflow dropdown and select a specific value.
     * @param {string} [selectValue] - The value to select after reloading.
     */
    async function reloadWorkflowList(selectValue) {
        const url = profile.connection.comfyUrl;
        if (!url) return;
        const workflows = await loadWorkflows(url);
        populateModalSelect('igs_m_comfy_workflow', workflows, selectValue || '');
        if (selectValue) {
            conn.comfyWorkflow = selectValue;
            saveProfiles();
        }
    }

    // Edit workflow
    modal.on('click.igstab', '#igs_m_workflow_edit', async () => {
        const fileName = $('#igs_m_comfy_workflow').val();
        if (!fileName) {
            toastr.warning('No workflow selected.');
            return;
        }
        await openWorkflowEditor(fileName);
    });

    // New workflow
    modal.on('click.igstab', '#igs_m_workflow_new', async () => {
        const name = prompt('New workflow filename:');
        if (!name) return;
        try {
            await saveWorkflow(name, '{}');
            toastr.success(`Workflow "${name}" created!`);
            await reloadWorkflowList(name);
            await openWorkflowEditor(name);
        } catch (err) {
            toastr.error('Failed to create workflow: ' + err.message);
        }
    });

    // Rename workflow
    modal.on('click.igstab', '#igs_m_workflow_rename', async () => {
        const oldName = $('#igs_m_comfy_workflow').val();
        if (!oldName) {
            toastr.warning('No workflow selected.');
            return;
        }
        const newName = prompt('New name for workflow:', oldName);
        if (!newName || newName === oldName) return;
        try {
            await renameWorkflow(oldName, newName);
            toastr.success(`Workflow renamed to "${newName}"!`);
            await reloadWorkflowList(newName);
        } catch (err) {
            toastr.error('Failed to rename workflow: ' + err.message);
        }
    });

    // Delete workflow
    modal.on('click.igstab', '#igs_m_workflow_delete', async () => {
        const fileName = $('#igs_m_comfy_workflow').val();
        if (!fileName) {
            toastr.warning('No workflow selected.');
            return;
        }
        if (!confirm(`Delete workflow "${fileName}"?`)) return;
        try {
            await deleteWorkflow(fileName);
            toastr.success(`Workflow "${fileName}" deleted!`);
            conn.comfyWorkflow = '';
            saveProfiles();
            await reloadWorkflowList('');
        } catch (err) {
            toastr.error('Failed to delete workflow: ' + err.message);
        }
    });

    // Sliders
    bindModalSlider('igs_m_steps', 'igs_m_steps_value', val => { conn.steps = parseInt(val, 10); });
    bindModalSlider('igs_m_cfg_scale', 'igs_m_cfg_scale_value', val => { conn.cfgScale = parseFloat(val); });
    bindModalSlider('igs_m_width', 'igs_m_width_value', val => { conn.width = parseInt(val, 10); });
    bindModalSlider('igs_m_height', 'igs_m_height_value', val => { conn.height = parseInt(val, 10); });
    bindModalSlider('igs_m_denoising', 'igs_m_denoising_value', val => { conn.denoisingStrength = parseFloat(val); });
    bindModalSlider('igs_m_clip_skip', 'igs_m_clip_skip_value', val => { conn.clipSkip = parseInt(val, 10); });

    // Seed
    bindModalInput('igs_m_seed', val => { conn.seed = parseInt(val, 10); });
}

// ============================================================
// Tab 5: Image Prompt Construction
// ============================================================

function renderPromptConstructionTab() {
    const profile = getActiveProfile();
    const pc = profile.promptConstruction;

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('Positive prompt', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_prefix">Prompt Prefix</label>
                <textarea id="igs_m_prompt_prefix" class="text_pole" rows="2">${esc(pc.prefix)}</textarea>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_suffix">Prompt Suffix</label>
                <textarea id="igs_m_prompt_suffix" class="text_pole" rows="2">${esc(pc.suffix)}</textarea>
            </div>
            `, 'Add text before and after the generated positive prompt.')}

            ${renderSettingsGroup('Negative prompt', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_negative_prompt_prefix">Negative Prefix</label>
                <textarea id="igs_m_negative_prompt_prefix" class="text_pole" rows="2">${esc(pc.negativePrefix)}</textarea>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_negative_suffix">Negative Suffix</label>
                <textarea id="igs_m_negative_suffix" class="text_pole" rows="2">${esc(pc.negativeSuffix)}</textarea>
            </div>
            `, 'Add text before and after the negative prompt.')}

            ${renderSettingsGroup('Prompt templates', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_positive_prompt_template">Positive Template</label>
                <textarea id="igs_m_positive_prompt_template" class="text_pole" rows="3"
                    placeholder="{prefix}, {prompt}, {promptExtra}, {style}, {loras}, {suffix}">${esc(pc.positiveTemplate)}</textarea>
                <div class="igs-hint">Available macros: {prefix}, {prompt}, {promptExtra}, {style}, {loras}, {suffix}</div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_negative_prompt_template">Negative Template</label>
                <textarea id="igs_m_negative_prompt_template" class="text_pole" rows="3"
                    placeholder="{negativePrefix}, {negative}, {negativeExtra}, {negativeSuffix}">${esc(pc.negativeTemplate)}</textarea>
                <div class="igs-hint">Available macros: {negativePrefix}, {negative}, {negativeExtra}, {negativeSuffix}</div>
            </div>
            `, 'Set how prompt parts are combined before sending them to the backend.')}
        </div>
    `;
}

function bindPromptConstructionTab() {
    const profile = getActiveProfile();
    const pc = profile.promptConstruction;
    bindModalInput('igs_m_prompt_prefix', val => { pc.prefix = val; });
    bindModalInput('igs_m_negative_prompt_prefix', val => { pc.negativePrefix = val; });
    bindModalInput('igs_m_prompt_suffix', val => { pc.suffix = val; });
    bindModalInput('igs_m_negative_suffix', val => { pc.negativeSuffix = val; });
    bindModalInput('igs_m_positive_prompt_template', val => { pc.positiveTemplate = val; });
    bindModalInput('igs_m_negative_prompt_template', val => { pc.negativeTemplate = val; });
}

// ============================================================
// Tab 6: Styles (List + Editor)
// ============================================================

/**
 * Returns the currently active styles array from the active style profile.
 * @returns {{ profile: object|null, styles: Array }}
 */
function getActiveStyles() {
    const settings = getSettings();
    const profile = getActiveProfile();
    if (!profile?.activeStyleProfileId || !settings.styleProfiles) return { profile: null, styles: [] };
    const sp = settings.styleProfiles[profile.activeStyleProfileId];
    if (!sp) return { profile: null, styles: [] };
    return { profile: sp, styles: sp.styles || [] };
}

function renderStylesTab() {
    const settings = getSettings();
    const profile = getActiveProfile();
    const { profile: sp, styles } = getActiveStyles();

    // Style profile bar
    let styleProfileOptions = '';
    if (settings.styleProfiles) {
        Object.values(settings.styleProfiles).forEach(p => {
            styleProfileOptions += `<option value="${p.id}" ${profile.activeStyleProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`;
        });
    }

    // Style items list
    let listItems = '';
    if (styles.length === 0) {
        listItems = '<div class="igs-modal-empty-msg">No styles. Click + Add Style to create one.</div>';
    } else {
        styles.forEach((style, idx) => {
            listItems += `
                <div class="igs-modal-list-item${idx === selectedStyleIndex ? ' active' : ''}" data-index="${idx}">
                    <span>${esc(style.name) || '(Unnamed)'}</span>
                </div>
            `;
        });
    }

    // Editor panel
    let editorHtml = '';
    if (selectedStyleIndex >= 0 && selectedStyleIndex < styles.length) {
        const style = styles[selectedStyleIndex];
        editorHtml = `
            <div class="igs-modal-editor-content">
                <div class="igs-modal-field">
                    <label class="igs-field-label">Style Name</label>
                    <input type="text" class="text_pole igs-m-style-name" value="${esc(style.name)}">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Description</label>
                    <input type="text" class="text_pole igs-m-style-desc" value="${esc(style.description || '')}">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Content / Prompt</label>
                    <textarea class="text_pole igs-m-style-content" rows="3">${esc(style.content || '')}</textarea>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Preview Image URL</label>
                    <div class="igs-inline-group">
                        <input type="text" class="text_pole igs-m-style-preview-url" value="${esc(style.preview_image || '')}"
                            placeholder="http://... or upload below">
                        <div class="menu_button menu_button_icon igs-m-style-img-upload-btn" title="Upload Image">
                            <i class="fa-solid fa-file-arrow-up"></i>
                        </div>
                        <input type="file" class="igs-m-style-img-file-input" accept="image/*" style="display:none;">
                    </div>
                </div>
                ${style.preview_image ? `
                <div class="igs-style-item-preview-box">
                    <img src="${esc(style.preview_image)}" alt="Preview">
                </div>
                ` : ''}
                <div class="igs-modal-field" style="margin-top: 12px;">
                    <div class="menu_button menu_button_icon igs-m-style-delete" title="Delete Style" style="color: #f44336;">
                        <i class="fa-solid fa-trash-can"></i>
                        <span>Delete Style</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        editorHtml = '<div class="igs-modal-editor-placeholder">Select a style from the list to edit.</div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('Style collection', `
            <div class="igs-profile-bar">
                <select id="igs_m_style_profile_select" class="text_pole">${styleProfileOptions}</select>
                <div class="igs-profile-actions">
                    <div class="menu_button" id="igs_m_style_profile_add" title="Add Style Profile"><i class="fa-solid fa-plus"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_duplicate" title="Duplicate"><i class="fa-solid fa-copy"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_rename" title="Rename"><i class="fa-solid fa-pencil"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_delete" title="Delete"><i class="fa-solid fa-trash-can"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_export" title="Export"><i class="fa-solid fa-file-export"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_import" title="Import"><i class="fa-solid fa-file-import"></i></div>
                </div>
                <input type="file" id="igs_m_style_profile_import_file" accept=".json" style="display:none;">
            </div>
            `, 'Choose a collection and manage its saved profiles.')}

            ${renderSettingsGroup('Styles in this collection', `
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header">Style list</div>
                    ${listItems}
                    <div class="menu_button menu_button_icon igs-m-style-add" style="width:100%; margin-top: 6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span>Add Style</span>
                    </div>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header">Style details</div>
                    ${editorHtml}
                </div>
            </div>
            `, 'Select a style to edit its name, prompt, and preview image.')}
        </div>
    `;
}

function bindStylesTab() {
    const modal = $('#igs_settings_root');
    const profile = getActiveProfile();
    const settings = getSettings();

    // Style profile CRUD
    modal.on('change.igstab', '#igs_m_style_profile_select', function () {
        profile.activeStyleProfileId = $(this).val();
        selectedStyleIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingStyleSelect) modalCallbacks.populateFloatingStyleSelect();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_style_profile_add', () => {
        const name = prompt('New style profile name:', 'New Styles Profile');
        if (!name) return;
        const sp = addStyleProfile(name);
        profile.activeStyleProfileId = sp.id;
        selectedStyleIndex = -1;
        saveProfiles();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_style_profile_duplicate', () => {
        const id = profile.activeStyleProfileId;
        if (!id) return;
        const sp = duplicateStyleProfile(id);
        if (sp) {
            profile.activeStyleProfileId = sp.id;
            selectedStyleIndex = -1;
            saveProfiles();
            renderActiveTab();
        }
    });

    modal.on('click.igstab', '#igs_m_style_profile_rename', () => {
        const id = profile.activeStyleProfileId;
        if (!id || !settings.styleProfiles?.[id]) return;
        const newName = prompt('Rename style profile:', settings.styleProfiles[id].name);
        if (!newName) return;
        renameStyleProfile(id, newName);
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_style_profile_delete', () => {
        const id = profile.activeStyleProfileId;
        if (!id) return;
        if (!confirm('Delete this style profile?')) return;
        deleteStyleProfile(id);
        profile.activeStyleProfileId = Object.keys(settings.styleProfiles || {})[0] || '';
        selectedStyleIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingStyleSelect) modalCallbacks.populateFloatingStyleSelect();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_style_profile_export', () => {
        const id = profile.activeStyleProfileId;
        if (id) exportStyleProfile(id);
    });

    modal.on('click.igstab', '#igs_m_style_profile_import', () => {
        $('#igs_m_style_profile_import_file').trigger('click');
    });

    modal.on('change.igstab', '#igs_m_style_profile_import_file', function () {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const sp = importStyleProfile(e.target.result);
            if (sp) {
                profile.activeStyleProfileId = sp.id;
                selectedStyleIndex = -1;
                saveProfiles();
                toastr.success(`Imported style profile: ${sp.name}`);
                renderActiveTab();
            }
        };
        reader.readAsText(file);
        $(this).val('');
    });

    // Style list item selection
    modal.on('click.igstab', '.igs-modal-item-list .igs-modal-list-item', function () {
        selectedStyleIndex = parseInt($(this).data('index'), 10);
        renderActiveTab();
    });

    // Add style
    modal.on('click.igstab', '.igs-m-style-add', () => {
        const { profile: sp } = getActiveStyles();
        if (!sp) return;
        if (!sp.styles) sp.styles = [];
        sp.styles.push({ name: 'New Style', description: '', content: '', preview_image: '' });
        selectedStyleIndex = sp.styles.length - 1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingStyleSelect) modalCallbacks.populateFloatingStyleSelect();
        renderActiveTab();
    });

    // Editor bindings (delegated)
    modal.on('input.igstab', '.igs-m-style-name', function () {
        const { styles } = getActiveStyles();
        if (selectedStyleIndex < 0 || selectedStyleIndex >= styles.length) return;
        styles[selectedStyleIndex].name = $(this).val();
        saveProfiles();
        // Update list item text
        modal.find(`.igs-modal-list-item[data-index="${selectedStyleIndex}"] span`).text($(this).val() || '(Unnamed)');
        if (modalCallbacks?.populateFloatingStyleSelect) modalCallbacks.populateFloatingStyleSelect();
    });

    modal.on('input.igstab', '.igs-m-style-desc', function () {
        const { styles } = getActiveStyles();
        if (selectedStyleIndex < 0 || selectedStyleIndex >= styles.length) return;
        styles[selectedStyleIndex].description = $(this).val();
        saveProfiles();
    });

    modal.on('input.igstab', '.igs-m-style-content', function () {
        const { styles } = getActiveStyles();
        if (selectedStyleIndex < 0 || selectedStyleIndex >= styles.length) return;
        styles[selectedStyleIndex].content = $(this).val();
        saveProfiles();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
    });

    modal.on('input.igstab', '.igs-m-style-preview-url', function () {
        const { styles } = getActiveStyles();
        if (selectedStyleIndex < 0 || selectedStyleIndex >= styles.length) return;
        styles[selectedStyleIndex].preview_image = $(this).val();
        saveProfiles();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
    });

    // Image upload
    modal.on('click.igstab', '.igs-m-style-img-upload-btn', function () {
        $(this).siblings('.igs-m-style-img-file-input').trigger('click');
    });

    modal.on('change.igstab', '.igs-m-style-img-file-input', function () {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const { styles } = getActiveStyles();
            if (selectedStyleIndex < 0 || selectedStyleIndex >= styles.length) return;
            styles[selectedStyleIndex].preview_image = e.target.result;
            saveProfiles();
            if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
            renderActiveTab();
        };
        reader.readAsDataURL(file);
        $(this).val('');
    });

    // Delete style
    modal.on('click.igstab', '.igs-m-style-delete', () => {
        const { profile: sp, styles } = getActiveStyles();
        if (selectedStyleIndex < 0 || selectedStyleIndex >= styles.length) return;
        if (!confirm(`Delete style "${styles[selectedStyleIndex].name}"?`)) return;
        styles.splice(selectedStyleIndex, 1);
        selectedStyleIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingStyleSelect) modalCallbacks.populateFloatingStyleSelect();
        if (modalCallbacks?.updateFloatingWindow) modalCallbacks.updateFloatingWindow();
        renderActiveTab();
    });
}

// ============================================================
// Tab 7: Characters (List + Editor)
// ============================================================

/**
 * Resolves the active characters array from the active character profile.
 * @returns {{ profile: object|null, characters: Array }}
 */
function getActiveCharacters() {
    const settings = getSettings();
    const profile = getActiveProfile();
    if (!profile?.activeCharacterProfileId || !settings.characterProfiles) return { profile: null, characters: [] };
    const cp = settings.characterProfiles[profile.activeCharacterProfileId];
    if (!cp) return { profile: null, characters: [] };
    return { profile: cp, characters: cp.characters || [] };
}

function renderCharactersTab() {
    const settings = getSettings();
    const profile = getActiveProfile();
    const { profile: cp, characters: chars } = getActiveCharacters();

    // Character profile bar
    let charProfileOptions = '';
    if (settings.characterProfiles) {
        Object.values(settings.characterProfiles).forEach(p => {
            charProfileOptions += `<option value="${p.id}" ${profile.activeCharacterProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`;
        });
    }

    // Character list items
    let listItems = '';
    if (chars.length === 0) {
        listItems = '<div class="igs-modal-empty-msg">No characters. Click + Add Character to create one.</div>';
    } else {
        chars.forEach((char, idx) => {
            listItems += `
                <div class="igs-modal-list-item${idx === selectedCharIndex ? ' active' : ''}" data-index="${idx}">
                    <span>${esc(char.name) || '(Unnamed)'}</span>
                </div>
            `;
        });
    }

    // Editor panel
    let editorHtml = '';
    if (selectedCharIndex >= 0 && selectedCharIndex < chars.length) {
        const char = chars[selectedCharIndex];
        const outfitsHtml = (char.outfits || []).map((outfit, oi) => `
            <div class="igs-modal-outfit-entry" data-outfit-index="${oi}">
                <div class="igs-inline-group">
                    <input type="text" class="text_pole igs-m-outfit-name" value="${esc(outfit.name || '')}" placeholder="Outfit name" style="flex: 0 0 120px;">
                    <input type="text" class="text_pole igs-m-outfit-desc" value="${esc(outfit.description || '')}" placeholder="Outfit description" style="flex: 1;">
                    <div class="menu_button menu_button_icon igs-m-outfit-delete" title="Remove outfit" style="padding: 3px 6px;">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>
        `).join('');

        editorHtml = `
            <div class="igs-modal-editor-content">
                <div class="igs-modal-field">
                    <label class="igs-field-label">Character Name</label>
                    <input type="text" class="text_pole igs-m-char-name" value="${esc(char.name || '')}">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Character Prompt</label>
                    <textarea class="text_pole igs-m-char-prompt" rows="3"
                        placeholder="Describe this character for image generation...">${esc(char.prompt || '')}</textarea>
                    <div class="igs-hint">Use a name that matches the story participant. Appearance is a starting reference; explicit story changes take priority.</div>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Outfits</label>
                    <div class="igs-hint">Reference options, not proof of what is currently worn. Scene defaults follow the story instead of choosing or mixing outfits automatically.</div>
                    <div class="igs-m-outfits-container">
                        ${outfitsHtml}
                    </div>
                    <div class="menu_button menu_button_icon igs-m-outfit-add" style="margin-top: 4px; padding: 3px 12px; font-size: 0.85em;">
                        <i class="fa-solid fa-plus"></i>
                        <span>Add Outfit</span>
                    </div>
                </div>
                <div class="igs-modal-field" style="margin-top: 12px;">
                    <div class="menu_button menu_button_icon igs-m-char-delete" title="Delete Character" style="color: #f44336;">
                        <i class="fa-solid fa-trash-can"></i>
                        <span>Delete Character</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        editorHtml = '<div class="igs-modal-editor-placeholder">Select a character from the list to edit.</div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('Character collection', `
            <div class="igs-profile-bar">
                <select id="igs_m_char_profile_select" class="text_pole">${charProfileOptions}</select>
                <div class="igs-profile-actions">
                    <div class="menu_button" id="igs_m_char_profile_add" title="Add Character Profile"><i class="fa-solid fa-plus"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_duplicate" title="Duplicate"><i class="fa-solid fa-copy"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_rename" title="Rename"><i class="fa-solid fa-pencil"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_delete" title="Delete"><i class="fa-solid fa-trash-can"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_export" title="Export"><i class="fa-solid fa-file-export"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_import" title="Import"><i class="fa-solid fa-file-import"></i></div>
                </div>
                <input type="file" id="igs_m_char_profile_import_file" accept=".json" style="display:none;">
            </div>
            `, 'Choose a collection and manage its saved profiles.')}

            ${renderSettingsGroup('Characters in this collection', `
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header">Character list</div>
                    ${listItems}
                    <div class="menu_button menu_button_icon igs-m-char-add" style="width:100%; margin-top: 6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span>Add Character</span>
                    </div>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header">Character details</div>
                    ${editorHtml}
                </div>
            </div>
            `, 'Select a character to edit its reference and optional outfits.')}
        </div>
    `;
}

function bindCharactersTab() {
    const modal = $('#igs_settings_root');
    const profile = getActiveProfile();

    // === Character Profile bar ===
    modal.on('change.igstab', '#igs_m_char_profile_select', function () {
        profile.activeCharacterProfileId = $(this).val();
        selectedCharIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_char_profile_add', () => {
        const name = prompt('New character profile name:');
        if (!name) return;
        const newProfile = addCharacterProfile(name);
        profile.activeCharacterProfileId = newProfile.id;
        selectedCharIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_char_profile_duplicate', () => {
        const id = profile.activeCharacterProfileId;
        if (!id) return;
        const clone = duplicateCharacterProfile(id);
        if (clone) {
            profile.activeCharacterProfileId = clone.id;
            selectedCharIndex = -1;
            saveProfiles();
            renderActiveTab();
        }
    });

    modal.on('click.igstab', '#igs_m_char_profile_rename', () => {
        const settings = getSettings();
        const id = profile.activeCharacterProfileId;
        if (!id || !settings.characterProfiles?.[id]) return;
        const newName = prompt('Rename character profile:', settings.characterProfiles[id].name);
        if (!newName) return;
        renameCharacterProfile(id, newName);
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_char_profile_delete', () => {
        const id = profile.activeCharacterProfileId;
        if (!id) return;
        if (!confirm('Delete this character profile?')) return;
        deleteCharacterProfile(id);
        const settings = getSettings();
        profile.activeCharacterProfileId = Object.keys(settings.characterProfiles)[0];
        selectedCharIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_char_profile_export', () => {
        const id = profile.activeCharacterProfileId;
        if (!id) return;
        exportCharacterProfile(id);
    });

    modal.on('click.igstab', '#igs_m_char_profile_import', () => {
        $('#igs_m_char_profile_import_file').trigger('click');
    });

    modal.on('change.igstab', '#igs_m_char_profile_import_file', function () {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imported = importCharacterProfile(e.target.result);
            if (imported) {
                profile.activeCharacterProfileId = imported.id;
                selectedCharIndex = -1;
                saveProfiles();
                if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
                renderActiveTab();
                toastr.success(`Imported character profile: ${imported.name}`);
            }
        };
        reader.readAsText(file);
        $(this).val('');
    });

    // === Character list + editor ===

    // List item selection
    modal.on('click.igstab', '.igs-modal-item-list .igs-modal-list-item', function () {
        if (activeTabId !== 'characters') return;
        selectedCharIndex = parseInt($(this).data('index'), 10);
        renderActiveTab();
    });

    // Add character
    modal.on('click.igstab', '.igs-m-char-add', () => {
        const { characters: chars } = getActiveCharacters();
        chars.push({
            id: crypto.randomUUID(),
            name: 'New Character',
            prompt: '',
            outfits: [],
        });
        selectedCharIndex = chars.length - 1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
        renderActiveTab();
    });

    // Character name
    modal.on('input.igstab', '.igs-m-char-name', function () {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        chars[selectedCharIndex].name = $(this).val();
        saveProfiles();
        modal.find(`.igs-modal-list-item[data-index="${selectedCharIndex}"] span`).text($(this).val() || '(Unnamed)');
        if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
    });

    // Character prompt
    modal.on('input.igstab', '.igs-m-char-prompt', function () {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        chars[selectedCharIndex].prompt = $(this).val();
        saveProfiles();
    });

    // Add outfit
    modal.on('click.igstab', '.igs-m-outfit-add', () => {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        const char = chars[selectedCharIndex];
        if (!char.outfits) char.outfits = [];
        char.outfits.push({ name: '', description: '' });
        saveProfiles();
        renderActiveTab();
    });

    // Outfit name
    modal.on('input.igstab', '.igs-m-outfit-name', function () {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        const oi = parseInt($(this).closest('.igs-modal-outfit-entry').data('outfit-index'), 10);
        const char = chars[selectedCharIndex];
        if (char.outfits && char.outfits[oi] !== undefined) {
            char.outfits[oi].name = $(this).val();
            saveProfiles();
        }
    });

    // Outfit description
    modal.on('input.igstab', '.igs-m-outfit-desc', function () {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        const oi = parseInt($(this).closest('.igs-modal-outfit-entry').data('outfit-index'), 10);
        const char = chars[selectedCharIndex];
        if (char.outfits && char.outfits[oi] !== undefined) {
            char.outfits[oi].description = $(this).val();
            saveProfiles();
        }
    });

    // Delete outfit
    modal.on('click.igstab', '.igs-m-outfit-delete', function () {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        const oi = parseInt($(this).closest('.igs-modal-outfit-entry').data('outfit-index'), 10);
        const char = chars[selectedCharIndex];
        if (char.outfits) {
            char.outfits.splice(oi, 1);
            saveProfiles();
            renderActiveTab();
        }
    });

    // Delete character
    modal.on('click.igstab', '.igs-m-char-delete', () => {
        const { characters: chars } = getActiveCharacters();
        if (selectedCharIndex < 0 || selectedCharIndex >= chars.length) return;
        if (!confirm(`Delete character "${chars[selectedCharIndex].name}"?`)) return;
        chars.splice(selectedCharIndex, 1);
        selectedCharIndex = -1;
        saveProfiles();
        if (modalCallbacks?.populateFloatingCharacterSelect) modalCallbacks.populateFloatingCharacterSelect();
        renderActiveTab();
    });
}

// ============================================================
// Tab 8: LoRAs (List + Editor)
// ============================================================

/**
 * Resolves the active LoRA entries array from the active LoRA profile.
 * @returns {Array} The entries array (by reference).
 */
function getActiveLoraEntries() {
    const settings = getSettings();
    const profile = getActiveProfile();
    if (profile.activeLoraProfileId && settings.loraProfiles && settings.loraProfiles[profile.activeLoraProfileId]) {
        return settings.loraProfiles[profile.activeLoraProfileId].entries || [];
    }
    return [];
}

function renderLorasTab() {
    const settings = getSettings();
    const profile = getActiveProfile();
    const entries = getActiveLoraEntries();

    // LoRA profile bar
    let loraProfileOptions = '';
    if (settings.loraProfiles) {
        Object.values(settings.loraProfiles).forEach(p => {
            loraProfileOptions += `<option value="${p.id}" ${profile.activeLoraProfileId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`;
        });
    }

    // LoRA entry list items
    let listItems = '';
    if (entries.length === 0) {
        listItems = '<div class="igs-modal-empty-msg">No LoRA entries. Click + Add LoRA to create one.</div>';
    } else {
        entries.forEach((entry, idx) => {
            const label = entry.description || (entry.triggers?.[0]) || '(Unnamed LoRA)';
            listItems += `
                <div class="igs-modal-list-item${idx === selectedLoraIndex ? ' active' : ''}" data-index="${idx}">
                    <span>${esc(label)}</span>
                </div>
            `;
        });
    }

    // Editor panel
    let editorHtml = '';
    if (selectedLoraIndex >= 0 && selectedLoraIndex < entries.length) {
        const entry = entries[selectedLoraIndex];

        const triggerTags = (entry.triggers || []).map(t => `
            <span class="igs-trigger-tag" data-tag="${esc(t)}">
                <span>${esc(t)}</span>
                <i class="fa-solid fa-xmark igs-tag-remove igs-m-lora-trigger-remove"></i>
            </span>
        `).join('');

        editorHtml = `
            <div class="igs-modal-editor-content">
                <div class="igs-modal-field">
                    <label class="igs-toggle-row">
                        <input type="checkbox" class="checkbox igs-m-lora-enabled" ${entry.enabled ? 'checked' : ''}>
                        <span>Enabled</span>
                    </label>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Description</label>
                    <input type="text" class="text_pole igs-m-lora-desc" value="${esc(entry.description || '')}"
                        placeholder="e.g. detailed cybernetic arm">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Prompt / Content</label>
                    <textarea class="text_pole igs-m-lora-prompt" rows="3"
                        placeholder="e.g. <lora:cyber_arm:1.0>, cybernetic details">${esc(entry.prompt || '')}</textarea>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-toggle-row">
                        <input type="checkbox" class="checkbox igs-m-lora-casesensitive" ${entry.caseSensitive ? 'checked' : ''}>
                        <span>Case Sensitive</span>
                    </label>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label">Trigger Words</label>
                    <div class="igs-trigger-tags">
                        ${triggerTags}
                    </div>
                    <div class="igs-trigger-input-container">
                        <input type="text" class="text_pole igs-m-lora-new-trigger" placeholder="Add trigger word...">
                        <div class="menu_button igs-m-lora-add-trigger">Add</div>
                    </div>
                </div>
                <div class="igs-modal-field" style="margin-top: 12px;">
                    <div class="menu_button menu_button_icon igs-m-lora-delete" title="Delete LoRA" style="color: #f44336;">
                        <i class="fa-solid fa-trash-can"></i>
                        <span>Delete LoRA</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        editorHtml = '<div class="igs-modal-editor-placeholder">Select a LoRA from the list to edit.</div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup('LoRA collection', `
            <div class="igs-profile-bar">
                <select id="igs_m_lora_profile_select" class="text_pole">${loraProfileOptions}</select>
                <div class="igs-profile-actions">
                    <div class="menu_button" id="igs_m_lora_profile_add" title="Add LoRA Profile"><i class="fa-solid fa-plus"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_duplicate" title="Duplicate"><i class="fa-solid fa-copy"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_rename" title="Rename"><i class="fa-solid fa-pencil"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_delete" title="Delete"><i class="fa-solid fa-trash-can"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_export" title="Export"><i class="fa-solid fa-file-export"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_import" title="Import"><i class="fa-solid fa-file-import"></i></div>
                </div>
                <input type="file" id="igs_m_lora_profile_import_file" accept=".json" style="display:none;">
            </div>
            `, 'Choose a collection and manage its saved profiles.')}

            ${renderSettingsGroup('Scan behavior', `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_lora_depth">LoRA Scan Depth</label>
                <input type="number" id="igs_m_lora_depth" class="text_pole"
                    min="1" max="50" value="${profile.loras?.depth || 1}">
                <div class="igs-hint">Number of recent messages to scan for trigger words.</div>
            </div>
            `)}

            ${renderSettingsGroup('LoRAs in this collection', `
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header">LoRA list</div>
                    ${listItems}
                    <div class="menu_button menu_button_icon igs-m-lora-add" style="width:100%; margin-top: 6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span>Add LoRA</span>
                    </div>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header">LoRA details</div>
                    ${editorHtml}
                </div>
            </div>
            `, 'Select a LoRA to edit its trigger words and prompt content.')}
        </div>
    `;
}

function bindLorasTab() {
    const modal = $('#igs_settings_root');
    const profile = getActiveProfile();
    const settings = getSettings();

    // LoRA Scan Depth
    bindModalInput('igs_m_lora_depth', val => {
        if (!profile.loras) profile.loras = { depth: 1, entries: [] };
        profile.loras.depth = parseInt(val, 10) || 1;
    });

    // LoRA profile CRUD
    modal.on('change.igstab', '#igs_m_lora_profile_select', function () {
        profile.activeLoraProfileId = $(this).val();
        selectedLoraIndex = -1;
        saveProfiles();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_lora_profile_add', () => {
        const name = prompt('New LoRA profile name:', 'New LoRA Profile');
        if (!name) return;
        const lp = addLoraProfile(name);
        profile.activeLoraProfileId = lp.id;
        selectedLoraIndex = -1;
        saveProfiles();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_lora_profile_duplicate', () => {
        const id = profile.activeLoraProfileId;
        if (!id) return;
        const lp = duplicateLoraProfile(id);
        if (lp) {
            profile.activeLoraProfileId = lp.id;
            selectedLoraIndex = -1;
            saveProfiles();
            renderActiveTab();
        }
    });

    modal.on('click.igstab', '#igs_m_lora_profile_rename', () => {
        const id = profile.activeLoraProfileId;
        if (!id || !settings.loraProfiles?.[id]) return;
        const newName = prompt('Rename LoRA profile:', settings.loraProfiles[id].name);
        if (!newName) return;
        renameLoraProfile(id, newName);
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_lora_profile_delete', () => {
        const id = profile.activeLoraProfileId;
        if (!id) return;
        if (!confirm('Delete this LoRA profile?')) return;
        deleteLoraProfile(id);
        profile.activeLoraProfileId = Object.keys(settings.loraProfiles || {})[0] || '';
        selectedLoraIndex = -1;
        saveProfiles();
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_lora_profile_export', () => {
        const id = profile.activeLoraProfileId;
        if (id) exportLoraProfile(id);
    });

    modal.on('click.igstab', '#igs_m_lora_profile_import', () => {
        $('#igs_m_lora_profile_import_file').trigger('click');
    });

    modal.on('change.igstab', '#igs_m_lora_profile_import_file', function () {
        const file = this.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const lp = importLoraProfile(e.target.result);
            if (lp) {
                profile.activeLoraProfileId = lp.id;
                selectedLoraIndex = -1;
                saveProfiles();
                toastr.success(`Imported LoRA profile: ${lp.name}`);
                renderActiveTab();
            }
        };
        reader.readAsText(file);
        $(this).val('');
    });

    // LoRA list item selection
    modal.on('click.igstab', '.igs-modal-item-list .igs-modal-list-item', function () {
        if (activeTabId !== 'loras') return;
        selectedLoraIndex = parseInt($(this).data('index'), 10);
        renderActiveTab();
    });

    // Add LoRA
    modal.on('click.igstab', '.igs-m-lora-add', () => {
        const profileObj = getActiveProfile();
        addLoraEntry(profileObj.id);
        const entries = getActiveLoraEntries();
        selectedLoraIndex = entries.length - 1;
        renderActiveTab();
    });

    // LoRA enabled toggle
    modal.on('change.igstab', '.igs-m-lora-enabled', function () {
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        const entry = entries[selectedLoraIndex];
        toggleLoraEntry(getActiveProfile().id, entry.id);
        // Update the checkbox state to match
        $(this).prop('checked', entry.enabled);
    });

    // LoRA description
    modal.on('input.igstab', '.igs-m-lora-desc', function () {
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        const entry = entries[selectedLoraIndex];
        updateLoraEntry(getActiveProfile().id, entry.id, { description: $(this).val() });
        // Update list label
        const label = $(this).val() || (entry.triggers?.[0]) || '(Unnamed LoRA)';
        modal.find(`.igs-modal-list-item[data-index="${selectedLoraIndex}"] span`).text(label);
    });

    // LoRA prompt
    modal.on('input.igstab', '.igs-m-lora-prompt', function () {
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        updateLoraEntry(getActiveProfile().id, entries[selectedLoraIndex].id, { prompt: $(this).val() });
    });

    // LoRA case sensitive
    modal.on('change.igstab', '.igs-m-lora-casesensitive', function () {
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        updateLoraEntry(getActiveProfile().id, entries[selectedLoraIndex].id, { caseSensitive: $(this).prop('checked') });
    });

    // Add trigger
    modal.on('click.igstab', '.igs-m-lora-add-trigger', () => {
        const input = modal.find('.igs-m-lora-new-trigger');
        const word = input.val()?.trim();
        if (!word) return;
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        const entry = entries[selectedLoraIndex];
        const triggers = [...(entry.triggers || []), word];
        updateLoraEntry(getActiveProfile().id, entry.id, { triggers });
        input.val('');
        renderActiveTab();
    });

    // Remove trigger
    modal.on('click.igstab', '.igs-m-lora-trigger-remove', function () {
        const tag = $(this).closest('.igs-trigger-tag').data('tag');
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        const entry = entries[selectedLoraIndex];
        const triggers = (entry.triggers || []).filter(t => t !== tag);
        updateLoraEntry(getActiveProfile().id, entry.id, { triggers });
        renderActiveTab();
    });

    // Delete LoRA
    modal.on('click.igstab', '.igs-m-lora-delete', () => {
        const entries = getActiveLoraEntries();
        if (selectedLoraIndex < 0 || selectedLoraIndex >= entries.length) return;
        const entry = entries[selectedLoraIndex];
        if (!confirm('Delete this LoRA entry?')) return;
        deleteLoraEntry(getActiveProfile().id, entry.id);
        selectedLoraIndex = -1;
        renderActiveTab();
    });
}

// ============================================================
// Tab Rendering Dispatcher
// ============================================================

/** Map of tab IDs to their render/bind function pairs */
const TAB_RENDERERS = {
    'suite-hub': { render: renderSuiteHubTab, bind: bindSuiteHubTab },
    'prompt-injection': { render: renderPromptInjectionTab, bind: bindPromptInjectionTab },
    'detection-settings': { render: renderDetectionSettingsTab, bind: bindDetectionSettingsTab },
    'connection': { render: renderConnectionTab, bind: bindConnectionTab },
    'prompt-construction': { render: renderPromptConstructionTab, bind: bindPromptConstructionTab },
    'styles': { render: renderStylesTab, bind: bindStylesTab },
    'characters': { render: renderCharactersTab, bind: bindCharactersTab },
    'loras': { render: renderLorasTab, bind: bindLorasTab },
};

/**
 * Renders the currently active tab into the inline content area.
 * Unbinds old delegated events and binds new ones for the active tab.
 */
function renderActiveTab() {
    const content = $('#igs_modal_content');
    const modal = $('#igs_settings_root');
    if (!content.length) return;

    // Unbind tab-content handlers before rebinding.
    // This prevents duplicate handlers accumulating on tab re-render.
    // Navigation handlers use a separate event namespace on the root.
    modal.off('click.igstab change.igstab input.igstab');

    const entry = TAB_RENDERERS[activeTabId];
    if (!entry) {
        content.html('<div class="igs-modal-section"><h3>Unknown Tab</h3></div>');
        return;
    }

    const tab = TABS.find(item => item.id === activeTabId);
    content.html(`
        <header class="igs-settings-category-header">
            <div class="igs-settings-category-icon"><i class="fa-solid ${tab.icon}" aria-hidden="true"></i></div>
            <div><h2>${tab.label}</h2><p>${tab.description}</p></div>
        </header>
        ${entry.render()}
    `);
    entry.bind();

    if (activeTabId === 'suite-hub') {
        modalCallbacks?.populateFloatingStyleSelect?.();
        modalCallbacks?.populateFloatingCharacterSelect?.();
        modalCallbacks?.updateFloatingWindow?.();
    }

    // Keep the category tags accessible to keyboard and assistive technology.
    modal.find('.igs-modal-tab-btn')
        .removeClass('active')
        .attr('aria-selected', 'false')
        .attr('tabindex', '-1');
    const activeTab = modal.find(`.igs-modal-tab-btn[data-tab="${activeTabId}"]`);
    activeTab.addClass('active').attr('aria-selected', 'true').attr('tabindex', '0');
    content.attr('aria-labelledby', activeTab.attr('id'));
}

// ============================================================
// Public API
// ============================================================

/**
 * Mounts the inline settings panel and optionally selects a tab.
 *
 * @param {object} callbacks - Callback functions provided by the caller.
 * @param {Function} callbacks.onProfileSwitch - Called when the active profile changes.
 * @param {Function} callbacks.updateFloatingWindow - Called to refresh inline quick controls.
 * @param {Function} callbacks.populateFloatingStyleSelect - Called to refresh the quick style selector.
 * @param {Function} callbacks.populateFloatingCharacterSelect - Called to refresh the quick character selector.
 */
export function openSettingsModal(callbacks, requestedTabId = 'suite-hub') {
    modalCallbacks = callbacks || modalCallbacks || {};
    if (!$('#igs_settings_root').length) {
        const mount = $('#igs_settings_panel');
        if (!mount.length) return;
        mount.empty().append(buildModalShell());
        activeTabId = TAB_RENDERERS[requestedTabId] ? requestedTabId : 'suite-hub';
        selectedStyleIndex = -1;
        selectedCharIndex = -1;
        selectedLoraIndex = -1;
        selectedMacroIndex = -1;
        renderActiveTab();

        const root = $('#igs_settings_root');
        root.on('click.igsmodal', '.igs-modal-tab-btn', function () {
            setActiveTab($(this).data('tab'));
        });
        root.on('keydown.igsmodal', '.igs-modal-tab-btn', function (event) {
            const tabs = TABS.map(tab => tab.id);
            const currentIndex = tabs.indexOf($(this).data('tab'));
            let nextIndex = currentIndex;

            if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
            else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = tabs.length - 1;
            else return;

            event.preventDefault();
            const nextTabId = tabs[nextIndex];
            setActiveTab(nextTabId);
            root.find(`.igs-modal-tab-btn[data-tab="${nextTabId}"]`).trigger('focus');
        });
        return;
    }

    if (requestedTabId && requestedTabId !== activeTabId && TAB_RENDERERS[requestedTabId]) {
        setActiveTab(requestedTabId);
    }
}

function setActiveTab(tabId) {
    if (!TAB_RENDERERS[tabId] || tabId === activeTabId) return;
    if (activeTabId === 'styles') selectedStyleIndex = -1;
    if (activeTabId === 'characters') selectedCharIndex = -1;
    if (activeTabId === 'loras') selectedLoraIndex = -1;
    if (activeTabId === 'prompt-injection') selectedMacroIndex = -1;
    activeTabId = tabId;
    renderActiveTab();
}

/**
 * Compatibility no-op; the settings panel remains mounted in the extension drawer.
 */
export function closeSettingsModal() {
    // Kept as a no-op for extension compatibility; settings remain mounted inline.
}

/**
 * Re-renders the currently active tab content.
 * Useful after an external profile switch or data change.
 */
export function refreshModalUI() {
    if (!$('#igs_settings_root').length) return;
    selectedStyleIndex = -1;
    selectedCharIndex = -1;
    selectedLoraIndex = -1;
    selectedMacroIndex = -1;
    renderActiveTab();
}
