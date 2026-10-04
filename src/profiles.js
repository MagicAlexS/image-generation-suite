import { extension_settings } from '../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../script.js';
import { DEFAULT_SCENE_PROMPT, DEFAULT_CHARACTER_PROMPT, upgradePromptDefaults } from './promptTemplates.js';

const EXTENSION_NAME = 'image-generation-suite';

/**
 * Returns a new profile object with all default values filled in.
 * @param {string} name - The display name for the profile.
 * @returns {object} A fresh profile object with a unique ID and default settings.
 */
export function getDefaultProfile(name) {
    const id = crypto.randomUUID();
    return {
        id,
        name: name || 'Default',
        prompt: {
            enabled: true,
            template: DEFAULT_SCENE_PROMPT,
            frequency: 1,
            position: 'deep_system',
            depth: 0,
            messageCounter: 0,
        },
        settings: {
            insertType: 'new_message',
            regex: '/<pic="(.*?)"\\s*\\/?\\s*>/g',
            hideFromLLM: true,
        },
        connection: {
            serverType: 'comfy',
            comfyUrl: 'http://127.0.0.1:8188',
            autoUrl: 'http://localhost:7860',
            autoAuth: '',
            model: '',
            vae: '',
            sampler: '',
            scheduler: '',
            steps: 20,
            cfgScale: 7,
            width: 512,
            height: 512,
            denoisingStrength: 0.7,
            clipSkip: 1,
            seed: -1,
            comfyWorkflow: '',
        },
        activeStyleProfileId: '',
        activeStyleName: 'Default',
        activeCharacterProfileId: '',
        activeCharacterId: '',
        hub: {
            promptExtra: '',
            negativeExtra: '',
        },
        aiLora: {
            enabled: false,
            minMatches: 0,
            maxMatches: 3,
            connectionProfileId: '',
            prompt: ''
        },
        promptConstruction: {
            prefix: 'best quality, absurdres, aesthetic,',
            negativePrefix: 'lowres, bad anatomy, bad hands, text, error, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
            suffix: '',
            negativeSuffix: '',
            positiveTemplate: '{prefix}, {prompt}, {promptExtra}, {style}, {loras}, {suffix}',
            negativeTemplate: '{negativePrefix}, {negative}, {negativeExtra}, {negativeSuffix}',
            characterDefining: DEFAULT_CHARACTER_PROMPT,
        },
        loras: {
            depth: 1,
            entries: [],
        },
              "customMacros": [
        {
          "id": "perspective",
          "type": "list",
          "value": 0,
          "options": [
            {
              "label": "POV User",
              "text": "* Generate the image from {{user}}'s first-person perspective unless the scene explicitly requires otherwise.\n* Show only body parts that would naturally be visible from this viewpoint, such as hands, arms, legs, or feet when appropriate.\n* Do not depict {{user}}'s face or full body unless it is naturally visible through a reflection or another justified viewpoint."
            },
            {
              "label": "POV Char",
              "text": "* Generate the image from {{char}}'s first-person perspective unless the scene explicitly requires otherwise.\n* Show only body parts that would naturally be visible from this viewpoint, such as hands, arms, legs, or feet when appropriate.\n* Do not depict {{char}}'s face or full body unless it is naturally visible through a reflection or another justified viewpoint."
            },
            {
              "label": "non-POV",
              "text": "* Generate the image from an external third-person viewpoint showing both {{char}} and {{user}}, unless the scene explicitly requires a different perspective."
            }
          ]
        },
        {
          "id": "minwords",
          "type": "int",
          "value": 120,
          "options": [
            {
              "label": "Option 1",
              "text": ""
            }
          ],
          "min": 20,
          "max": 300,
          "step": 1
        },
        {
          "id": "maxwords",
          "type": "int",
          "value": 500,
          "options": [
            {
              "label": "Option 1",
              "text": ""
            }
          ],
          "min": 100,
          "max": 1000,
          "step": 1
        },
        {
          "id": "camera",
          "type": "list",
          "value": 4,
          "options": [
            {
              "label": "Portrait",
              "text": "* Frame the image like a character portrait.\n* Prioritize the face, expression, hair, and upper body."
            },
            {
              "label": "Full Body",
              "text": "* Frame the image to show the entire body and clothing clearly."
            },
            {
              "label": "Cinematic",
              "text": "* Frame the image like a movie shot.\n* Include environmental context and dramatic composition."
            },
            {
              "label": "Close-up",
              "text": "* Use a close-up composition focused on facial expression and fine details."
            },
            {
              "label": "default",
              "text": "* Decide the camera based on the context"
            }
          ]
        },
        {
          "id": "mood",
          "type": "list",
          "value": 4,
          "options": [
            {
              "label": "Warm",
              "text": "* Use warm, soft lighting and a comfortable atmosphere."
            },
            {
              "label": "Dark Dramatic",
              "text": "* Use moody low-key lighting with strong shadows and cinematic contrast."
            },
            {
              "label": "Horror",
              "text": "* Use unsettling atmosphere, darker lighting, and ominous visual elements."
            },
            {
              "label": "Romantic",
              "text": "* Use soft lighting and intimate visual composition."
            },
            {
              "label": "default",
              "text": "* Decide the mood/lighting based on the context"
            }
          ]
        },
        {
          "id": "tone",
          "type": "list",
          "value": 3,
          "options": [
            {
              "label": "Normal",
              "text": "* Keep the scene focused on everyday visual storytelling."
            },
            {
              "label": "Action",
              "text": "* Emphasize movement, dynamic poses, and dramatic composition."
            },
            {
              "label": "Adult",
              "text": "* Explicitly describe visible anatomy, nudity, and sexual details when present."
            },
            {
              "label": "Default",
              "text": "* Decide the tone based on the context"
            }
          ]
        },
        {
          "id": "focus",
          "type": "list",
          "value": 3,
          "options": [
            {
              "label": "Character",
              "text": "* Prioritize the main character's appearance, expression, and clothing.\n* Minimize background details."
            },
            {
              "label": "Scene",
              "text": "* Prioritize the environment and interaction between characters.\n* Include enough context to understand the situation."
            },
            {
              "label": "Group",
              "text": "* Clearly describe the positions and appearances of all visible characters."
            },
            {
              "label": "Default",
              "text": "* Decide the focus based on the context"
            }
          ]
        },
        {
          "id": "environment",
          "type": "list",
          "value": 2,
          "options": [
            {
              "label": "Simple",
              "text": "* Keep the background simple and unobtrusive."
            },
            {
              "label": "Detailed",
              "text": "* Include important environmental details, architecture, objects, and atmosphere."
            },
            {
              "label": "Default",
              "text": "* Decide the background detail importance based on the context"
            }
          ]
        }
      ],
    };
}

