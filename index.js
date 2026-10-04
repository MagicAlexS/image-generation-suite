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
    initSettings
} from './src/profiles.js';

import {
    initDetection,
    triggerDetection
} from './src/detection.js';

import { applyPromptGetters } from './src/insertion.js';
import { openSettingsModal, refreshModalUI } from './src/settingsModal.js';

import { eventSource, event_types } from '../../../../script.js';
import { getContext } from '../../../extensions.js';

import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';

const extensionName = 'image-generation-suite';
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

/**
 * Populates the profile dropdown select element with all stored profiles.
 */
function populateProfileSelect() {
    const settings = getSettings();
    const select = $('#igs_profile_select');
    select.empty();

    Object.keys(settings.profiles).forEach(id => {
        const profile = settings.profiles[id];
        select.append($('<option>', { value: profile.id, text: profile.name }));
    });

    select.val(settings.activeProfileId);
}

/**
 * Populates the character selector in Quick Controls.
 */
function populateFloatingCharacterSelect() {
    const settings = getSettings();
    const profile = getActiveProfile();
    const select = $('#igs_hub_character_select');
    if (!select.length) return;
    select.empty();

    select.append($('<option>', { value: '', text: '(None)' }));

    const charProfileId = profile?.activeCharacterProfileId;
    const charProfile = charProfileId && settings.characterProfiles?.[charProfileId];
    const characters = charProfile?.characters || [];

    characters.forEach(char => {
        select.append($('<option>', { value: char.id, text: char.name || '(Unnamed)' }));
    });

    select.val(profile?.activeCharacterId || '');
}

/**
 * Populates the styles select dropdown inside the floating picker window based on the active Styles Profile.
 */
function populateFloatingStyleSelect() {
    const settings = getSettings();
    const profile = getActiveProfile();
    const container = $('#igs_custom_style_select .igs-custom-select-options');
    const trigger = $('#igs_custom_style_select .igs-custom-select-trigger span');
    
    if (!container.length) return;
    container.empty();

    const activeStyle = profile?.activeStyleName || 'Default';
    
    container.append(`
        <div class="igs-custom-select-option${activeStyle === 'Default' ? ' selected' : ''}" data-value="Default">
            Default (No Style)
        </div>
    `);

    let selectedText = 'Default (No Style)';

    if (profile && profile.activeStyleProfileId && settings.styleProfiles) {
        const stylesProfile = settings.styleProfiles[profile.activeStyleProfileId];
        if (stylesProfile && stylesProfile.styles) {
            stylesProfile.styles.forEach(s => {
                const isSelected = activeStyle === s.name;
                if (isSelected) {
                    selectedText = s.name;
                }
                container.append(`
                    <div class="igs-custom-select-option${isSelected ? ' selected' : ''}" data-value="${s.name}">
                        ${s.name}
                    </div>
                `);
            });
        }
    }

    trigger.text(selectedText);
}

/**
 * Renders controls for each user custom macro in Quick Controls.
 * Called from updateFloatingWindow() to keep the macro controls in sync with the profile.
 */
function populateHubMacros() {
    const container = $('#igs_hub_macros_container');
    if (!container.length) return;

    const profile = getActiveProfile();
    const macros = profile?.customMacros || [];

    if (macros.length === 0) {
        container.html('<div class="igs-hub-macros-empty"><small>No custom macros defined.<br>Add them in Settings → Prompt Injection.</small></div>').show();
        return;
    }

    let html = '';
    macros.forEach((macro, i) => {
        html += `<div class="igs-hub-macro-row" data-macro-index="${i}">`;
        html += `<label><small>${macro.id}:</small></label>`;

        switch (macro.type) {
            case 'list':
                html += `<select class="text_pole igs-hub-macro-select" data-macro-index="${i}">`;
                (macro.options || []).forEach((opt, oi) => {
                    let displayLabel;
                    if (typeof opt === 'object') {
                        displayLabel = opt.label || opt.text || `Option ${oi + 1}`;
                    } else {
                        displayLabel = opt || `Option ${oi + 1}`;
                    }
                    if (displayLabel.length > 40) displayLabel = displayLabel.substring(0, 37) + '...';
                    html += `<option value="${oi}" ${macro.value === oi ? 'selected' : ''}>${displayLabel}</option>`;
                });
                html += '</select>';
                break;
            case 'bool':
                html += `<label class="igs-hub-macro-bool">`;
                html += `<input type="checkbox" class="checkbox igs-hub-macro-checkbox" data-macro-index="${i}" ${macro.value ? 'checked' : ''}>`;
                html += `<small>${macro.value ? 'ON' : 'OFF'}</small>`;
                html += `</label>`;
                break;
            case 'int':
                html += `<input type="number" class="text_pole igs-hub-macro-number" data-macro-index="${i}" value="${macro.value ?? 0}" min="${macro.min ?? 0}" max="${macro.max ?? 100}" step="${macro.step ?? 1}">`;
                break;
            case 'float':
                html += `<input type="number" class="text_pole igs-hub-macro-number" data-macro-index="${i}" value="${macro.value ?? 0}" min="${macro.min ?? 0}" max="${macro.max ?? 1}" step="${macro.step ?? 0.1}">`;
                break;
        }

        html += '</div>';
    });

    container.html(html).show();
}

