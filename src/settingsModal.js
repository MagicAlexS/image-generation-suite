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
    renameWorkflow,
    getConnectionMode,
    setConnectionMode,
    getTavernSummary,
    readTavernConnection,
    WORKFLOW_VARIABLES,
    inspectWorkflow
} from './connection.js';

import {
    addLoraEntry,
    deleteLoraEntry,
    updateLoraEntry,
    toggleLoraEntry
} from './lora.js';

import { discoverConnectionProfiles } from './lora_agent.js';
import { tr, localizeHtml } from './i18n.js';
import {
    DEFAULT_CHARACTER_PROMPT,
    PROMPT_PRESETS,
    getPromptPreset,
    applyPromptPreset,
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
    { id: 'suite-hub', label: 'Quick Controls', labelKey: 'igs.modal.tab.quickControls', icon: 'fa-sliders', description: 'Choose the scene references and prompt additions used for the next image.', descriptionKey: 'igs.modal.tab.quickControls.description' },
    { id: 'prompt-injection', label: 'Prompt Injection', labelKey: 'igs.modal.tab.promptInjection', icon: 'fa-wand-magic-sparkles', description: 'Control how image instructions and reusable macros enter the conversation.', descriptionKey: 'igs.modal.tab.promptInjection.description' },
    { id: 'detection-settings', label: 'Detection', labelKey: 'igs.modal.tab.detection', icon: 'fa-magnifying-glass', description: 'Choose how image requests are detected and inserted into chat.', descriptionKey: 'igs.modal.tab.detection.description' },
    { id: 'connection', label: 'Connection', labelKey: 'igs.modal.tab.connection', icon: 'fa-plug', description: 'Connect an image backend and choose generation settings and workflows.', descriptionKey: 'igs.modal.tab.connection.description' },
    { id: 'prompt-construction', label: 'Prompt Construction', labelKey: 'igs.modal.tab.promptConstruction', icon: 'fa-shapes', description: 'Build the positive and negative prompts sent to the image backend.', descriptionKey: 'igs.modal.tab.promptConstruction.description' },
    { id: 'styles', label: 'Styles', labelKey: 'igs.modal.tab.styles', icon: 'fa-palette', description: 'Organize style collections and edit their prompts and previews.', descriptionKey: 'igs.modal.tab.styles.description' },
    { id: 'characters', label: 'Characters', labelKey: 'igs.modal.tab.characters', icon: 'fa-users', description: 'Organize character references and optional outfit descriptions.', descriptionKey: 'igs.modal.tab.characters.description' },
    { id: 'loras', label: 'LoRAs', labelKey: 'igs.modal.tab.loras', icon: 'fa-sliders', description: 'Manage LoRA trigger words, prompt content, and scan depth.', descriptionKey: 'igs.modal.tab.loras.description' },
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
    if (str === null || str === undefined) return '';
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
        const emptyLabel = selectId === 'igs_m_model'
            ? tr('igs.connectionUi.chooseModel', 'Choose a model')
            : tr('igs.connectionUi.serverDefault', 'Server default');
        select.append($('<option>', { value: '', text: emptyLabel }));
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
            <span>${tr(tab.labelKey, tab.label)}</span>
        </button>
    `).join('');

    return `
        <div class="igs-settings-panel" id="igs_settings_root">
            <div class="igs-settings-nav">
                <div class="igs-modal-sidebar" role="tablist" aria-label="Settings categories" data-i18n="[aria-label]igs.modal.attr.settings-categories">
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
            ${renderSettingsGroup(tr('igs.modal.group.sceneControls', 'Scene controls'), `
            <div class="igs-quick-control-grid">
                <div class="igs-modal-field">
                    <label for="igs_hub_character_select"><span data-i18n="igs.modal.text.character">Character</span></label>
                    <select id="igs_hub_character_select" class="text_pole"><option value="" data-i18n="igs.modal.text.none">(None)</option></select>
                </div>
                <div class="igs-modal-field">
                    <label for="igs_hub_prompt_extra"><span data-i18n="igs.modal.text.prompt-addition">Prompt Addition</span></label>
                    <input type="text" id="igs_hub_prompt_extra" class="text_pole" placeholder="Extra positive prompt..." data-i18n="[placeholder]igs.modal.attr.extra-positive-prompt" value="${esc(profile?.hub?.promptExtra || '')}">
                </div>
                <div class="igs-modal-field">
                    <label for="igs_hub_negative_extra"><span data-i18n="igs.modal.text.negative-addition">Negative Addition</span></label>
                    <input type="text" id="igs_hub_negative_extra" class="text_pole" placeholder="Extra negative prompt..." data-i18n="[placeholder]igs.modal.attr.extra-negative-prompt" value="${esc(profile?.hub?.negativeExtra || '')}">
                </div>
                <div class="igs-modal-field">
                    <label><span data-i18n="igs.modal.text.style">Style</span></label>
                    <div id="igs_custom_style_select" class="igs-custom-select">
                        <div class="igs-custom-select-trigger"><span><span data-i18n="igs.modal.text.default-no-style">Default (No Style)</span></span><i class="fa-solid fa-chevron-down"></i></div>
                        <div class="igs-custom-select-options"></div>
                    </div>
                </div>
            </div>
            <div class="igs-quick-preview" id="igs_window_preview_container" style="display:none;">
                <div class="igs-window-preview-img-wrapper"><img id="igs_window_preview_img" class="igs-window-preview-img" src="" alt="Style preview" data-i18n="[alt]igs.modal.attr.style-preview"></div>
                <div id="igs_window_desc" class="igs-window-desc"></div>
            </div>
            `, tr('igs.modal.description.sceneControls', 'Set the character, style, and prompt additions for this image.'))}
            ${renderSettingsGroup(tr('igs.modal.group.macroValues', 'Macro values'), `
            <div class="igs-quick-macros">
                <div id="igs_hub_macros_container" class="igs-hub-macros"></div>
            </div>
            `, tr('igs.modal.description.macroValues', 'Adjust values for custom macros used by the prompt template.'))}
            ${renderSettingsGroup(tr('igs.modal.group.actions', 'Actions'), `
            <div class="igs-quick-actions">
                <button id="igs_hub_retrigger" class="menu_button"><i class="fa-solid fa-arrows-rotate"></i> <span data-i18n="igs.modal.text.re-trigger-image-generation">Re-trigger Image Generation</span></button>
            </div>
            `)}
        </div>
        <div class="igs-modal-section igs-modal-section-settings">
            ${renderSettingsGroup(tr('igs.modal.group.preview', 'Preview'), `
            <div class="igs-modal-field">
                <label class="igs-toggle-row" for="igs_m_hub_show_previews">
                    <input type="checkbox" id="igs_m_hub_show_previews" class="checkbox"
                        ${settings.style_show_previews ? 'checked' : ''}>
                    <span><span data-i18n="igs.modal.text.preview-image-style">Preview Image Style</span></span>
                </label>
                <div class="igs-hint"><span data-i18n="igs.modal.text.show-the-active-style-preview-in-quick-controls">Show the active style preview in Quick Controls.</span></div>
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

function getPresetLabel(id) {
    if (id === 'natural') return tr('igs.promptPreset.natural', PROMPT_PRESETS.natural.label);
    if (id === 'tags') return tr('igs.promptPreset.tags', PROMPT_PRESETS.tags.label);
    return tr('igs.promptPreset.custom', 'Custom');
}

function renderPromptInjectionTab() {
    const profile = getActiveProfile();
    const currentPreset = getPromptPreset(profile);
    const selectedPreset = currentPreset || 'natural';
    const backup = profile.promptEngineeringBackup;
    const canRestore = typeof backup?.template === 'string'
        && typeof backup?.characterDefining === 'string';
    const macros = profile.customMacros || [];

    // Build the macro list items
    let macroListHtml = '';
    macros.forEach((macro, i) => {
        const isActive = i === selectedMacroIndex;
        const typeBadge = `<span class="igs-macro-type-badge igs-macro-type-${macro.type}">${tr(`igs.modal.macroType.${macro.type}`, macro.type.toUpperCase())}</span>`;
        macroListHtml += `<div class="igs-modal-list-item igs-m-macro-item ${isActive ? 'active' : ''}" data-index="${i}">
            <span>${macro.id || tr('igs.modal.value.unnamed', '(unnamed)')}</span>
            ${typeBadge}
        </div>`;
    });
    if (macros.length === 0) {
        macroListHtml = '<div class="igs-modal-empty-msg"><span data-i18n="igs.modal.text.no-custom-macros-yet-add-one-to-create-a-reusable-prompt-value">No custom macros yet. Add one to create a reusable prompt value.</span></div>';
    }

    // Build the macro editor (right panel)
    let macroEditorHtml = '';
    if (selectedMacroIndex >= 0 && selectedMacroIndex < macros.length) {
        const macro = macros[selectedMacroIndex];
        macroEditorHtml = renderMacroEditor(macro, selectedMacroIndex);
    } else {
        macroEditorHtml = '<div class="igs-modal-empty-editor"><span data-i18n="igs.modal.text.select-a-macro-to-edit-or-add-a-new-one">Select a macro to edit, or add a new one.</span></div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup(tr('igs.modal.group.promptBehavior', 'Prompt behavior'), `
            <div class="igs-modal-field">
                <label class="igs-toggle-row" for="igs_m_prompt_enabled">
                    <input type="checkbox" id="igs_m_prompt_enabled" class="checkbox"
                        ${profile.prompt.enabled ? 'checked' : ''}>
                    <span><span data-i18n="igs.modal.text.enable-prompt-injection">Enable Prompt Injection</span></span>
                </label>
                <div class="igs-hint"><span data-i18n="igs.modal.text.when-enabled-the-prompt-template-is-injected-into-the-conversation-at-the-configured-frequ">When enabled, the prompt template is injected into the conversation at the configured frequency.</span></div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_frequency"><span data-i18n="igs.modal.text.injection-frequency">Injection Frequency</span></label>
                <input type="number" id="igs_m_prompt_frequency" class="text_pole"
                    min="1" max="100" value="${profile.prompt.frequency || 1}">
                <div class="igs-hint"><span data-i18n="igs.modal.text.generate-an-image-every-n-messages">Generate an image every N messages.</span></div>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label"><span data-i18n="igs.modal.text.position-depth">Position &amp; Depth</span></label>
                <div class="igs-inline-group">
                    <select id="igs_m_prompt_position" class="text_pole">
                        <option value="deep_system" ${profile.prompt.position === 'deep_system' ? 'selected' : ''} data-i18n="igs.modal.text.system-deep">System (deep)</option>
                        <option value="deep_user" ${profile.prompt.position === 'deep_user' ? 'selected' : ''} data-i18n="igs.modal.text.user-deep">User (deep)</option>
                        <option value="deep_assistant" ${profile.prompt.position === 'deep_assistant' ? 'selected' : ''} data-i18n="igs.modal.text.assistant-deep">Assistant (deep)</option>
                    </select>
                    <input type="number" id="igs_m_prompt_depth" class="text_pole"
                        min="0" max="100" value="${profile.prompt.depth || 0}" style="width: 70px;">
                </div>
                <div class="igs-hint"><span data-i18n="igs.modal.text.where-in-the-conversation-history-the-injection-is-placed">Where in the conversation history the injection is placed.</span></div>
            </div>
            `, tr('igs.modal.description.promptBehavior', 'Choose when and where image instructions enter the conversation.'))}

            ${renderSettingsGroup(tr('igs.modal.group.promptTemplate', 'Prompt template'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_preset" data-i18n="igs.promptPreset.format">Image Description Format</label>
                <select id="igs_m_prompt_preset" class="text_pole">
                    ${Object.keys(PROMPT_PRESETS).map(id => `<option value="${esc(id)}" ${selectedPreset === id ? 'selected' : ''}>${esc(getPresetLabel(id))}</option>`).join('')}
                </select>
                <div id="igs_m_prompt_preset_status" class="igs-hint" role="status">${esc(tr('igs.promptPreset.current', 'Current prompts: {format}.', { format: getPresetLabel(currentPreset) }))}</div>
                <div class="igs-hint" data-i18n="igs.promptPreset.formatHelp">Natural language uses complete sentences; tags use comma-separated English keywords. Both preserve known character names and works, along with the current scene and story changes.</div>
                <div class="igs-inline-group" style="flex-wrap: wrap;">
                    <button type="button" id="igs_m_use_scene_defaults" class="menu_button" ${currentPreset === selectedPreset ? 'disabled' : ''} data-i18n="igs.promptPreset.apply">Apply Preset</button>
                    ${canRestore ? '<button type="button" id="igs_m_restore_prompts" class="menu_button" data-i18n="igs.modal.text.restore-previous-prompts">Restore Previous Prompts</button>' : ''}
                </div>
                <div class="igs-hint" data-i18n="igs.promptPreset.applyHelp">Apply replaces both prompt fields below. Your first previous version is saved for Restore Previous Prompts, even after switching presets. You can edit either field after applying.</div>
                <div class="igs-hint" data-i18n="igs.promptPreset.wordCountHelp">Word-count macros set the length target for natural language. Tags use the same scene coverage without padding to a word count. Other macro values and settings stay as configured.</div>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_template"><span data-i18n="igs.modal.text.prompt-template">Prompt Template</span></label>
                <textarea id="igs_m_prompt_template" class="text_pole" rows="4">${esc(profile.prompt.template)}</textarea>
                <div class="igs-hint"><span data-i18n="igs.modal.text.the-injection-prompt-sent-to-the-llm-use-macroid-to-insert-custom-macro-values">The injection prompt sent to the LLM. Use {macroId} to insert custom macro values.</span></div>
            </div>
            `, tr('igs.promptPreset.description', 'Choose and apply a format preset, or edit the instructions sent to the language model.'))}

            ${renderSettingsGroup(tr('igs.modal.group.characterReference', 'Character reference'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_character_defining"><span data-i18n="igs.modal.text.character-defining-prompt">Character Defining Prompt</span></label>
                <textarea id="igs_m_character_defining" class="text_pole" rows="4"
                    placeholder="${esc(DEFAULT_CHARACTER_PROMPT)}">${esc(profile.promptConstruction.characterDefining || '')}</textarea>
                <div class="igs-hint"><span data-i18n="igs.modal.text.appended-for-the-manually-selected-character-use-charactername-character-and-outfits-backg">Appended for the manually selected character. Use {characterName}, {character}, and {outfits}. Background and outfit references do not override current story changes.</span></div>
            </div>
            `)}
        </div>

        <div class="igs-modal-divider"></div>

        <div class="igs-modal-section">
            ${renderSettingsGroup(tr('igs.modal.group.customMacroEditor', 'Custom macro editor'), `
            <div class="igs-hint" style="margin-bottom: 8px;"><span data-i18n="igs.modal.text.define-macros-to-use-as">Define macros to use as</span> <code><span data-i18n="igs.modal.text.macroid">{macroId}</span></code> <span data-i18n="igs.modal.text.placeholders-in-your-prompt-template-control-their-values-from-quick-controls">placeholders in your prompt template. Control their values from Quick Controls.</span></div>
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.macro-list">Macro list</span></div>
                    ${macroListHtml}
                    <button class="igs-m-macro-add menu_button"><span data-i18n="igs.modal.text.add-macro">+ Add Macro</span></button>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.macro-details">Macro details</span></div>
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
                            <input type="text" class="text_pole igs-m-macro-option-label" value="${esc(label)}" placeholder="Label (short name)" data-i18n="[placeholder]igs.modal.attr.label-short-name">
                            <textarea class="text_pole igs-m-macro-option-text" rows="2" placeholder="Substitution text..." data-i18n="[placeholder]igs.modal.attr.substitution-text">${esc(text)}</textarea>
                        </div>
                        <button class="igs-m-macro-option-delete menu_button" title="Delete option" data-i18n="[title]igs.modal.attr.delete-option"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
            });
            typeFields = `
                <label class="igs-field-label"><span data-i18n="igs.modal.text.options">Options</span></label>
                <div class="igs-hint" style="margin-bottom: 4px;"><span data-i18n="igs.modal.text.each-option-has-a-short-label-shown-in-dropdowns-and-the-full-text-that-gets-substituted">Each option has a short label (shown in dropdowns) and the full text that gets substituted.</span></div>
                <div class="igs-macro-options-list">${optionsHtml}</div>
                <button class="igs-m-macro-option-add menu_button" style="margin-top: 4px;"><span data-i18n="igs.modal.text.add-option">+ Add Option</span></button>`;
            break;
        }
        case 'bool':
            typeFields = `
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.text-when-enabled">Text When Enabled</span></label>
                    <textarea class="text_pole igs-m-macro-bool-text" rows="2">${esc(macro.text || '')}</textarea>
                    <div class="igs-hint"><span>${esc(tr('igs.modal.macro.boolHint', 'This text replaces {id} when ON. When OFF, nothing is inserted.', { id: `{${macro.id}}` }))}</span></div>
                </div>`;
            break;
        case 'int':
            typeFields = `
                <div class="igs-inline-group" style="gap: 8px;">
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label"><span data-i18n="igs.modal.text.min">Min</span></label>
                        <input type="number" class="text_pole igs-m-macro-min" value="${macro.min ?? 0}">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label"><span data-i18n="igs.modal.text.max">Max</span></label>
                        <input type="number" class="text_pole igs-m-macro-max" value="${macro.max ?? 100}">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label"><span data-i18n="igs.modal.text.step">Step</span></label>
                        <input type="number" class="text_pole igs-m-macro-step" value="${macro.step ?? 1}" min="1">
                    </div>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.current-value">Current Value</span></label>
                    <input type="number" class="text_pole igs-m-macro-value" value="${macro.value ?? 0}"
                        min="${macro.min ?? 0}" max="${macro.max ?? 100}" step="${macro.step ?? 1}">
                </div>`;
            break;
        case 'float':
            typeFields = `
                <div class="igs-inline-group" style="gap: 8px;">
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label"><span data-i18n="igs.modal.text.min">Min</span></label>
                        <input type="number" class="text_pole igs-m-macro-min" value="${macro.min ?? 0}" step="any">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label"><span data-i18n="igs.modal.text.max">Max</span></label>
                        <input type="number" class="text_pole igs-m-macro-max" value="${macro.max ?? 1}" step="any">
                    </div>
                    <div class="igs-modal-field" style="flex:1">
                        <label class="igs-field-label"><span data-i18n="igs.modal.text.step">Step</span></label>
                        <input type="number" class="text_pole igs-m-macro-step" value="${macro.step ?? 0.1}" step="any" min="0.001">
                    </div>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.current-value">Current Value</span></label>
                    <input type="number" class="text_pole igs-m-macro-value" value="${macro.value ?? 0}"
                        min="${macro.min ?? 0}" max="${macro.max ?? 1}" step="${macro.step ?? 0.1}">
                </div>`;
            break;
    }

    return `
        <div class="igs-modal-field">
            <label class="igs-field-label"><span data-i18n="igs.modal.text.macro-id">Macro ID</span></label>
            <input type="text" class="text_pole igs-m-macro-id" value="${esc(macro.id || '')}"
                placeholder="e.g. perspective" data-i18n="[placeholder]igs.modal.attr.e-g-perspective" pattern="[a-z0-9_]+"
                title="Lowercase letters, numbers, and underscores only" data-i18n="[title]igs.modal.attr.lowercase-letters-numbers-and-underscores-only">
            <div class="igs-hint"><span>${esc(tr('igs.modal.macro.idHint', 'Used as {id} in the prompt template.', { id: `{${macro.id || 'macroId'}}` }))}</span></div>
        </div>
        <div class="igs-modal-field">
            <label class="igs-field-label"><span data-i18n="igs.modal.text.type">Type</span></label>
            <select class="text_pole igs-m-macro-type">
                <option value="list" ${macro.type === 'list' ? 'selected' : ''} data-i18n="igs.modal.text.list">List</option>
                <option value="bool" ${macro.type === 'bool' ? 'selected' : ''} data-i18n="igs.modal.text.bool">Bool</option>
                <option value="int" ${macro.type === 'int' ? 'selected' : ''} data-i18n="igs.modal.text.int">Int</option>
                <option value="float" ${macro.type === 'float' ? 'selected' : ''} data-i18n="igs.modal.text.float">Float</option>
            </select>
        </div>
        ${typeFields}
        <div class="igs-modal-divider"></div>
        <button class="igs-m-macro-delete menu_button" style="color: #f44336;">
            <i class="fa-solid fa-trash"></i> <span data-i18n="igs.modal.text.delete-macro">Delete Macro</span>
        </button>
    `;
}