/**
 * Initializes the extension settings with a default structure and one default profile
 * if they don't already exist.
 */
export function initSettings() {
    const defaultStyleProfileId = crypto.randomUUID();
    const defaultStylesList = [
        {
            name: "Evilbaka",
            description: "A stylized anime/manga look",
            preview_image: "",
            content: "<lora:EvilbakaIlv3:1>, 3d, realistic, ebaka"
        },
        {
            name: "Illumination",
            description: "Illumination studios animation style",
            preview_image: "",
            content: "<lora:Illumination_StyleIllustMK3V2:1>, Illuminationstyle, 3D"
        }
    ];

    if (extension_settings[EXTENSION_NAME] && Object.keys(extension_settings[EXTENSION_NAME]).length > 0) {
        const settings = extension_settings[EXTENSION_NAME];
        let changed = false;

        // Migrate styles settings to styleProfiles if missing
        if (!settings.styleProfiles) {
            const legacyStyles = settings.styles || defaultStylesList;
            const newProfileId = crypto.randomUUID();
            
            settings.styleProfiles = {
                [newProfileId]: {
                    id: newProfileId,
                    name: 'Styles Default',
                    styles: legacyStyles
                }
            };
            settings.activeStyleProfileId = newProfileId;
            settings.style_show_window = typeof settings.style_show_window !== 'undefined' ? settings.style_show_window : false;
            settings.style_show_previews = typeof settings.style_show_previews !== 'undefined' ? settings.style_show_previews : true;
            settings.window_position = settings.window_position || { top: 100, left: 100 };
            
            delete settings.styles;
            changed = true;
        }

        // Migrate lora settings to loraProfiles if missing
        if (!settings.loraProfiles) {
            const newLoraProfileId = crypto.randomUUID();
            settings.loraProfiles = {
                [newLoraProfileId]: {
                    id: newLoraProfileId,
                    name: 'LoRA Default',
                    entries: []
                }
            };
            settings.activeLoraProfileId = newLoraProfileId;
            changed = true;
        }

        // Migrate character settings to characterProfiles if missing
        if (!settings.characterProfiles) {
            const newCharProfileId = crypto.randomUUID();
            settings.characterProfiles = {
                [newCharProfileId]: {
                    id: newCharProfileId,
                    name: 'Characters Default',
                    characters: []
                }
            };
            settings.activeCharacterProfileId = newCharProfileId;
            changed = true;
        }

        // Migrate existing profiles to promptConstruction and Styles Profiles
        Object.keys(settings.profiles).forEach(id => {
            const profile = settings.profiles[id];
            let profileChanged = false;

            if (!profile.aiLora) {
                profile.aiLora = {
                    enabled: false,
                    minMatches: 0,
                    maxMatches: 3,
                    connectionProfileId: '',
                    prompt: ''
                };
                profileChanged = true;
            }
            // Migrate pre-existing aiLora objects missing new fields
            if (profile.aiLora && typeof profile.aiLora.connectionProfileId === 'undefined') {
                profile.aiLora.connectionProfileId = '';
                profile.aiLora.prompt = '';
                profileChanged = true;
            }
            
            if (!profile.promptConstruction) {
                profile.promptConstruction = {
                    prefix: profile.style?.promptPrefix ?? 'best quality, absurdres, aesthetic,',
                    negativePrefix: profile.style?.negativePromptPrefix ?? 'lowres, bad anatomy, bad hands, text, error, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry',
                    suffix: '',
                    negativeSuffix: '',
                    positiveTemplate: '{prefix}, {prompt}, {style}, {suffix}, {loras}',
                    negativeTemplate: '{negativePrefix}, {negative}, {negativeSuffix}',
                };
                delete profile.style;
                profileChanged = true;
            }
            
            if (!profile.activeStyleProfileId) {
                profile.activeStyleProfileId = settings.activeStyleProfileId || Object.keys(settings.styleProfiles)[0];
                profileChanged = true;
            }
            
            if (typeof profile.activeStyleName === 'undefined') {
                profile.activeStyleName = 'Default';
                profileChanged = true;
            }

            if (!profile.activeCharacterProfileId) {
                // Move existing characters into the default character profile
                if (profile.characters && profile.characters.length > 0 && settings.characterProfiles) {
                    const defaultCharProfileId = settings.activeCharacterProfileId || Object.keys(settings.characterProfiles)[0];
                    if (settings.characterProfiles[defaultCharProfileId]) {
                        settings.characterProfiles[defaultCharProfileId].characters = profile.characters;
                    }
                }
                profile.activeCharacterProfileId = settings.activeCharacterProfileId || Object.keys(settings.characterProfiles)[0];
                delete profile.characters;
                profileChanged = true;
            }

            if (!profile.hub) {
                profile.hub = { promptExtra: '', negativeExtra: '' };
                profileChanged = true;
            }

            if (!profile.customMacros) {
                profile.customMacros = [];
                profileChanged = true;
            }

            if (profile.promptConstruction && typeof profile.promptConstruction.characterDefining === 'undefined') {
                profile.promptConstruction.characterDefining = DEFAULT_CHARACTER_PROMPT;
                profileChanged = true;
            }

            if (upgradePromptDefaults(profile)) {
                profileChanged = true;
            }

            if (!profile.activeLoraProfileId) {
                // Move existing lora entries into the default lora profile
                if (profile.loras && profile.loras.entries && profile.loras.entries.length > 0 && settings.loraProfiles) {
                    const defaultLoraProfileId = settings.activeLoraProfileId || Object.keys(settings.loraProfiles)[0];
                    if (settings.loraProfiles[defaultLoraProfileId]) {
                        settings.loraProfiles[defaultLoraProfileId].entries = profile.loras.entries;
                    }
                }
                profile.activeLoraProfileId = settings.activeLoraProfileId || Object.keys(settings.loraProfiles)[0];
                profileChanged = true;
            }

            if (profileChanged) changed = true;
        });

        if (changed) {
            saveSettingsDebounced();
            console.log('[IGS] Settings migrated successfully to Styles Profiles');
        }
        return;
    }

    const defaultLoraProfileId = crypto.randomUUID();
    const defaultCharProfileId = crypto.randomUUID();
    const defaultProfile = getDefaultProfile('Default');
    defaultProfile.activeStyleProfileId = defaultStyleProfileId;
    defaultProfile.activeLoraProfileId = defaultLoraProfileId;
    defaultProfile.activeCharacterProfileId = defaultCharProfileId;

    extension_settings[EXTENSION_NAME] = {
        version: 1,
        activeProfileId: defaultProfile.id,
        profiles: {
            [defaultProfile.id]: defaultProfile,
        },
        styleProfiles: {
            [defaultStyleProfileId]: {
                id: defaultStyleProfileId,
                name: 'Styles Default',
                styles: defaultStylesList
            }
        },
        activeStyleProfileId: defaultStyleProfileId,
        loraProfiles: {
            [defaultLoraProfileId]: {
                id: defaultLoraProfileId,
                name: 'LoRA Default',
                entries: []
            }
        },
        activeLoraProfileId: defaultLoraProfileId,
        characterProfiles: {
            [defaultCharProfileId]: {
                id: defaultCharProfileId,
                name: 'Characters Default',
                characters: []
            }
        },
        activeCharacterProfileId: defaultCharProfileId,
        style_show_window: false,
        style_show_previews: true,
        window_position: { top: 100, left: 100 }
    };

    saveSettingsDebounced();
    console.log('[IGS] Settings initialized with default profile and default styles profile');
}