/** Refreshes quick controls that depend on the active style and custom macros. */
function updateFloatingWindow() {
    const settings = getSettings();
    $('#igs_m_hub_show_previews').prop('checked', !!settings.style_show_previews);
    const profile = getActiveProfile();
    const previewContainer = $('#igs_window_preview_container');
    const style = profile?.activeStyleName && profile.activeStyleName !== 'Default'
        && profile.activeStyleProfileId && settings.styleProfiles?.[profile.activeStyleProfileId]?.styles
        ?.find(item => item.name === profile.activeStyleName);
    if (settings.style_show_previews && style?.preview_image) {
        $('#igs_window_preview_img').attr('src', style.preview_image).show();
        $('.igs-window-preview-img-wrapper').show();
        $('#igs_window_desc').text(style.description || '');
        previewContainer.show();
    } else {
        previewContainer.hide();
        $('#igs_window_preview_img').attr('src', '');
    }

    // Refresh macro controls only when the active profile or its definitions change.
    populateHubMacros();
}

/**
 * Registers the /suitehub slash command to toggle the Suite Hub window visibility.
 */
function registerSlashCommand() {
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'suitehub',
        aliases: ['igs-hub'],
        returns: 'opens the Image Generation Suite quick controls',
        helpString: 'Opens the Image Generation Suite quick controls in the extension drawer.',
        callback: () => {
            revealExtensionSettings(() => {
                openSettingsModal(getSettingsCallbacks(), 'suite-hub');
                document.getElementById('igs_settings_root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            return '';
        }
    }));
    console.log('[IGS] Registered slash command /suitehub');

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'suitetrigger',
        aliases: ['igs-trigger'],
        returns: 're-reads the latest character message to scan for tags and generate images',
        helpString: 'Re-scans the latest character message for image tags and runs generation.',
        callback: () => {
            triggerDetection();
            return '';
        }
    }));
    console.log('[IGS] Registered slash command /suitetrigger');
}

function getSettingsCallbacks() {
    return {
        onProfileSwitch: updateUIValues,
        updateFloatingWindow,
        populateFloatingStyleSelect,
        populateFloatingCharacterSelect
    };
}

function revealExtensionSettings(onReady) {
    if ($('#rm_extensions_block').hasClass('closedDrawer')) {
        $('#extensions-settings-button .drawer-toggle').trigger('click');
    }

    setTimeout(() => {
        const container = $('.igs-container').first();
        const drawerContent = container.find('.inline-drawer-content').first();
        const drawerHeader = container.find('.inline-drawer-header').first();
        if (drawerContent.is(':hidden') && drawerHeader.length) drawerHeader.trigger('click');

        setTimeout(() => {
            if (container.length) {
                $('#rm_extensions_block').animate({
                    scrollTop: container.offset().top - $('#rm_extensions_block').offset().top + $('#rm_extensions_block').scrollTop()
                }, 350);
            }
            if (onReady) onReady();
        }, 100);
    }, 500);
}

/**
 * Scans the current chat history and binds dynamic prompt getters to any message cards
 * containing custom raw prompts.
 */
function scanAndApplyGetters() {
    const context = getContext();
    const chat = context.chat || [];
    chat.forEach(message => {
        if (message && message.extra && message.extra.raw_prompt) {
            applyPromptGetters(message);
        }
    });
}