/**
 * Validates a macro ID for format, reserved words, and uniqueness.
 * @returns {string|null} Error message, or null if valid.
 */
function validateMacroId(id, currentIndex) {
    if (!id || id.trim() === '') return tr('igs.modal.validation.emptyMacro', 'Macro ID cannot be empty.');
    if (!/^[a-z0-9_]+$/.test(id)) return tr('igs.modal.validation.invalidMacro', 'Macro ID must be lowercase letters, numbers, and underscores only.');
    if (RESERVED_MACRO_IDS.has(id)) return tr('igs.modal.validation.reservedMacro', '"{name}" is a reserved macro name and cannot be used.', { name: id });
    const profile = getActiveProfile();
    const duplicate = (profile.customMacros || []).findIndex((m, i) => i !== currentIndex && m.id === id);
    if (duplicate >= 0) return tr('igs.modal.validation.duplicateMacro', 'A macro with ID "{name}" already exists.', { name: id });
    return null;
}

function bindPromptInjectionTab() {
    const modal = $('#igs_settings_root');
    const profile = getActiveProfile();
    const updatePresetControls = () => {
        const currentPreset = getPromptPreset(profile);
        modal.find('#igs_m_use_scene_defaults').prop('disabled',
            currentPreset === modal.find('#igs_m_prompt_preset').val());
        modal.find('#igs_m_prompt_preset_status').text(
            tr('igs.promptPreset.current', 'Current prompts: {format}.', { format: getPresetLabel(currentPreset) }));
    };

    // Standard prompt injection field bindings
    bindModalInput('igs_m_prompt_enabled', val => { profile.prompt.enabled = val; }, true);
    bindModalInput('igs_m_prompt_frequency', val => {
        profile.prompt.frequency = parseInt(val, 10) || 1;
        profile.prompt.messageCounter = 0;
    });
    bindModalInput('igs_m_prompt_template', val => {
        profile.prompt.template = val;
        updatePresetControls();
    });
    bindModalInput('igs_m_prompt_position', val => { profile.prompt.position = val; });
    bindModalInput('igs_m_prompt_depth', val => { profile.prompt.depth = parseInt(val, 10) || 0; });
    bindModalInput('igs_m_character_defining', val => {
        profile.promptConstruction.characterDefining = val;
        updatePresetControls();
    });

    modal.on('change.igstab', '#igs_m_prompt_preset', updatePresetControls);
    modal.on('click.igstab', '#igs_m_use_scene_defaults', () => {
        if (!applyPromptPreset(profile, modal.find('#igs_m_prompt_preset').val())) return;
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
        if (!confirm(tr('igs.modal.confirm.deleteMacro', 'Delete macro "{name}"?', { name: macro.id }))) return;
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
            ${renderSettingsGroup(tr('igs.modal.group.extraction', 'Extraction'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_regex"><span data-i18n="igs.modal.text.regex-pattern">Regex Pattern</span></label>
                <input type="text" id="igs_m_regex" class="text_pole"
                    value="${esc(profile.settings.regex)}">
                <div class="igs-hint"><span data-i18n="igs.modal.text.the-regex-pattern-used-to-detect-image-generation-tags-in-llm-output">The regex pattern used to detect image generation tags in LLM output.</span></div>
            </div>
            `, tr('igs.modal.description.extraction', 'Control how image-generation tags are recognized in model output.'))}

            ${renderSettingsGroup(tr('igs.modal.group.insertion', 'Insertion'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_insert_type"><span data-i18n="igs.modal.text.insert-type">Insert Type</span></label>
                <select id="igs_m_insert_type" class="text_pole">
                    <option value="new_message" ${profile.settings.insertType === 'new_message' ? 'selected' : ''} data-i18n="igs.modal.text.new-message">New Message</option>
                    <option value="in_message" ${profile.settings.insertType === 'in_message' ? 'selected' : ''} data-i18n="igs.modal.text.in-message">In Message</option>
                </select>
                <div class="igs-hint"><span data-i18n="igs.modal.text.how-the-generated-image-is-inserted-into-the-chat">How the generated image is inserted into the chat.</span></div>
            </div>
            <div class="igs-modal-field">
                <label class="igs-toggle-row" for="igs_m_hide_from_llm">
                    <input type="checkbox" id="igs_m_hide_from_llm" class="checkbox"
                        ${profile.settings.hideFromLLM ? 'checked' : ''}>
                    <span><span data-i18n="igs.modal.text.hide-from-llm">Hide from LLM</span></span>
                </label>
                <div class="igs-hint"><span data-i18n="igs.modal.text.when-enabled-generated-image-messages-are-hidden-from-the-llm-context">When enabled, generated image messages are hidden from the LLM context.</span></div>
            </div>
            `, tr('igs.modal.description.insertion', 'Choose where the generated image appears in the conversation.'))}
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
    return renderConnectionUi();
}

/**
 * Connects to the active backend, validates connection,
 * and populates resource selects (models, vaes, samplers, etc.) in the Connection tab.
 *
 * @param {'comfy'|'auto'} type - The backend type.
 */
async function handleModalConnect(type) {
    let requestProfileId;
    let requestMode;
    let requestIsCurrent = () => false;
    try {
        const profile = getActiveProfile();
        requestProfileId = profile?.id;
        requestMode = getConnectionMode(profile?.connection || {});
        if (!profile || requestMode !== type) return;
        const requestMount = document.querySelector('.igs-connection-ui');
        const url = type === 'comfy' ? profile.connection.comfyUrl : profile.connection.autoUrl;
        const auth = type === 'auto' ? profile.connection.autoAuth : '';
        requestIsCurrent = () => {
            const active = getActiveProfile();
            return requestMount?.isConnected && active?.id === requestProfileId && active.connection === profile.connection &&
                getConnectionMode(active.connection) === requestMode &&
                (type === 'comfy' ? active.connection.comfyUrl : active.connection.autoUrl) === url &&
                (type !== 'auto' || active.connection.autoAuth === auth);
        };

        const statusDot = $('#igs_m_connection_status .igs-status-dot');
        const statusText = $('#igs_m_connection_status span').last();
        statusDot.removeClass('connected disconnected').addClass('connecting');
        statusText.text(tr('igs.modal.connection.connecting', 'Connecting...'));

        const success = await testConnection(type, url, auth);
        if (!requestIsCurrent()) return;

        if (success) {
            statusDot.removeClass('connecting').addClass('connected');
            statusText.text(tr('igs.modal.connection.connected', 'Connected'));

            toastr.info(tr('igs.modal.connection.loadingResources', 'Loading models and resources...'));
            const [models, vaes, samplers, schedulers] = await Promise.all([
                loadModels(type, url, auth),
                loadVaes(type, url, auth),
                loadSamplers(type, url, auth),
                loadSchedulers(type, url, auth)
            ]);
            if (!requestIsCurrent()) return;

            populateModalSelect('igs_m_model', models, profile.connection.model);
            populateModalSelect('igs_m_vae', vaes, profile.connection.vae);
            populateModalSelect('igs_m_sampler', samplers, profile.connection.sampler);
            populateModalSelect('igs_m_scheduler', schedulers, profile.connection.scheduler);

            toastr.success(tr('igs.modal.connection.resourcesLoaded', 'Resources loaded!'));
        } else {
            statusDot.removeClass('connecting').addClass('disconnected');
            statusText.text(tr('igs.modal.connection.failed', 'Failed'));
        }
    } catch (err) {
        if (!requestIsCurrent()) return;
        console.error('[IGS] Connection error:', err);
        toastr.error(tr('igs.modal.connection.failedWithError', 'Connection failed: {error}', { error: err.message }));

        const statusDot = $('#igs_m_connection_status .igs-status-dot');
        const statusText = $('#igs_m_connection_status span').last();
        statusDot.removeClass('connecting').addClass('disconnected');
        statusText.text(tr('igs.modal.connection.failed', 'Failed'));
    }
}

function bindConnectionTab() {
    bindConnectionUi();
}

function renderVariableRows(variables = []) {
    const variableNameLabel = tr('igs.connectionUi.variableName', 'Variable name');
    const variableTypeLabel = tr('igs.connectionUi.variableType', 'Variable type');
    const variableValueLabel = tr('igs.connectionUi.variableValue', 'Variable value');
    return variables.map((variable, index) => {
        const valueControl = variable.type === 'boolean'
            ? `<select class="text_pole igs-var-value" aria-label="${variableValueLabel}">
                <option value="true" ${String(variable.value) === 'true' ? 'selected' : ''}>true</option>
                <option value="false" ${String(variable.value) !== 'true' ? 'selected' : ''}>false</option>
            </select>`
            : `<input type="${variable.type === 'number' ? 'number' : 'text'}" class="text_pole igs-var-value"
                aria-label="${variableValueLabel}" value="${esc(variable.value)}" placeholder="${variableValueLabel}">`;

        return `<div class="igs-workflow-var-row" data-index="${index}">
            <input class="text_pole igs-var-name" aria-label="${variableNameLabel}"
                value="${esc(variable.name)}" placeholder="${variableNameLabel}">
            <select class="text_pole igs-var-type" aria-label="${variableTypeLabel}">
                ${[
                    ['string', tr('igs.connectionUi.typeText', 'Text')],
                    ['number', tr('igs.connectionUi.typeNumber', 'Number')],
                    ['boolean', tr('igs.connectionUi.typeBoolean', 'Boolean')],
                ].map(([type, label]) => `<option value="${type}" ${variable.type === type ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
            ${valueControl}
            <button type="button" class="menu_button igs-var-remove">${tr('igs.connectionUi.delete', 'Delete')}</button>
        </div>`;
    }).join('');
}

function safeConnectionNumber(value, fallback) {
    const number = Number(value ?? fallback);
    return esc(Number.isFinite(number) ? number : fallback);
}

// Connection settings UI, preserving the existing profile and tab lifecycle.
function renderConnectionUi() {
    const profile = getActiveProfile();
    const T = (key, fallback) => tr(`igs.connectionUi.${key}`, fallback);
    const conn = profile.connection;
    const mode = getConnectionMode(conn);
    const isComfy = mode === 'comfy';
    const vars = Array.isArray(conn.workflowVariables) ? conn.workflowVariables : [];
    const varRows = renderVariableRows(vars);
    const seedValue = Number(conn.seed ?? -1);
    const safeSeed = Number.isFinite(seedValue) ? seedValue : -1;
    const group = (title, content, desc = '') => renderSettingsGroup(title, content, desc);
    const modePicker = `<div class="igs-mode-picker" role="group" aria-label="${T('modeLabel', 'Configuration mode')}">
        <button type="button" class="igs-mode-choice ${mode === 'tavern' ? 'active' : ''}" data-mode="tavern" aria-pressed="${mode === 'tavern'}">${T('tavern', 'Tavern settings')}</button>
        <button type="button" class="igs-mode-choice ${isComfy ? 'active' : ''}" data-mode="comfy" aria-pressed="${isComfy}">${T('comfy', 'Custom ComfyUI')}</button>
        <button type="button" class="igs-mode-choice ${mode === 'auto' ? 'active' : ''}" data-mode="auto" aria-pressed="${mode === 'auto'}">${T('auto', 'Custom A1111 / Forge')}</button>
    </div>`;
    const tavernPane = `<section class="igs-tavern-pane" ${mode === 'tavern' ? '' : 'hidden'}>
        <h3>${T('tavernTitle', 'Tavern image generation settings')}</h3>
        <p class="igs-settings-group-description">${T('tavernDescription', 'Use the current Tavern image generation settings. Parameters are managed by Tavern.')}</p>
        <div id="igs_tavern_summary" class="igs-tavern-summary" aria-live="polite">${T('loadingTavern', 'Loading Tavern settings…')}</div>
        <div class="igs-inline-group">
            <button type="button" class="menu_button" id="igs_tavern_refresh">${T('refresh', 'Refresh')}</button>
            <button type="button" class="menu_button" id="igs_tavern_settings">${T('openTavern', 'Open Tavern image settings')}</button>
        </div>
    </section>`;

    const workflowGroup = isComfy ? group(T('workflow', 'ComfyUI workflow'), `
        <div class="igs-modal-field">
            <label class="igs-field-label" for="igs_m_comfy_workflow">${T('existingWorkflows', 'Workflows available in Tavern')}</label>
            <div class="igs-workflow-bar">
                <select id="igs_m_comfy_workflow" class="text_pole">
                    <option value="${esc(conn.comfyWorkflow || '')}">${esc(conn.comfyWorkflow) || T('chooseWorkflow', 'Choose a workflow')}</option>
                </select>
                <button type="button" class="menu_button" id="igs_workflow_refresh">${T('refreshList', 'Refresh list')}</button>
            </div>
        </div>
        <div class="igs-workflow-actions">
            <button type="button" class="menu_button" id="igs_m_workflow_new">${T('newWorkflow', 'New workflow')}</button>
            <button type="button" class="menu_button" id="igs_m_workflow_import">${T('importJson', 'Import JSON')}</button>
            <button type="button" class="menu_button" id="igs_m_workflow_edit">${T('editSelected', 'Edit selected')}</button>
            <button type="button" class="menu_button" id="igs_m_workflow_save_as">${T('saveAs', 'Save as')}</button>
            <details><summary>${T('more', 'More')}</summary>
                <div class="igs-workflow-actions">
                    <button type="button" class="menu_button" id="igs_m_workflow_rename">${T('rename', 'Rename')}</button>
                    <button type="button" class="menu_button" id="igs_m_workflow_delete">${T('delete', 'Delete')}</button>
                </div>
            </details>
        </div>
        <p class="igs-shared-workflow-note">${T('sharedWorkflow', 'Workflows are stored in Tavern’s shared directory and may be used by other features.')}</p>
        <input type="file" id="igs_m_workflow_import_file" accept=".json,application/json" hidden>
        <div id="igs_workflow_editor_mount"></div>`, T('workflowHelp', 'Choose a workflow before testing the connection.')) : '';

    const connectionFields = isComfy
        ? `<label class="igs-field-label" for="igs_m_comfy_url">${T('comfyUrl', 'ComfyUI URL')}</label>
            <div class="igs-inline-group">
                <input type="url" id="igs_m_comfy_url" class="text_pole" value="${esc(conn.comfyUrl)}" placeholder="http://127.0.0.1:8188">
                <button type="button" class="menu_button" id="igs_m_connect_btn">${T('testConnection', 'Test connection')}</button>
            </div>`
        : `<label class="igs-field-label" for="igs_m_auto_url">${T('autoUrl', 'A1111 / Forge URL')}</label>
            <input type="url" id="igs_m_auto_url" class="text_pole" value="${esc(conn.autoUrl)}" placeholder="http://localhost:7860">
            <label class="igs-field-label" for="igs_m_auto_auth">${T('authOptional', 'Authentication (optional)')}</label>
            <div class="igs-inline-group">
                <input type="password" id="igs_m_auto_auth" class="text_pole" value="${esc(conn.autoAuth)}" placeholder="username:password">
                <button type="button" class="menu_button" id="igs_m_connect_btn_auto">${T('testConnection', 'Test connection')}</button>
            </div>`;
    const connectionGroup = group(T('connection', 'Connection'), `${connectionFields}
        <button type="button" class="menu_button" id="igs_read_tavern_params">${T('readTavernParams', 'Read Tavern parameters')}</button>
        <div id="igs_read_tavern_feedback" aria-live="polite"></div>
        <div id="igs_m_connection_status" class="igs-connection-status" aria-live="polite">
            <span class="igs-status-dot disconnected"></span><span>${T('notTested', 'Connection not tested')}</span>
        </div>`);

    const commonParameters = group(T('commonParameters', 'Common parameters'), `
        <div class="igs-parameter-grid">
            <label>${T('model', 'Model')}<select id="igs_m_model" class="text_pole">
                <option value="${esc(conn.model)}">${esc(conn.model) || T('chooseModel', 'Choose a model')}</option>
            </select></label>
            <label>${T('sampler', 'Sampler')}<select id="igs_m_sampler" class="text_pole">
                <option value="${esc(conn.sampler)}">${esc(conn.sampler) || T('serverDefault', 'Server default')}</option>
            </select></label>
        </div>
        <div class="igs-size-presets"><span>${T('size', 'Size')}</span>
            <button type="button" class="menu_button" data-size="512,512">${T('square', 'Square')}</button>
            <button type="button" class="menu_button" data-size="768,512">${T('landscape', 'Landscape')}</button>
            <button type="button" class="menu_button" data-size="512,768">${T('portrait', 'Portrait')}</button>
        </div>
        <div class="igs-size-row">
            <label>${T('width', 'Width')} <input type="number" id="igs_m_width_value" min="64" max="2048" step="64" value="${safeConnectionNumber(conn.width, 512)}"></label>
            <button type="button" class="menu_button" id="igs_m_swap_size" aria-label="${T('swapSize', 'Swap width and height')}">${T('swap', 'Swap')}</button>
            <label>${T('height', 'Height')} <input type="number" id="igs_m_height_value" min="64" max="2048" step="64" value="${safeConnectionNumber(conn.height, 512)}"></label>
        </div>
        <div class="igs-parameter-grid">
            <label>${T('steps', 'Steps')}<input type="number" id="igs_m_steps_value" class="text_pole" min="1" max="150" step="1" value="${safeConnectionNumber(conn.steps, 20)}"></label>
            <label>${T('cfg', 'CFG')}<input type="number" id="igs_m_cfg_scale_value" class="text_pole" min="0" max="30" step="0.5" value="${safeConnectionNumber(conn.cfgScale, 7)}"></label>
        </div>
        <div class="igs-seed-row">
            <label><input type="checkbox" id="igs_m_seed_random" ${safeSeed < 0 ? 'checked' : ''}> ${T('randomSeed', 'Random seed')}</label>
            <input type="number" id="igs_m_seed" class="text_pole" min="-1" value="${safeConnectionNumber(safeSeed, -1)}" ${safeSeed < 0 ? 'disabled' : ''} aria-label="${T('fixedSeed', 'Fixed seed')}">
        </div>
        ${isComfy ? `<p id="igs_workflow_effective_hint" class="igs-workflow-effective-hint">${T('effectiveHint', 'Select a workflow to see which parameters it uses.')}</p>` : ''}
        <details class="igs-advanced"><summary>${T('advanced', 'Advanced parameters')}</summary>
            <div class="igs-parameter-grid">
                <label>${T('vae', 'VAE')}<select id="igs_m_vae" class="text_pole"><option value="${esc(conn.vae)}">${esc(conn.vae) || T('serverDefault', 'Server default')}</option></select></label>
                <label>${T('scheduler', 'Scheduler')}<select id="igs_m_scheduler" class="text_pole"><option value="${esc(conn.scheduler)}">${esc(conn.scheduler) || T('serverDefault', 'Server default')}</option></select></label>
                <label>${T('denoise', 'Denoising strength')}<input type="number" id="igs_m_denoising_value" class="text_pole" min="0" max="1" step="0.05" value="${safeConnectionNumber(conn.denoisingStrength, 0.7)}"></label>
                <label>${T('clipSkip', 'Clip Skip')}<input type="number" id="igs_m_clip_skip_value" class="text_pole" min="1" max="12" step="1" value="${safeConnectionNumber(conn.clipSkip, 1)}"></label>
            </div>
        </details>`);

    const variableGroup = isComfy ? group(T('workflowVariables', 'Workflow variables'), `
        <div class="igs-variable-list">${WORKFLOW_VARIABLES.map(variable => `<span class="igs-variable-chip">
            <code>%${esc(variable.name)}%</code> ${T(`variable.${variable.name}`, variable.label || variable.name)}
        </span>`).join('')}</div>
        <p class="igs-settings-group-description">${T('variablesHelp', 'Insert built-in variables in the editor, or define string, number, and boolean variables.')}</p>
        <div class="igs-workflow-actions">
            <button type="button" class="menu_button" id="igs_var_add">${T('addVariable', 'Add custom variable')}</button>
            <button type="button" class="menu_button" id="igs_var_preview">${T('previewReplacement', 'Preview replacements')}</button>
        </div>
        <div id="igs_custom_vars">${varRows}</div>
        <pre id="igs_var_preview_result" class="igs-var-preview" hidden></pre>
        <div id="igs_var_validation" aria-live="polite"></div>`) : '';

    return `<div class="igs-modal-section igs-connection-ui">
        ${modePicker}
        ${tavernPane}
        <div class="igs-custom-pane" ${mode === 'tavern' ? 'hidden' : ''}>
            ${workflowGroup}
            ${connectionGroup}
            ${commonParameters}
            ${variableGroup}
        </div>
    </div>`;
}

function bindConnectionUi() {
    const modal = $('#igs_settings_root');
    const profile = getActiveProfile();
    const conn = profile.connection;
    const mode = getConnectionMode(conn);
    const ui = modal.find('.igs-connection-ui')[0];
    const profileId = profile.id;
    let workflowListRequest = 0;
    let variableHintTimer;
    const isCurrent = (expectedMode = mode) => {
        const active = getActiveProfile();
        return Boolean(ui?.isConnected && active?.id === profileId && active.connection === conn && getConnectionMode(conn) === expectedMode);
    };
    const reportError = error => toastr.error(error.message || String(error));
    const renderVariables = () => {
        const list = document.getElementById('igs_custom_vars');
        if (list?.isConnected) list.innerHTML = renderVariableRows(conn.workflowVariables || []);
    };
    const scheduleVariableHint = () => {
        clearTimeout(variableHintTimer);
        variableHintTimer = setTimeout(() => refreshWorkflowHint(conn, conn.comfyWorkflow, ui), 180);
    };
    const numericSpecs = {
        igs_m_steps_value: { field: 'steps', min: 1, max: 150, integer: true },
        igs_m_cfg_scale_value: { field: 'cfgScale', min: 0, max: 30 },
        igs_m_width_value: { field: 'width', min: 64, max: 2048, integer: true },
        igs_m_height_value: { field: 'height', min: 64, max: 2048, integer: true },
        igs_m_denoising_value: { field: 'denoisingStrength', min: 0, max: 1 },
        igs_m_clip_skip_value: { field: 'clipSkip', min: 1, max: 12, integer: true },
        igs_m_seed: { field: 'seed', min: -1, integer: true },
    };

    async function reloadWorkflowList(selected = conn.comfyWorkflow) {
        const requestId = ++workflowListRequest;
        const requestedWorkflow = conn.comfyWorkflow;
        const list = await loadWorkflows();
        if (!isCurrent('comfy') || requestId !== workflowListRequest || conn.comfyWorkflow !== requestedWorkflow) return;
        const select = $('#igs_m_comfy_workflow').empty();
        if (list.length) {
            select.append($('<option>', { value: '', text: tr('igs.connectionUi.chooseWorkflow', 'Choose a workflow') }));
            for (const name of list) select.append($('<option>', { value: name, text: name }));
        }
        if (!list?.length) {
            select.append($('<option>', {
                value: selected || '',
                text: selected
                    ? tr('igs.connectionUi.missingWorkflow', 'Missing workflow: {name}', { name: selected })
                    : tr('igs.connectionUi.noWorkflows', 'No workflows found'),
            }));
        } else if (selected && !list.includes(selected)) {
            select.prepend($('<option>', {
                value: selected,
                text: tr('igs.connectionUi.missingWorkflow', 'Missing workflow: {name}', { name: selected }),
            }));
        }
        select.val(selected || '');
        if (selected && list.includes(selected)) conn.comfyWorkflow = selected;
        saveProfiles();
        await refreshWorkflowHint(conn, selected, ui);
    }

    function openNameForm(title, onSave, options = {}) {
        workflowNameForm(title, onSave, {
            initial: options.initial || '',
            allowExisting: options.allowExisting || '',
            preserveEditor: options.preserveEditor || false,
            isCurrent: () => isCurrent('comfy'),
        });
    }

    async function saveAsWorkflow(title, sourceText, expectedWorkflow) {
        openNameForm(title, async name => {
            if (!isCurrent('comfy') || conn.comfyWorkflow !== expectedWorkflow) return;
            const result = inspectWorkflowForSave(sourceText, conn);
            await saveWorkflow(name, result.template);
            if (!isCurrent('comfy') || conn.comfyWorkflow !== expectedWorkflow) return;
            conn.comfyWorkflow = name;
            saveProfiles();
            await reloadWorkflowList(name);
            ui.querySelector('.igs-workflow-editor-popup')?.remove();
        }, { preserveEditor: true });
    }

    if (mode === 'tavern') loadTavernSummary(profileId, ui);
    if (mode === 'comfy') reloadWorkflowList().catch(error => {
        if (isCurrent('comfy')) workflowListError(error);
    });

    modal.on('click.igstab', '.igs-mode-choice', function () {
        const nextMode = $(this).data('mode');
        if (!isCurrent() || nextMode === mode) return;
        setConnectionMode(conn, nextMode);
        saveProfiles();
        renderActiveTab();
    });

    for (const [id, field] of [
        ['igs_m_comfy_url', 'comfyUrl'], ['igs_m_auto_url', 'autoUrl'], ['igs_m_auto_auth', 'autoAuth'],
        ['igs_m_model', 'model'], ['igs_m_vae', 'vae'], ['igs_m_sampler', 'sampler'], ['igs_m_scheduler', 'scheduler'],
        ['igs_m_comfy_workflow', 'comfyWorkflow'],
    ]) {
        bindModalInput(id, value => { conn[field] = value; });
    }

    modal.on('input.igstab change.igstab', Object.keys(numericSpecs).map(id => `#${id}`).join(','), function () {
        const spec = numericSpecs[this.id];
        const raw = this.value.trim();
        const value = raw === '' ? NaN : Number(raw);
        const valid = Number.isFinite(value) && value >= spec.min && (spec.max === undefined || value <= spec.max) && (!spec.integer || Number.isInteger(value));
        this.setCustomValidity(valid ? '' : tr('igs.connectionUi.invalidNumber', 'Enter a valid value in the allowed range.'));
        if (!valid) return;
        conn[spec.field] = value;
        saveProfiles();
    });

    modal.on('click.igstab', '#igs_m_connect_btn', () => handleModalConnect('comfy'));
    modal.on('click.igstab', '#igs_m_connect_btn_auto', () => handleModalConnect('auto'));
    modal.on('click.igstab', '#igs_read_tavern_params', async () => {
        const feedback = document.getElementById('igs_read_tavern_feedback');
        try {
            const values = await readTavernConnection(mode);
            if (!isCurrent()) return;
            const fields = ['model', 'vae', 'sampler', 'scheduler', 'steps', 'cfgScale', 'width', 'height', 'denoisingStrength', 'clipSkip', 'seed'];
            if (mode === 'comfy') fields.push('comfyWorkflow', 'workflowVariables', 'comfyUrl');
            else fields.push('autoUrl', 'autoAuth');
            for (const field of fields) if (values[field] !== undefined) conn[field] = values[field];
            saveProfiles();
            renderActiveTab();
            toastr.success(tr('igs.connectionUi.tavernParamsRead', 'Tavern parameters copied.'));
        } catch (error) {
            if (feedback?.isConnected && isCurrent()) feedback.textContent = tr('igs.connectionUi.readFailed', 'Could not read Tavern parameters: {error}', { error: error.message });
        }
    });
    modal.on('click.igstab', '#igs_tavern_refresh', () => loadTavernSummary(profileId, ui));
    modal.on('click.igstab', '#igs_tavern_settings', openTavernImageSettings);

    modal.on('click.igstab', '.igs-size-presets [data-size]', function () {
        const [width, height] = $(this).data('size').split(',');
        $('#igs_m_width_value').val(width).trigger('input');
        $('#igs_m_height_value').val(height).trigger('input');
    });
    modal.on('click.igstab', '#igs_m_swap_size', () => {
        const width = $('#igs_m_width_value').val();
        const height = $('#igs_m_height_value').val();
        $('#igs_m_width_value').val(height).trigger('input');
        $('#igs_m_height_value').val(width).trigger('input');
    });
    modal.on('change.igstab', '#igs_m_seed_random', function () {
        const random = this.checked;
        const seedInput = $('#igs_m_seed').prop('disabled', random);
        if (random) seedInput.val(-1).trigger('input');
        else if (Number(seedInput.val()) < 0) seedInput.val(0).trigger('input');
    });

    modal.on('click.igstab', '#igs_workflow_refresh', () => reloadWorkflowList().catch(error => {
        if (isCurrent('comfy')) workflowListError(error);
    }));
    modal.on('change.igstab', '#igs_m_comfy_workflow', function () {
        ++workflowListRequest;
        conn.comfyWorkflow = $(this).val();
        ui.querySelector('#igs_workflow_editor_mount')?.replaceChildren();
        saveProfiles();
        refreshWorkflowHint(conn, conn.comfyWorkflow, ui);
    });
    modal.on('click.igstab', '#igs_m_workflow_new', () => {
        const originalWorkflow = conn.comfyWorkflow;
        openNameForm(tr('igs.connectionUi.newWorkflow', 'New workflow'), async name => {
            if (!isCurrent('comfy') || conn.comfyWorkflow !== originalWorkflow) return;
            await openWorkflowEditorUi(name, '{}', conn, {
                isCurrent: () => isCurrent('comfy') && conn.comfyWorkflow === originalWorkflow,
                onSaved: async savedName => {
                    if (!isCurrent('comfy') || conn.comfyWorkflow !== originalWorkflow) return;
                    conn.comfyWorkflow = savedName;
                    saveProfiles();
                    await reloadWorkflowList(savedName);
                },
            });
        });
    });
    modal.on('click.igstab', '#igs_m_workflow_import', () => $('#igs_m_workflow_import_file').trigger('click'));
    modal.on('change.igstab', '#igs_m_workflow_import_file', async function () {
        const file = this.files?.[0];
        if (!file) return;
        const fileInput = this;
        try {
            const sourceText = await file.text();
            JSON.parse(sourceText);
            if (!isCurrent('comfy')) return;
            openNameForm(tr('igs.connectionUi.importWorkflow', 'Import workflow'), async name => {
                const result = inspectWorkflowForSave(sourceText, conn);
                await saveWorkflow(name, result.template);
                if (!isCurrent('comfy')) return;
                conn.comfyWorkflow = name;
                saveProfiles();
                await reloadWorkflowList(name);
            });
        } catch (error) {
            if (isCurrent('comfy')) toastr.error(tr('igs.connectionUi.importFailed', 'Import failed: {error}', { error: error.message }));
        } finally {
            fileInput.value = '';
        }
    });
    modal.on('click.igstab', '#igs_m_workflow_edit', async () => {
        const workflowName = conn.comfyWorkflow;
        if (!workflowName) return toastr.warning(tr('igs.connectionUi.chooseFirst', 'Select a workflow first.'));
        try {
            const files = await loadWorkflows();
            if (!isCurrent('comfy') || conn.comfyWorkflow !== workflowName) return;
            if (!files.includes(workflowName)) {
                throw new Error(tr('igs.workflow.missing', 'Workflow "{name}" was not found in SillyTavern.', { name: workflowName }));
            }
            const data = await loadWorkflow(workflowName);
            if (!isCurrent('comfy') || conn.comfyWorkflow !== workflowName) return;
            await openWorkflowEditorUi(workflowName, typeof data === 'string' ? data : JSON.stringify(data, null, 2), conn, {
                isCurrent: () => isCurrent('comfy') && conn.comfyWorkflow === workflowName,
                onSaved: () => reloadWorkflowList(workflowName),
            });
        } catch (error) {
            if (isCurrent('comfy')) toastr.error(tr('igs.connectionUi.loadWorkflowFailed', 'Could not load workflow: {error}', { error: error.message }));
        }
    });
    modal.on('click.igstab', '#igs_m_workflow_save_as', async () => {
        const workflowName = conn.comfyWorkflow;
        if (!workflowName) return toastr.warning(tr('igs.connectionUi.chooseFirst', 'Select a workflow first.'));
        let sourceText = ui.querySelector('.igs-workflow-editor-textarea')?.value;
        try {
            if (sourceText === undefined) {
                const files = await loadWorkflows();
                if (!isCurrent('comfy') || conn.comfyWorkflow !== workflowName) return;
                if (!files.includes(workflowName)) {
                    throw new Error(tr('igs.workflow.missing', 'Workflow "{name}" was not found in SillyTavern.', { name: workflowName }));
                }
                const data = await loadWorkflow(workflowName);
                if (!isCurrent('comfy') || conn.comfyWorkflow !== workflowName) return;
                sourceText = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
            }
            await saveAsWorkflow(tr('igs.connectionUi.saveAs', 'Save as'), sourceText, workflowName);
        } catch (error) {
            if (isCurrent('comfy')) toastr.error(error.message);
        }
    });
    modal.on('click.igstab', '#igs_m_workflow_rename', () => {
        const oldName = conn.comfyWorkflow;
        if (!oldName) return;
        openNameForm(tr('igs.connectionUi.renameWorkflow', 'Rename workflow'), async newName => {
            if (newName === oldName) return;
            await renameWorkflow(oldName, newName);
            if (!isCurrent('comfy') || conn.comfyWorkflow !== oldName) return;
            conn.comfyWorkflow = newName;
            saveProfiles();
            await reloadWorkflowList(newName);
        }, { initial: oldName, allowExisting: oldName });
    });
    modal.on('click.igstab', '#igs_m_workflow_delete', async () => {
        const workflowName = conn.comfyWorkflow;
        if (!workflowName || !window.confirm(tr('igs.connectionUi.confirmDeleteWorkflow', 'Delete workflow “{name}”?', { name: workflowName }))) return;
        try {
            await deleteWorkflow(workflowName);
            if (!isCurrent('comfy') || conn.comfyWorkflow !== workflowName) return;
            conn.comfyWorkflow = '';
            saveProfiles();
            await reloadWorkflowList('');
        } catch (error) {
            if (isCurrent('comfy')) reportError(error);
        }
    });

    modal.on('click.igstab', '#igs_var_add', () => {
        if (!Array.isArray(conn.workflowVariables)) conn.workflowVariables = [];
        const base = tr('igs.connectionUi.customVariableBase', 'custom');
        const names = new Set(conn.workflowVariables.map(variable => variable.name));
        let name = base;
        let suffix = 2;
        while (names.has(name)) name = `${base}${suffix++}`;
        conn.workflowVariables.push({ name, type: 'string', value: '' });
        saveProfiles();
        renderVariables();
    });
    modal.on('click.igstab', '.igs-var-remove', function () {
        conn.workflowVariables.splice(Number($(this).closest('[data-index]').data('index')), 1);
        saveProfiles();
        renderVariables();
        scheduleVariableHint();
    });
    modal.on('input.igstab', '.igs-var-name,.igs-var-value', function () {
        const row = $(this).closest('[data-index]');
        const variable = conn.workflowVariables[Number(row.data('index'))];
        if (!variable || !isCurrent('comfy')) return;
        variable.name = row.find('.igs-var-name').val().trim();
        variable.value = row.find('.igs-var-value').val();
        if (variable.type === 'number' && variable.value.trim() !== '' && !Number.isFinite(Number(variable.value))) return;
        saveProfiles();
        scheduleVariableHint();
    });
    modal.on('change.igstab', '.igs-var-type', function () {
        const row = $(this).closest('[data-index]');
        const index = Number(row.data('index'));
        const variable = conn.workflowVariables[index];
        if (!variable || !isCurrent('comfy')) return;
        const previousValue = variable.value;
        variable.type = this.value;
        if (variable.type === 'number') variable.value = Number.isFinite(Number(previousValue)) ? Number(previousValue) : 0;
        else if (variable.type === 'boolean') variable.value = String(previousValue) === 'true';
        else variable.value = String(previousValue ?? '');
        saveProfiles();
        renderVariables();
        document.querySelector(`#igs_custom_vars [data-index="${index}"] .igs-var-type`)?.focus();
        scheduleVariableHint();
    });
    modal.on('click.igstab', '#igs_var_preview', () => refreshWorkflowHint(conn, conn.comfyWorkflow, ui, true));
}

async function loadTavernSummary(profileId, ui) {
    const target = document.getElementById('igs_tavern_summary');
    if (!target) return;
    target.textContent = tr('igs.connectionUi.loadingTavern', 'Loading Tavern settings…');

    const isCurrent = () => {
        const profile = getActiveProfile();
        return target.isConnected && ui?.isConnected && profile?.id === profileId &&
            getConnectionMode(profile.connection) === 'tavern';
    };

    try {
        const summary = await getTavernSummary();
        if (!isCurrent()) return;
        target.innerHTML = summary.available
            ? `<strong>${esc(summary.label || summary.source || tr('igs.connectionUi.configured', 'Configured'))}</strong>
                <span>${tr('igs.connectionUi.model', 'Model')}: ${esc(summary.model || tr('igs.connectionUi.tavernDefault', 'Tavern default'))}</span>
                <span>${tr('igs.connectionUi.size', 'Size')}: ${esc(summary.width || '—')} × ${esc(summary.height || '—')}</span>
                <span>${tr('igs.connectionUi.workflow', 'Workflow')}: ${esc(summary.workflow || tr('igs.connectionUi.managedByTavern', 'Managed by Tavern'))}</span>`
            : `<span>${esc(summary.error || tr('igs.connectionUi.tavernNotConfigured', 'Tavern image generation is not configured.'))}</span>`;
    } catch (error) {
        if (isCurrent()) target.textContent = tr('igs.connectionUi.readFailed', 'Could not read Tavern settings: {error}', { error: error.message });
    }
}

function openTavernImageSettings() {
    const section=document.querySelector('.sd_settings');if(!section)return;
    section.scrollIntoView({behavior:'smooth',block:'center'});
    const content=section.querySelector('.inline-drawer-content');
    if(content&&getComputedStyle(content).display==='none')section.querySelector('.inline-drawer-toggle')?.click();
}

function normalizeWorkflowFilename(rawName) {
    let name = String(rawName || '').trim();
    if (!name) throw new Error(tr('igs.connectionUi.nameRequired', 'Enter a workflow file name.'));
    if (/[\\/:*?"<>|\u0000-\u001f]/.test(name) || name === '.' || name === '..' || name.includes('..')) {
        throw new Error(tr('igs.connectionUi.invalidFilename', 'File names cannot contain paths or reserved characters.'));
    }
    if (!/\.json$/i.test(name)) name += '.json';
    if (name.toLowerCase() === '.json') throw new Error(tr('igs.connectionUi.nameRequired', 'Enter a workflow file name.'));
    return name;
}

function workflowNameForm(title, onSave, options = {}) {
    const mount = document.getElementById('igs_workflow_editor_mount');
    if (!mount) return;
    const form = document.createElement('form');
    form.className = 'igs-workflow-name-form';
    form.innerHTML = `<label>${esc(title)}<input class="text_pole" name="name" required value="${esc(options.initial || '')}" placeholder="workflow.json"></label>
        <button type="submit" class="menu_button">${tr('igs.connectionUi.saveContinue', 'Save and continue')}</button>
        <button type="button" class="menu_button igs-name-cancel">${tr('igs.connectionUi.cancel', 'Cancel')}</button>
        <div class="igs-name-feedback" role="status" aria-live="polite"></div>`;
    if (options.preserveEditor) {
        mount.querySelector('.igs-workflow-name-form')?.remove();
        mount.prepend(form);
    } else {
        mount.replaceChildren(form);
    }
    const input = form.elements.namedItem('name');
    const submit = form.querySelector('[type="submit"]');
    input.focus();

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submit.disabled) return;
        const feedback = form.querySelector('.igs-name-feedback');
        submit.disabled = true;
        input.disabled = true;
        try {
            if (options.isCurrent && !options.isCurrent()) return;
            const name = normalizeWorkflowFilename(input.value);
            const currentFiles = await loadWorkflows();
            if (options.isCurrent && !options.isCurrent()) return;
            const duplicate = currentFiles.find(file => file.toLowerCase() === name.toLowerCase());
            if (duplicate && duplicate !== options.allowExisting) {
                throw new Error(tr('igs.connectionUi.filenameExists', 'A workflow with this name already exists. Choose another name.'));
            }
            await onSave(name);
            if (form.isConnected && form.parentNode === mount) form.remove();
        } catch (error) {
            if (form.isConnected) feedback.textContent = error.message;
        } finally {
            if (form.isConnected) {
                submit.disabled = false;
                input.disabled = false;
            }
        }
    });
    form.querySelector('.igs-name-cancel').addEventListener('click', () => form.remove());
}

function inspectWorkflowForSave(text, conn) {
    const result = inspectWorkflow(text, conn);
    if (result.unknown.length) {
        throw new Error(tr('igs.workflow.unknownVariables', 'Workflow contains unknown variables: {names}', {
            names: result.unknown.join(', '),
        }));
    }
    return result;
}

async function openWorkflowEditorUi(name, text, conn, options = {}) {
    const mount = document.getElementById('igs_workflow_editor_mount');
    if (!mount || (options.isCurrent && !options.isCurrent())) return;
    const popup = document.createElement('div');
    popup.className = 'igs-workflow-editor-popup';
    popup.innerHTML = `<div class="igs-workflow-editor-header"><h3>${esc(name)}</h3>
            <button type="button" class="menu_button igs-editor-close">${tr('igs.connectionUi.close', 'Close')}</button></div>
        <details class="igs-variable-inserter"><summary>${tr('igs.connectionUi.insertVariable', 'Insert variable:')}</summary><div class="igs-variable-buttons">
            ${WORKFLOW_VARIABLES.map(variable => `<button type="button" class="menu_button" data-var="${esc(variable.name)}">%${esc(variable.name)}%</button>`).join('')}
        </div></details>
        <textarea class="igs-workflow-editor-textarea" spellcheck="false">${esc(text)}</textarea>
        <div class="igs-workflow-editor-footer">
            <button type="button" class="menu_button igs-editor-save">${tr('igs.connectionUi.save', 'Save')}</button>
            <button type="button" class="menu_button igs-editor-check">${tr('igs.connectionUi.validatePreview', 'Validate and preview')}</button>
            <button type="button" class="menu_button igs-editor-close">${tr('igs.connectionUi.cancel', 'Cancel')}</button>
        </div><div class="igs-workflow-editor-feedback" aria-live="polite"></div>`;
    mount.replaceChildren(popup);
    const area = popup.querySelector('textarea');
    const feedback = popup.querySelector('.igs-workflow-editor-feedback');
    const saveButton = popup.querySelector('.igs-editor-save');

    popup.querySelectorAll('[data-var]').forEach(button => button.addEventListener('click', () => {
        const token = `%${button.dataset.var}%`;
        area.setRangeText(token, area.selectionStart, area.selectionEnd, 'end');
        area.focus();
    }));
    popup.querySelectorAll('.igs-editor-close').forEach(button => button.addEventListener('click', () => popup.remove()));
    popup.querySelector('.igs-editor-check').addEventListener('click', () => {
        try {
            const result = inspectWorkflow(area.value, conn);
            feedback.textContent = result.unknown.length
                ? tr('igs.connectionUi.unknownVariablesFound', 'Unknown variables: {names}', { names: result.unknown.join(', ') })
                : tr('igs.connectionUi.validationResult', 'Valid. Used: {used}; unknown variables: {unknown}', {
                    used: result.used.join(', ') || tr('igs.connectionUi.none', 'none'),
                    unknown: tr('igs.connectionUi.none', 'none'),
                });
            feedback.textContent += `\n${result.preview}`;
        } catch (error) {
            feedback.textContent = error.message;
        }
    });
    saveButton.addEventListener('click', async () => {
        if (saveButton.disabled) return;
        saveButton.disabled = true;
        try {
            if (options.isCurrent && !options.isCurrent()) return;
            const result = inspectWorkflowForSave(area.value, conn);
            await saveWorkflow(name, result.template);
            if (options.isCurrent && !options.isCurrent()) return;
            await options.onSaved?.(name);
            if (popup.isConnected) popup.remove();
            toastr.success(tr('igs.connectionUi.workflowSaved', 'Workflow saved.'));
        } catch (error) {
            if (popup.isConnected) feedback.textContent = error.message;
        } finally {
            if (saveButton.isConnected) saveButton.disabled = false;
        }
    });
}

async function refreshWorkflowHint(conn, name = conn.comfyWorkflow, ui, showPreview = false) {
    const hint = document.getElementById('igs_workflow_effective_hint');
    const preview = document.getElementById('igs_var_preview_result');
    const profileId = getActiveProfile()?.id;
    const isCurrent = () => {
        const profile = getActiveProfile();
        return ui?.isConnected && profile?.id === profileId && profile.connection === conn &&
            getConnectionMode(conn) === 'comfy' && conn.comfyWorkflow === name;
    };

    if (!name) {
        if (showPreview && preview) {
            preview.hidden = false;
            preview.textContent = tr('igs.connectionUi.selectWorkflowPreview', 'Select a workflow to preview variable replacements.');
        }
        if (hint) hint.textContent = tr('igs.connectionUi.effectiveHint', 'Select a workflow to see which parameters it uses.');
        return;
    }

    try {
        const files = await loadWorkflows();
        if (!isCurrent()) return;
        if (!files.includes(name)) throw new Error(tr('igs.workflow.missing', 'Workflow "{name}" was not found in SillyTavern.', { name }));
        const data = await loadWorkflow(name);
        if (!isCurrent()) return;
        const result = inspectWorkflow(typeof data === 'string' ? data : JSON.stringify(data), conn);
        const labels = Object.fromEntries(WORKFLOW_VARIABLES.map(variable => [
            variable.name,
            tr(`igs.connectionUi.variable.${variable.name}`, variable.label || variable.name),
        ]));
        if (hint) {
            const used = result.used.filter(key => Object.hasOwn(labels, key));
            const fixed = Object.keys(labels).filter(key => !result.used.includes(key));
            hint.textContent = tr('igs.connectionUi.effectiveStatus', 'Effective: {used}; fixed by workflow: {fixed}', {
                used: used.map(key => labels[key]).join(', ') || tr('igs.connectionUi.noParameters', 'no parameter placeholders detected'),
                fixed: fixed.map(key => labels[key]).join(', ') || tr('igs.connectionUi.none', 'none'),
            });
        }
        if (preview && showPreview) {
            preview.hidden = false;
            preview.textContent = [
                tr('igs.connectionUi.variablesUsed', 'Used variables: {used}', { used: result.used.join(', ') || tr('igs.connectionUi.none', 'none') }),
                tr('igs.connectionUi.unknownVariables', 'Unknown variables: {unknown}', { unknown: result.unknown.join(', ') || tr('igs.connectionUi.none', 'none') }),
                '',
                result.preview,
            ].join('\n');
        }
    } catch (error) {
        if (!isCurrent()) return;
        if (hint) hint.textContent = tr('igs.connectionUi.workflowValidationFailed', 'Workflow validation failed: {error}', { error: error.message });
        if (preview && showPreview) {
            preview.hidden = false;
            preview.textContent = error.message;
        }
    }
}

function workflowListError(error){const message=tr('igs.connectionUi.workflowListFailed','Could not load workflows: {error}',{error:error.message});const select=document.getElementById('igs_m_comfy_workflow');if(select)select.innerHTML=`<option value="">${esc(message)}</option>`;toastr.error(message);}

function renderPromptConstructionTab() {
    const profile = getActiveProfile();
    const pc = profile.promptConstruction;

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup(tr('igs.modal.group.positivePrompt', 'Positive prompt'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_prefix"><span data-i18n="igs.modal.text.prompt-prefix">Prompt Prefix</span></label>
                <textarea id="igs_m_prompt_prefix" class="text_pole" rows="2">${esc(pc.prefix)}</textarea>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_prompt_suffix"><span data-i18n="igs.modal.text.prompt-suffix">Prompt Suffix</span></label>
                <textarea id="igs_m_prompt_suffix" class="text_pole" rows="2">${esc(pc.suffix)}</textarea>
            </div>
            `, tr('igs.modal.description.positivePrompt', 'Add text before and after the generated positive prompt.'))}

            ${renderSettingsGroup(tr('igs.modal.group.negativePrompt', 'Negative prompt'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_negative_prompt_prefix"><span data-i18n="igs.modal.text.negative-prefix">Negative Prefix</span></label>
                <textarea id="igs_m_negative_prompt_prefix" class="text_pole" rows="2">${esc(pc.negativePrefix)}</textarea>
            </div>
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_negative_suffix"><span data-i18n="igs.modal.text.negative-suffix">Negative Suffix</span></label>
                <textarea id="igs_m_negative_suffix" class="text_pole" rows="2">${esc(pc.negativeSuffix)}</textarea>
            </div>
            `, tr('igs.modal.description.negativePrompt', 'Add text before and after the negative prompt.'))}

            ${renderSettingsGroup(tr('igs.modal.group.promptTemplates', 'Prompt templates'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_positive_prompt_template"><span data-i18n="igs.modal.text.positive-template">Positive Template</span></label>
                <textarea id="igs_m_positive_prompt_template" class="text_pole" rows="3"
                    placeholder="{prefix}, {prompt}, {promptExtra}, {style}, {loras}, {suffix}" data-i18n="[placeholder]igs.modal.attr.prefix-prompt-promptextra-style-loras-suffix">${esc(pc.positiveTemplate)}</textarea>
                <div class="igs-hint"><span data-i18n="igs.modal.text.available-macros-prefix-prompt-promptextra-style-loras-suffix">Available macros: {prefix}, {prompt}, {promptExtra}, {style}, {loras}, {suffix}</span></div>
            </div>

            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_negative_prompt_template"><span data-i18n="igs.modal.text.negative-template">Negative Template</span></label>
                <textarea id="igs_m_negative_prompt_template" class="text_pole" rows="3"
                    placeholder="{negativePrefix}, {negative}, {negativeExtra}, {negativeSuffix}" data-i18n="[placeholder]igs.modal.attr.negativeprefix-negative-negativeextra-negativesuffix">${esc(pc.negativeTemplate)}</textarea>
                <div class="igs-hint"><span data-i18n="igs.modal.text.available-macros-negativeprefix-negative-negativeextra-negativesuffix">Available macros: {negativePrefix}, {negative}, {negativeExtra}, {negativeSuffix}</span></div>
            </div>
            `, tr('igs.modal.description.promptTemplates', 'Set how prompt parts are combined before sending them to the backend.'))}
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
        listItems = '<div class="igs-modal-empty-msg"><span data-i18n="igs.modal.text.no-styles-click-add-style-to-create-one">No styles. Click + Add Style to create one.</span></div>';
    } else {
        styles.forEach((style, idx) => {
            listItems += `
                <div class="igs-modal-list-item${idx === selectedStyleIndex ? ' active' : ''}" data-index="${idx}">
                    <span>${esc(style.name) || tr('igs.modal.value.unnamed', '(Unnamed)')}</span>
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
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.style-name">Style Name</span></label>
                    <input type="text" class="text_pole igs-m-style-name" value="${esc(style.name)}">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.description">Description</span></label>
                    <input type="text" class="text_pole igs-m-style-desc" value="${esc(style.description || '')}">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.content-prompt">Content / Prompt</span></label>
                    <textarea class="text_pole igs-m-style-content" rows="3">${esc(style.content || '')}</textarea>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.preview-image-url">Preview Image URL</span></label>
                    <div class="igs-inline-group">
                        <input type="text" class="text_pole igs-m-style-preview-url" value="${esc(style.preview_image || '')}"
                            placeholder="http://... or upload below" data-i18n="[placeholder]igs.modal.attr.http-or-upload-below">
                        <div class="menu_button menu_button_icon igs-m-style-img-upload-btn" title="Upload Image" data-i18n="[title]igs.modal.attr.upload-image">
                            <i class="fa-solid fa-file-arrow-up"></i>
                        </div>
                        <input type="file" class="igs-m-style-img-file-input" accept="image/*" style="display:none;">
                    </div>
                </div>
                ${style.preview_image ? `
                <div class="igs-style-item-preview-box">
                    <img src="${esc(style.preview_image)}" alt="Preview" data-i18n="[alt]igs.modal.attr.preview">
                </div>
                ` : ''}
                <div class="igs-modal-field" style="margin-top: 12px;">
                    <div class="menu_button menu_button_icon igs-m-style-delete" title="Delete Style" data-i18n="[title]igs.modal.attr.delete-style" style="color: #f44336;">
                        <i class="fa-solid fa-trash-can"></i>
                        <span><span data-i18n="igs.modal.text.delete-style">Delete Style</span></span>
                    </div>
                </div>
            </div>
        `;
    } else {
        editorHtml = '<div class="igs-modal-editor-placeholder"><span data-i18n="igs.modal.text.select-a-style-from-the-list-to-edit">Select a style from the list to edit.</span></div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup(tr('igs.modal.group.styleCollection', 'Style collection'), `
            <div class="igs-profile-bar">
                <select id="igs_m_style_profile_select" class="text_pole">${styleProfileOptions}</select>
                <div class="igs-profile-actions">
                    <div class="menu_button" id="igs_m_style_profile_add" title="Add Style Profile" data-i18n="[title]igs.modal.attr.add-style-profile"><i class="fa-solid fa-plus"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_duplicate" title="Duplicate" data-i18n="[title]igs.modal.attr.duplicate"><i class="fa-solid fa-copy"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_rename" title="Rename" data-i18n="[title]igs.modal.attr.rename"><i class="fa-solid fa-pencil"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_delete" title="Delete" data-i18n="[title]igs.modal.attr.delete"><i class="fa-solid fa-trash-can"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_export" title="Export" data-i18n="[title]igs.modal.attr.export"><i class="fa-solid fa-file-export"></i></div>
                    <div class="menu_button" id="igs_m_style_profile_import" title="Import" data-i18n="[title]igs.modal.attr.import"><i class="fa-solid fa-file-import"></i></div>
                </div>
                <input type="file" id="igs_m_style_profile_import_file" accept=".json" style="display:none;">
            </div>
            `, tr('igs.modal.description.styleCollection', 'Choose a collection and manage its saved profiles.'))}

            ${renderSettingsGroup(tr('igs.modal.group.stylesInCollection', 'Styles in this collection'), `
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.style-list">Style list</span></div>
                    ${listItems}
                    <div class="menu_button menu_button_icon igs-m-style-add" style="width:100%; margin-top: 6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span><span data-i18n="igs.modal.text.add-style">Add Style</span></span>
                    </div>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.style-details">Style details</span></div>
                    ${editorHtml}
                </div>
            </div>
            `, tr('igs.modal.description.stylesInCollection', 'Select a style to edit its name, prompt, and preview image.'))}
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
        const name = prompt(tr('igs.modal.style.newProfilePrompt', 'New style profile name:'), tr('igs.modal.style.newProfileName', 'New Styles Profile'));
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
        const newName = prompt(tr('igs.modal.style.renameProfilePrompt', 'Rename style profile:'), settings.styleProfiles[id].name);
        if (!newName) return;
        renameStyleProfile(id, newName);
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_style_profile_delete', () => {
        const id = profile.activeStyleProfileId;
        if (!id) return;
        if (!confirm(tr('igs.modal.style.confirmDeleteProfile', 'Delete this style profile?'))) return;
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
                toastr.success(tr('igs.modal.style.imported', 'Imported style profile: {name}', { name: sp.name }));
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
        modal.find(`.igs-modal-list-item[data-index="${selectedStyleIndex}"] span`).text($(this).val() || tr('igs.modal.value.unnamed', '(Unnamed)'));
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
        if (!confirm(tr('igs.modal.style.confirmDelete', 'Delete style "{name}"?', { name: styles[selectedStyleIndex].name }))) return;
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
        listItems = '<div class="igs-modal-empty-msg"><span data-i18n="igs.modal.text.no-characters-click-add-character-to-create-one">No characters. Click + Add Character to create one.</span></div>';
    } else {
        chars.forEach((char, idx) => {
            listItems += `
                <div class="igs-modal-list-item${idx === selectedCharIndex ? ' active' : ''}" data-index="${idx}">
                    <span>${esc(char.name) || tr('igs.modal.value.unnamed', '(Unnamed)')}</span>
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
                    <input type="text" class="text_pole igs-m-outfit-name" value="${esc(outfit.name || '')}" placeholder="Outfit name" data-i18n="[placeholder]igs.modal.attr.outfit-name" style="flex: 0 0 120px;">
                    <input type="text" class="text_pole igs-m-outfit-desc" value="${esc(outfit.description || '')}" placeholder="Outfit description" data-i18n="[placeholder]igs.modal.attr.outfit-description" style="flex: 1;">
                    <div class="menu_button menu_button_icon igs-m-outfit-delete" title="Remove outfit" data-i18n="[title]igs.modal.attr.remove-outfit" style="padding: 3px 6px;">
                        <i class="fa-solid fa-xmark"></i>
                    </div>
                </div>
            </div>
        `).join('');

        editorHtml = `
            <div class="igs-modal-editor-content">
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.character-name">Character Name</span></label>
                    <input type="text" class="text_pole igs-m-char-name" value="${esc(char.name || '')}">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.character-prompt">Character Prompt</span></label>
                    <textarea class="text_pole igs-m-char-prompt" rows="3"
                        placeholder="Describe this character for image generation..." data-i18n="[placeholder]igs.modal.attr.describe-this-character-for-image-generation">${esc(char.prompt || '')}</textarea>
                    <div class="igs-hint"><span data-i18n="igs.modal.text.use-a-name-that-matches-the-story-participant-appearance-is-a-starting-reference-explicit-">Use a name that matches the story participant. Appearance is a starting reference; explicit story changes take priority.</span></div>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.outfits">Outfits</span></label>
                    <div class="igs-hint"><span data-i18n="igs.modal.text.reference-options-not-proof-of-what-is-currently-worn-scene-defaults-follow-the-story-inst">Reference options, not proof of what is currently worn. Scene defaults follow the story instead of choosing or mixing outfits automatically.</span></div>
                    <div class="igs-m-outfits-container">
                        ${outfitsHtml}
                    </div>
                    <div class="menu_button menu_button_icon igs-m-outfit-add" style="margin-top: 4px; padding: 3px 12px; font-size: 0.85em;">
                        <i class="fa-solid fa-plus"></i>
                        <span><span data-i18n="igs.modal.text.add-outfit">Add Outfit</span></span>
                    </div>
                </div>
                <div class="igs-modal-field" style="margin-top: 12px;">
                    <div class="menu_button menu_button_icon igs-m-char-delete" title="Delete Character" data-i18n="[title]igs.modal.attr.delete-character" style="color: #f44336;">
                        <i class="fa-solid fa-trash-can"></i>
                        <span><span data-i18n="igs.modal.text.delete-character">Delete Character</span></span>
                    </div>
                </div>
            </div>
        `;
    } else {
        editorHtml = '<div class="igs-modal-editor-placeholder"><span data-i18n="igs.modal.text.select-a-character-from-the-list-to-edit">Select a character from the list to edit.</span></div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup(tr('igs.modal.group.characterCollection', 'Character collection'), `
            <div class="igs-profile-bar">
                <select id="igs_m_char_profile_select" class="text_pole">${charProfileOptions}</select>
                <div class="igs-profile-actions">
                    <div class="menu_button" id="igs_m_char_profile_add" title="Add Character Profile" data-i18n="[title]igs.modal.attr.add-character-profile"><i class="fa-solid fa-plus"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_duplicate" title="Duplicate" data-i18n="[title]igs.modal.attr.duplicate"><i class="fa-solid fa-copy"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_rename" title="Rename" data-i18n="[title]igs.modal.attr.rename"><i class="fa-solid fa-pencil"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_delete" title="Delete" data-i18n="[title]igs.modal.attr.delete"><i class="fa-solid fa-trash-can"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_export" title="Export" data-i18n="[title]igs.modal.attr.export"><i class="fa-solid fa-file-export"></i></div>
                    <div class="menu_button" id="igs_m_char_profile_import" title="Import" data-i18n="[title]igs.modal.attr.import"><i class="fa-solid fa-file-import"></i></div>
                </div>
                <input type="file" id="igs_m_char_profile_import_file" accept=".json" style="display:none;">
            </div>
            `, tr('igs.modal.description.styleCollection', 'Choose a collection and manage its saved profiles.'))}

            ${renderSettingsGroup(tr('igs.modal.group.charactersInCollection', 'Characters in this collection'), `
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.character-list">Character list</span></div>
                    ${listItems}
                    <div class="menu_button menu_button_icon igs-m-char-add" style="width:100%; margin-top: 6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span><span data-i18n="igs.modal.text.add-character">Add Character</span></span>
                    </div>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.character-details">Character details</span></div>
                    ${editorHtml}
                </div>
            </div>
            `, tr('igs.modal.description.charactersInCollection', 'Select a character to edit its reference and optional outfits.'))}
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
        const name = prompt(tr('igs.modal.character.newProfilePrompt', 'New character profile name:'));
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
        const newName = prompt(tr('igs.modal.character.renameProfilePrompt', 'Rename character profile:'), settings.characterProfiles[id].name);
        if (!newName) return;
        renameCharacterProfile(id, newName);
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_char_profile_delete', () => {
        const id = profile.activeCharacterProfileId;
        if (!id) return;
        if (!confirm(tr('igs.modal.character.confirmDeleteProfile', 'Delete this character profile?'))) return;
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
                toastr.success(tr('igs.modal.character.imported', 'Imported character profile: {name}', { name: imported.name }));
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
        modal.find(`.igs-modal-list-item[data-index="${selectedCharIndex}"] span`).text($(this).val() || tr('igs.modal.value.unnamed', '(Unnamed)'));
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
        if (!confirm(tr('igs.modal.character.confirmDelete', 'Delete character "{name}"?', { name: chars[selectedCharIndex].name }))) return;
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
        listItems = '<div class="igs-modal-empty-msg"><span data-i18n="igs.modal.text.no-lora-entries-click-add-lora-to-create-one">No LoRA entries. Click + Add LoRA to create one.</span></div>';
    } else {
        entries.forEach((entry, idx) => {
            const label = entry.description || (entry.triggers?.[0]) || tr('igs.modal.value.unnamedLora', '(Unnamed LoRA)');
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
                        <span><span data-i18n="igs.modal.text.enabled">Enabled</span></span>
                    </label>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.description">Description</span></label>
                    <input type="text" class="text_pole igs-m-lora-desc" value="${esc(entry.description || '')}"
                        placeholder="e.g. detailed cybernetic arm" data-i18n="[placeholder]igs.modal.attr.e-g-detailed-cybernetic-arm">
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.prompt-content">Prompt / Content</span></label>
                    <textarea class="text_pole igs-m-lora-prompt" rows="3"
                        placeholder="e.g. <lora:cyber_arm:1.0>, cybernetic details" data-i18n="[placeholder]igs.modal.attr.e-g-lora-cyber-arm-1-0-cybernetic-details">${esc(entry.prompt || '')}</textarea>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-toggle-row">
                        <input type="checkbox" class="checkbox igs-m-lora-casesensitive" ${entry.caseSensitive ? 'checked' : ''}>
                        <span><span data-i18n="igs.modal.text.case-sensitive">Case Sensitive</span></span>
                    </label>
                </div>
                <div class="igs-modal-field">
                    <label class="igs-field-label"><span data-i18n="igs.modal.text.trigger-words">Trigger Words</span></label>
                    <div class="igs-trigger-tags">
                        ${triggerTags}
                    </div>
                    <div class="igs-trigger-input-container">
                        <input type="text" class="text_pole igs-m-lora-new-trigger" placeholder="Add trigger word..." data-i18n="[placeholder]igs.modal.attr.add-trigger-word">
                        <div class="menu_button igs-m-lora-add-trigger"><span data-i18n="igs.modal.text.add">Add</span></div>
                    </div>
                </div>
                <div class="igs-modal-field" style="margin-top: 12px;">
                    <div class="menu_button menu_button_icon igs-m-lora-delete" title="Delete LoRA" data-i18n="[title]igs.modal.attr.delete-lora" style="color: #f44336;">
                        <i class="fa-solid fa-trash-can"></i>
                        <span><span data-i18n="igs.modal.text.delete-lora">Delete LoRA</span></span>
                    </div>
                </div>
            </div>
        `;
    } else {
        editorHtml = '<div class="igs-modal-editor-placeholder"><span data-i18n="igs.modal.text.select-a-lora-from-the-list-to-edit">Select a LoRA from the list to edit.</span></div>';
    }

    return `
        <div class="igs-modal-section">
            ${renderSettingsGroup(tr('igs.modal.group.loraCollection', 'LoRA collection'), `
            <div class="igs-profile-bar">
                <select id="igs_m_lora_profile_select" class="text_pole">${loraProfileOptions}</select>
                <div class="igs-profile-actions">
                    <div class="menu_button" id="igs_m_lora_profile_add" title="Add LoRA Profile" data-i18n="[title]igs.modal.attr.add-lora-profile"><i class="fa-solid fa-plus"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_duplicate" title="Duplicate" data-i18n="[title]igs.modal.attr.duplicate"><i class="fa-solid fa-copy"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_rename" title="Rename" data-i18n="[title]igs.modal.attr.rename"><i class="fa-solid fa-pencil"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_delete" title="Delete" data-i18n="[title]igs.modal.attr.delete"><i class="fa-solid fa-trash-can"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_export" title="Export" data-i18n="[title]igs.modal.attr.export"><i class="fa-solid fa-file-export"></i></div>
                    <div class="menu_button" id="igs_m_lora_profile_import" title="Import" data-i18n="[title]igs.modal.attr.import"><i class="fa-solid fa-file-import"></i></div>
                </div>
                <input type="file" id="igs_m_lora_profile_import_file" accept=".json" style="display:none;">
            </div>
            `, tr('igs.modal.description.styleCollection', 'Choose a collection and manage its saved profiles.'))}

            ${renderSettingsGroup(tr('igs.modal.group.scanBehavior', 'Scan behavior'), `
            <div class="igs-modal-field">
                <label class="igs-field-label" for="igs_m_lora_depth"><span data-i18n="igs.modal.text.lora-scan-depth">LoRA Scan Depth</span></label>
                <input type="number" id="igs_m_lora_depth" class="text_pole"
                    min="1" max="50" value="${profile.loras?.depth || 1}">
                <div class="igs-hint"><span data-i18n="igs.modal.text.number-of-recent-messages-to-scan-for-trigger-words">Number of recent messages to scan for trigger words.</span></div>
            </div>
            `)}

            ${renderSettingsGroup(tr('igs.modal.group.lorasInCollection', 'LoRAs in this collection'), `
            <div class="igs-modal-list-editor">
                <div class="igs-modal-item-list">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.lora-list">LoRA list</span></div>
                    ${listItems}
                    <div class="menu_button menu_button_icon igs-m-lora-add" style="width:100%; margin-top: 6px;">
                        <i class="fa-solid fa-plus"></i>
                        <span><span data-i18n="igs.modal.text.add-lora">Add LoRA</span></span>
                    </div>
                </div>
                <div class="igs-modal-item-editor">
                    <div class="igs-modal-item-list-header"><span data-i18n="igs.modal.text.lora-details">LoRA details</span></div>
                    ${editorHtml}
                </div>
            </div>
            `, tr('igs.modal.description.lorasInCollection', 'Select a LoRA to edit its trigger words and prompt content.'))}
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
        const name = prompt(tr('igs.modal.lora.newProfilePrompt', 'New LoRA profile name:'), tr('igs.modal.lora.newProfileName', 'New LoRA Profile'));
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
        const newName = prompt(tr('igs.modal.lora.renameProfilePrompt', 'Rename LoRA profile:'), settings.loraProfiles[id].name);
        if (!newName) return;
        renameLoraProfile(id, newName);
        renderActiveTab();
    });

    modal.on('click.igstab', '#igs_m_lora_profile_delete', () => {
        const id = profile.activeLoraProfileId;
        if (!id) return;
        if (!confirm(tr('igs.modal.lora.confirmDeleteProfile', 'Delete this LoRA profile?'))) return;
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
                toastr.success(tr('igs.modal.lora.imported', 'Imported LoRA profile: {name}', { name: lp.name }));
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
        const label = $(this).val() || (entry.triggers?.[0]) || tr('igs.modal.value.unnamedLora', '(Unnamed LoRA)');
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
        if (!confirm(tr('igs.modal.lora.confirmDeleteEntry', 'Delete this LoRA entry?'))) return;
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
        content.html(localizeHtml('<div class="igs-modal-section"><h3><span data-i18n="igs.modal.text.unknown-tab">Unknown Tab</span></h3></div>'));
        return;
    }

    const tab = TABS.find(item => item.id === activeTabId);
    content.html(localizeHtml(`
        <header class="igs-settings-category-header">
            <div class="igs-settings-category-icon"><i class="fa-solid ${tab.icon}" aria-hidden="true"></i></div>
            <div><h2>${tr(tab.labelKey, tab.label)}</h2><p>${tr(tab.descriptionKey, tab.description)}</p></div>
        </header>
        ${entry.render()}
    `));
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
        mount.empty().append(localizeHtml(buildModalShell()));
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