/**
 * Returns the full settings object for the extension.
 * Ensures settings are initialized before returning.
 * @returns {object} The extension settings object.
 */
export function getSettings() {
    initSettings();
    return extension_settings[EXTENSION_NAME];
}

/**
 * Returns the currently active profile object.
 * Falls back to the first available profile if the active ID is invalid.
 * @returns {object} The active profile object.
 */
export function getActiveProfile() {
    const settings = getSettings();
    const { activeProfileId, profiles } = settings;

    if (activeProfileId && profiles[activeProfileId]) {
        return profiles[activeProfileId];
    }

    // Active profile ID is missing or invalid — fall back to the first available profile
    const profileIds = Object.keys(profiles);
    if (profileIds.length > 0) {
        const fallbackId = profileIds[0];
        settings.activeProfileId = fallbackId;
        console.log('[IGS] Active profile not found, falling back to:', fallbackId);
        return profiles[fallbackId];
    }

    // Should not happen if initSettings ran correctly, but handle defensively
    console.log('[IGS] No profiles exist — reinitializing settings');
    initSettings();
    return extension_settings[EXTENSION_NAME].profiles[extension_settings[EXTENSION_NAME].activeProfileId];
}

/**
 * Sets the active profile to the given ID and saves.
 * @param {string} id - The profile ID to set as active.
 */