/**
 * Updates all inline controls to match the active profile configuration.
 */
function updateUIValues() {
    const profile = getActiveProfile();
    if (!profile) return;

    // Profile Bar select (drawer)
    populateProfileSelect();

    // Enable extension toggle (drawer)
    $('#igs_extension_enabled').prop('checked', !!profile.prompt.enabled);

    // Re-render the selected settings page for the switched profile; Quick Controls
    // are populated by renderActiveTab after their fields are inserted.
    refreshModalUI();
}

/**
 * Sets up profile-related action click bindings.
 */
function setupProfileEvents() {
    $('#igs_profile_select').on('change', function () {
        const id = $(this).val();
        setActiveProfile(id);
        updateUIValues();
    });

    $('#igs_profile_add').on('click', function () {
        const name = prompt('Enter a name for the new profile:');
        if (!name || name.trim() === '') return;
        createProfile(name.trim());
        updateUIValues();
    });

    $('#igs_profile_duplicate').on('click', function () {
        const profile = getActiveProfile();
        if (!profile) return;
        duplicateProfile(profile.id);
        updateUIValues();
    });

    $('#igs_profile_rename').on('click', function () {
        const profile = getActiveProfile();
        if (!profile) return;
        const newName = prompt('Enter a new name for the profile:', profile.name);
        if (!newName || newName.trim() === '' || newName.trim() === profile.name) return;
        renameProfile(profile.id, newName.trim());
        updateUIValues();
    });

    $('#igs_profile_delete').on('click', function () {
        const profile = getActiveProfile();
        if (!profile) return;
        if (confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
            deleteProfile(profile.id);
            updateUIValues();
        }
    });

    $('#igs_profile_export').on('click', function () {
        exportAllProfiles();
    });

    $('#igs_profile_import').on('click', function () {
        $('#igs_profile_import_file').trigger('click');
    });

    $('#igs_profile_import_file').on('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
            const success = importProfiles(evt.target.result);
            if (success) {
                toastr.success('Profiles imported successfully!');
                updateUIValues();
            }
            $('#igs_profile_import_file').val('');
        };
        reader.readAsText(file);
    });
}

/**
 * Sets up drawer-level UI bindings and inline quick control events.
 */