export function setActiveProfile(id) {
    const settings = getSettings();
    settings.activeProfileId = id;
    saveSettingsDebounced();
    console.log('[IGS] Active profile set to:', id);
}

/**
 * Creates a new profile with default values and the given name.
 * The new profile is set as active and settings are saved.
 * @param {string} name - The display name for the new profile.
 * @returns {object} The newly created profile object.
 */
export function createProfile(name) {
    const settings = getSettings();
    const profile = getDefaultProfile(name);

    settings.profiles[profile.id] = profile;
    settings.activeProfileId = profile.id;
    saveSettingsDebounced();

    console.log('[IGS] Created new profile:', profile.name, profile.id);
    return profile;
}

/**
 * Deletes a profile by ID. Cannot delete the last remaining profile.
 * If the deleted profile was active, switches to another profile.
 * @param {string} id - The ID of the profile to delete.
 */
export function deleteProfile(id) {
    const settings = getSettings();
    const profileIds = Object.keys(settings.profiles);

    if (profileIds.length <= 1) {
        toastr.warning('Cannot delete the last remaining profile.');
        return;
    }

    if (!settings.profiles[id]) {
        toastr.warning('Profile not found.');
        return;
    }

    const deletedName = settings.profiles[id].name;
    delete settings.profiles[id];

    // If we just deleted the active profile, switch to another one
    if (settings.activeProfileId === id) {
        const remainingIds = Object.keys(settings.profiles);
        settings.activeProfileId = remainingIds[0];
        console.log('[IGS] Switched active profile to:', settings.activeProfileId);
    }

    saveSettingsDebounced();
    console.log('[IGS] Deleted profile:', deletedName, id);
}

/**
 * Deep clones a profile, assigns it a new UUID, appends '(Copy)' to its name,
 * sets it as active, and saves.
 * @param {string} id - The ID of the profile to duplicate.
 * @returns {object} The newly duplicated profile object.
 */
export function duplicateProfile(id) {
    const settings = getSettings();
    const source = settings.profiles[id];

    if (!source) {
        toastr.error('Source profile not found.');
        return null;
    }

    const clone = JSON.parse(JSON.stringify(source));
    clone.id = crypto.randomUUID();
    clone.name = `${source.name} (Copy)`;

    settings.profiles[clone.id] = clone;
    settings.activeProfileId = clone.id;
    saveSettingsDebounced();

    console.log('[IGS] Duplicated profile:', source.name, '->', clone.name, clone.id);
    return clone;
}

/**
 * Renames a profile and saves.
 * @param {string} id - The ID of the profile to rename.
 * @param {string} newName - The new display name.
 */
export function renameProfile(id, newName) {
    const settings = getSettings();
    const profile = settings.profiles[id];

    if (!profile) {
        toastr.warning('Profile not found.');
        return;
    }

    const oldName = profile.name;
    profile.name = newName;
    saveSettingsDebounced();

    console.log('[IGS] Renamed profile:', oldName, '->', newName);
}

/**
 * Exports all profiles and settings as a JSON file download.
 * Triggers a browser download of `image-generation-suite-profiles.json`.
 */