function setupUI() {
    setupProfileEvents();

    // Enable extension toggle (maps to prompt.enabled)
    $('#igs_extension_enabled').on('change', function () {
        const enabled = $(this).prop('checked');
        getActiveProfile().prompt.enabled = enabled;
        saveProfiles();
    });

    // === Inline quick controls ===

    // Toggle custom style select dropdown menu visibility
    $(document).on('click.igs-custom-select', '#igs_custom_style_select .igs-custom-select-trigger', function(e) {
        e.stopPropagation();
        const options = $(this).siblings('.igs-custom-select-options');
        
        // Close other dropdowns if any, then toggle this one
        $('.igs-custom-select-options').not(options).removeClass('open');
        options.toggleClass('open');
    });

    // Close style selector dropdown menu if clicked anywhere else
    $(document).on('click.igs-custom-select-close', function() {
        $('.igs-custom-select-options').removeClass('open');
    });

    // Selection click event on custom option items
    $(document).on('click.igs-custom-select-opt', '#igs_custom_style_select .igs-custom-select-option', function() {
        const val = $(this).data('value');
        const profile = getActiveProfile();
        profile.activeStyleName = val;
        saveProfiles();

        // Hide hover preview tooltip immediately on selection
        $('#igs_dropdown_preview_tooltip').hide().find('img').attr('src', '');

        // Update UI
        populateFloatingStyleSelect();
        updateFloatingWindow();
    });

    // Cursor-attached hover preview tooltip mouse enter, move, and leave listeners
    $(document).on('mouseenter.igs-custom-select-hover', '#igs_custom_style_select .igs-custom-select-option', function() {
        const val = $(this).data('value');
        const profile = getActiveProfile();
        const settings = getSettings();
        
        let previewImg = '';
        if (val !== 'Default' && profile && profile.activeStyleProfileId && settings.styleProfiles) {
            const stylesProfile = settings.styleProfiles[profile.activeStyleProfileId];
            const style = stylesProfile?.styles?.find(s => s.name === val);
            if (style && style.preview_image) {
                previewImg = style.preview_image;
            }
        }

        const tooltip = $('#igs_dropdown_preview_tooltip');
        if (previewImg && tooltip.length) {
            tooltip.find('img').attr('src', previewImg);
            tooltip.show();
        } else {
            tooltip.hide();
        }
    });

    $(document).on('mousemove.igs-custom-select-hover', '#igs_custom_style_select .igs-custom-select-option', function(e) {
        const tooltip = $('#igs_dropdown_preview_tooltip');
        if (tooltip.is(':visible')) {
            tooltip.css({
                top: (e.clientY + 15) + 'px',
                left: (e.clientX + 15) + 'px'
            });
        }
    });

    $(document).on('mouseleave.igs-custom-select-hover', '#igs_custom_style_select .igs-custom-select-option', function() {
        $('#igs_dropdown_preview_tooltip').hide().find('img').attr('src', '');
    });

    // Hub footer: Re-trigger image generation
    $(document).on('click', '#igs_hub_retrigger', function() {
        triggerDetection();
    });

    // Hub macro controls
    $('#igs_settings_panel').on('change.igsmacro', '.igs-hub-macro-select', function() {
        const idx = parseInt($(this).data('macro-index'), 10);
        const profile = getActiveProfile();
        if (profile.customMacros && profile.customMacros[idx]) {
            profile.customMacros[idx].value = parseInt($(this).val(), 10);
            saveProfiles();
        }
    });

    $('#igs_settings_panel').on('change.igsmacro', '.igs-hub-macro-checkbox', function() {
        const idx = parseInt($(this).data('macro-index'), 10);
        const profile = getActiveProfile();
        if (profile.customMacros && profile.customMacros[idx]) {
            profile.customMacros[idx].value = $(this).prop('checked');
            $(this).siblings('small').text(profile.customMacros[idx].value ? 'ON' : 'OFF');
            saveProfiles();
        }
    });

    $('#igs_settings_panel').on('input.igsmacro', '.igs-hub-macro-number', function() {
        const idx = parseInt($(this).data('macro-index'), 10);
        const profile = getActiveProfile();
        if (profile.customMacros && profile.customMacros[idx]) {
            const macro = profile.customMacros[idx];
            let val = parseFloat($(this).val());
            if (isNaN(val)) return;
            if (macro.min !== undefined) val = Math.max(macro.min, val);
            if (macro.max !== undefined) val = Math.min(macro.max, val);
            macro.value = macro.type === 'int' ? Math.round(val) : val;
            saveProfiles();
        }
    });

    // Mount the inline settings once, then synchronize the active profile.
    openSettingsModal(getSettingsCallbacks());
    updateUIValues();
}

// Initialise the extension on document ready
$(function () {
    (async function () {
        // Initialise settings and active profile structure
        initSettings();

        // Retrieve settings HTML
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // Append extension to main settings menu dropdown
        $('#extensionsMenu').append(`
            <div id="igs_extension_menu" class="list-group-item flex-container flexGap5">
                <div class="fa-solid fa-image"></div>
                <span data-i18n="Image Generation Suite">Image Gen Suite</span>
            </div>
        `);

        // Click handler to open the extensions drawer and scroll to the settings panel
        $('#igs_extension_menu').on('click', function () {
            revealExtensionSettings(() => openSettingsModal(getSettingsCallbacks(), 'suite-hub'));
        });

        // Create target container for extension settings if not exists
        if (!$('#igs_settings_container').length) {
            $('#extensions_settings2').append('<div id="igs_settings_container" class="extension_container"></div>');
        }

        // Insert settings panel HTML content
        $('#igs_settings_container').empty().append(settingsHtml);

        // Inject floating hover tooltip for dropdown previews
        if (!$('#igs_dropdown_preview_tooltip').length) {
            $('body').append('<div id="igs_dropdown_preview_tooltip" style="display:none;"><img src="" alt="Preview"></div>');
        }

        // Register slash commands
        registerSlashCommand();

        // Bind UI input handlers and load settings
        setupUI();

        // Initialise prompt injection and detection pipeline listeners
        initDetection();

        // Scan current chat history and register event listeners to re-apply getters on chat load
        scanAndApplyGetters();
        eventSource.on(event_types.CHAT_LOADED, scanAndApplyGetters);

        console.log('[IGS] Image Generation Suite extension loaded successfully.');
    })();
});