export function exportAllProfiles() {
    const settings = getSettings();
    const jsonString = JSON.stringify(settings, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'image-generation-suite-profiles.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    console.log('[IGS] Exported all profiles');
}

/**
 * Imports profiles from a JSON string. Validates the structure, replaces current
 * profiles, and sets the active profile.
 * @param {string} jsonString - A JSON string containing the exported settings.
 * @returns {boolean} True on success, false on error.
 */
export function importProfiles(jsonString) {
    try {
        const imported = JSON.parse(jsonString);

        if (typeof imported.version === 'undefined' || typeof imported.profiles === 'undefined') {
            toastr.error('Invalid profile data: missing "version" or "profiles" keys.');
            return false;
        }

        if (typeof imported.profiles !== 'object' || Object.keys(imported.profiles).length === 0) {
            toastr.error('Invalid profile data: "profiles" must be a non-empty object.');
            return false;
        }

        const settings = getSettings();
        settings.version = imported.version;
        settings.profiles = imported.profiles;

        // Import sub-profiles if present in the export
        if (imported.styleProfiles) {
            settings.styleProfiles = imported.styleProfiles;
            settings.activeStyleProfileId = imported.activeStyleProfileId || Object.keys(imported.styleProfiles)[0];
        }
        if (imported.loraProfiles) {
            settings.loraProfiles = imported.loraProfiles;
            settings.activeLoraProfileId = imported.activeLoraProfileId || Object.keys(imported.loraProfiles)[0];
        }
        if (imported.characterProfiles) {
            settings.characterProfiles = imported.characterProfiles;
            settings.activeCharacterProfileId = imported.activeCharacterProfileId || Object.keys(imported.characterProfiles)[0];
        }

        // Set active profile to the imported one, or fall back to the first available
        if (imported.activeProfileId && imported.profiles[imported.activeProfileId]) {
            settings.activeProfileId = imported.activeProfileId;
        } else {
            settings.activeProfileId = Object.keys(imported.profiles)[0];
        }

        // Apply the same conservative default migration to imported profiles.
        initSettings();

        saveSettingsDebounced();
        console.log('[IGS] Imported profiles successfully. Active profile:', settings.activeProfileId);
        return true;
    } catch (error) {
        console.error('[IGS] Failed to import profiles:', error);
        toastr.error('Failed to import profiles: ' + error.message);
        return false;
    }
}

/**
 * Saves the current profile settings by calling saveSettingsDebounced.
 */
export function saveProfiles() {
    saveSettingsDebounced();
}

/**
 * Adds a new styles profile.
 * @param {string} name - The name of the profile.
 * @param {Array} styles - Optional initial styles array.
 * @returns {object} The new styles profile object.
 */
export function addStyleProfile(name, styles = []) {
    const settings = getSettings();
    if (!settings.styleProfiles) settings.styleProfiles = {};

    const id = crypto.randomUUID();
    const newProfile = {
        id,
        name: name || 'New Styles Profile',
        styles: styles
    };

    settings.styleProfiles[id] = newProfile;
    saveProfiles();
    console.log('[IGS] Created style profile:', newProfile.name, id);
    return newProfile;
}

/**
 * Deletes a styles profile by ID.
 * @param {string} id - The ID to delete.
 */
export function deleteStyleProfile(id) {
    const settings = getSettings();
    if (!settings.styleProfiles) return;

    const ids = Object.keys(settings.styleProfiles);
    if (ids.length <= 1) {
        toastr.warning('Cannot delete the last remaining styles profile.');
        return;
    }

    delete settings.styleProfiles[id];

    // Reset active profile references if they used the deleted styles profile
    Object.keys(settings.profiles).forEach(pid => {
        const profile = settings.profiles[pid];
        if (profile.activeStyleProfileId === id) {
            profile.activeStyleProfileId = Object.keys(settings.styleProfiles)[0];
            profile.activeStyleName = 'Default';
        }
    });

    if (settings.activeStyleProfileId === id) {
        settings.activeStyleProfileId = Object.keys(settings.styleProfiles)[0];
    }

    saveProfiles();
    console.log('[IGS] Deleted style profile:', id);
}

/**
 * Renames a styles profile.
 * @param {string} id - The ID of the profile.
 * @param {string} newName - The new name.
 */
export function renameStyleProfile(id, newName) {
    const settings = getSettings();
    if (!settings.styleProfiles || !settings.styleProfiles[id]) return;

    settings.styleProfiles[id].name = newName;
    saveProfiles();
    console.log('[IGS] Renamed style profile:', id, '->', newName);
}

/**
 * Duplicates a styles profile.
 * @param {string} id - The ID of the profile to duplicate.
 * @returns {object} The duplicated style profile.
 */
export function duplicateStyleProfile(id) {
    const settings = getSettings();
    if (!settings.styleProfiles || !settings.styleProfiles[id]) return null;

    const source = settings.styleProfiles[id];
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = crypto.randomUUID();
    clone.name = `${source.name} (Copy)`;

    settings.styleProfiles[clone.id] = clone;
    saveProfiles();
    console.log('[IGS] Duplicated style profile:', source.name, '->', clone.name);
    return clone;
}

/**
 * Exports a styles profile in the JSON format requested by the user.
 * @param {string} id - The ID of the styles profile to export.
 */
export function exportStyleProfile(id) {
    const settings = getSettings();
    if (!settings.styleProfiles || !settings.styleProfiles[id]) return;

    const source = settings.styleProfiles[id];
    const payload = {
        name: source.name,
        styles: source.styles || []
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `image-generation-suite-${source.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    console.log('[IGS] Exported styles profile:', source.name);
}

/**
 * Imports a styles profile from a JSON string.
 * @param {string} jsonString - The JSON file content.
 * @returns {object|null} The imported style profile on success, null on error.
 */
export function importStyleProfile(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        if (typeof imported.name === 'undefined' || !imported.styles || !Array.isArray(imported.styles)) {
            toastr.error('Invalid styles profile: missing "name" string or "styles" array.');
            return null;
        }

        const settings = getSettings();
        if (!settings.styleProfiles) settings.styleProfiles = {};

        const id = crypto.randomUUID();
        const cleanStyles = imported.styles.map(s => ({
            name: s.name || 'Unnamed Style',
            description: s.description || '',
            preview_image: s.preview_image || '',
            content: s.content || ''
        }));

        const newProfile = {
            id,
            name: imported.name,
            styles: cleanStyles
        };

        settings.styleProfiles[id] = newProfile;
        saveProfiles();
        console.log('[IGS] Imported style profile successfully:', newProfile.name, id);
        return newProfile;
    } catch (e) {
        console.error('[IGS] Failed to import style profile:', e);
        toastr.error('Failed to import style profile: ' + e.message);
        return null;
    }
}

// ==========================================
// LoRA Profile Management
// ==========================================

/**
 * Adds a new LoRA profile.
 * @param {string} name - The name of the profile.
 * @param {Array} entries - Optional initial entries array.
 * @returns {object} The new LoRA profile object.
 */
export function addLoraProfile(name, entries = []) {
    const settings = getSettings();
    if (!settings.loraProfiles) settings.loraProfiles = {};

    const id = crypto.randomUUID();
    const newProfile = {
        id,
        name: name || 'New LoRA Profile',
        entries: entries
    };

    settings.loraProfiles[id] = newProfile;
    saveProfiles();
    console.log('[IGS] Created LoRA profile:', newProfile.name, id);
    return newProfile;
}

/**
 * Deletes a LoRA profile by ID.
 * @param {string} id - The ID to delete.
 */
export function deleteLoraProfile(id) {
    const settings = getSettings();
    if (!settings.loraProfiles) return;

    const ids = Object.keys(settings.loraProfiles);
    if (ids.length <= 1) {
        toastr.warning('Cannot delete the last remaining LoRA profile.');
        return;
    }

    delete settings.loraProfiles[id];

    // Reset active profile references if they used the deleted LoRA profile
    Object.keys(settings.profiles).forEach(pid => {
        const profile = settings.profiles[pid];
        if (profile.activeLoraProfileId === id) {
            profile.activeLoraProfileId = Object.keys(settings.loraProfiles)[0];
        }
    });

    if (settings.activeLoraProfileId === id) {
        settings.activeLoraProfileId = Object.keys(settings.loraProfiles)[0];
    }

    saveProfiles();
    console.log('[IGS] Deleted LoRA profile:', id);
}

/**
 * Renames a LoRA profile.
 * @param {string} id - The ID of the profile.
 * @param {string} newName - The new name.
 */
export function renameLoraProfile(id, newName) {
    const settings = getSettings();
    if (!settings.loraProfiles || !settings.loraProfiles[id]) return;

    settings.loraProfiles[id].name = newName;
    saveProfiles();
    console.log('[IGS] Renamed LoRA profile:', id, '->', newName);
}

/**
 * Duplicates a LoRA profile.
 * @param {string} id - The ID of the profile to duplicate.
 * @returns {object} The duplicated LoRA profile.
 */
export function duplicateLoraProfile(id) {
    const settings = getSettings();
    if (!settings.loraProfiles || !settings.loraProfiles[id]) return null;

    const source = settings.loraProfiles[id];
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = crypto.randomUUID();
    clone.name = `${source.name} (Copy)`;

    settings.loraProfiles[clone.id] = clone;
    saveProfiles();
    console.log('[IGS] Duplicated LoRA profile:', source.name, '->', clone.name);
    return clone;
}

/**
 * Exports a LoRA profile as JSON download.
 * @param {string} id - The ID of the LoRA profile to export.
 */
export function exportLoraProfile(id) {
    const settings = getSettings();
    if (!settings.loraProfiles || !settings.loraProfiles[id]) return;

    const source = settings.loraProfiles[id];
    const payload = {
        name: source.name,
        entries: source.entries || []
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `igs-lora-${source.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    console.log('[IGS] Exported LoRA profile:', source.name);
}

/**
 * Imports a LoRA profile from a JSON string.
 * @param {string} jsonString - The JSON file content.
 * @returns {object|null} The imported LoRA profile on success, null on error.
 */
export function importLoraProfile(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        if (typeof imported.name === 'undefined' || !imported.entries || !Array.isArray(imported.entries)) {
            toastr.error('Invalid LoRA profile: missing "name" string or "entries" array.');
            return null;
        }

        const settings = getSettings();
        if (!settings.loraProfiles) settings.loraProfiles = {};

        const id = crypto.randomUUID();
        const cleanEntries = imported.entries.map(e => ({
            id: e.id || crypto.randomUUID(),
            enabled: typeof e.enabled !== 'undefined' ? e.enabled : true,
            triggers: Array.isArray(e.triggers) ? e.triggers : [],
            description: e.description || '',
            prompt: e.prompt || '',
            caseSensitive: !!e.caseSensitive,
        }));

        const newProfile = {
            id,
            name: imported.name,
            entries: cleanEntries
        };

        settings.loraProfiles[id] = newProfile;
        saveProfiles();
        console.log('[IGS] Imported LoRA profile successfully:', newProfile.name, id);
        return newProfile;
    } catch (e) {
        console.error('[IGS] Failed to import LoRA profile:', e);
        toastr.error('Failed to import LoRA profile: ' + e.message);
        return null;
    }
}

// ==========================================
// Character Profile Management
// ==========================================

/**
 * Adds a new character profile.
 * @param {string} name - The name of the profile.
 * @param {Array} characters - Optional initial characters array.
 * @returns {object} The new character profile object.
 */
export function addCharacterProfile(name, characters = []) {
    const settings = getSettings();
    if (!settings.characterProfiles) settings.characterProfiles = {};

    const id = crypto.randomUUID();
    const newProfile = {
        id,
        name: name || 'New Characters Profile',
        characters: characters
    };

    settings.characterProfiles[id] = newProfile;
    saveProfiles();
    console.log('[IGS] Created character profile:', newProfile.name, id);
    return newProfile;
}

/**
 * Deletes a character profile by ID.
 * @param {string} id - The ID to delete.
 */
export function deleteCharacterProfile(id) {
    const settings = getSettings();
    if (!settings.characterProfiles) return;

    const ids = Object.keys(settings.characterProfiles);
    if (ids.length <= 1) {
        toastr.warning('Cannot delete the last remaining character profile.');
        return;
    }

    delete settings.characterProfiles[id];

    // Reset active profile references if they used the deleted character profile
    Object.keys(settings.profiles).forEach(pid => {
        const profile = settings.profiles[pid];
        if (profile.activeCharacterProfileId === id) {
            profile.activeCharacterProfileId = Object.keys(settings.characterProfiles)[0];
        }
    });

    if (settings.activeCharacterProfileId === id) {
        settings.activeCharacterProfileId = Object.keys(settings.characterProfiles)[0];
    }

    saveProfiles();
    console.log('[IGS] Deleted character profile:', id);
}

/**
 * Renames a character profile.
 * @param {string} id - The ID of the profile.
 * @param {string} newName - The new name.
 */
export function renameCharacterProfile(id, newName) {
    const settings = getSettings();
    if (!settings.characterProfiles || !settings.characterProfiles[id]) return;

    settings.characterProfiles[id].name = newName;
    saveProfiles();
    console.log('[IGS] Renamed character profile:', id, '->', newName);
}

/**
 * Duplicates a character profile.
 * @param {string} id - The ID of the profile to duplicate.
 * @returns {object} The duplicated character profile.
 */
export function duplicateCharacterProfile(id) {
    const settings = getSettings();
    if (!settings.characterProfiles || !settings.characterProfiles[id]) return null;

    const source = settings.characterProfiles[id];
    const clone = JSON.parse(JSON.stringify(source));
    clone.id = crypto.randomUUID();
    clone.name = `${source.name} (Copy)`;

    settings.characterProfiles[clone.id] = clone;
    saveProfiles();
    console.log('[IGS] Duplicated character profile:', source.name, '->', clone.name);
    return clone;
}

/**
 * Exports a character profile as JSON download.
 * @param {string} id - The ID of the character profile to export.
 */
export function exportCharacterProfile(id) {
    const settings = getSettings();
    if (!settings.characterProfiles || !settings.characterProfiles[id]) return;

    const source = settings.characterProfiles[id];
    const payload = {
        name: source.name,
        characters: source.characters || []
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `igs-characters-${source.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);

    console.log('[IGS] Exported character profile:', source.name);
}

/**
 * Imports a character profile from a JSON string.
 * @param {string} jsonString - The JSON file content.
 * @returns {object|null} The imported character profile on success, null on error.
 */
export function importCharacterProfile(jsonString) {
    try {
        const imported = JSON.parse(jsonString);
        if (typeof imported.name === 'undefined' || !imported.characters || !Array.isArray(imported.characters)) {
            toastr.error('Invalid character profile: missing "name" string or "characters" array.');
            return null;
        }

        const settings = getSettings();
        if (!settings.characterProfiles) settings.characterProfiles = {};

        const id = crypto.randomUUID();
        const cleanCharacters = imported.characters.map(c => ({
            id: c.id || crypto.randomUUID(),
            name: c.name || 'Unnamed Character',
            prompt: c.prompt || c.description || '',
            outfits: Array.isArray(c.outfits) ? c.outfits : [],
        }));

        const newProfile = {
            id,
            name: imported.name,
            characters: cleanCharacters
        };

        settings.characterProfiles[id] = newProfile;
        saveProfiles();
        console.log('[IGS] Imported character profile successfully:', newProfile.name, id);
        return newProfile;
    } catch (e) {
        console.error('[IGS] Failed to import character profile:', e);
        toastr.error('Failed to import character profile: ' + e.message);
        return null;
    }
}
