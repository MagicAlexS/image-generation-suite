import { eventSource, event_types } from '../../../../../script.js';
import { getContext } from '../../../../extensions.js';
import { regexFromString } from '../../../../utils.js';
import { getActiveProfile, getSettings, saveProfiles } from './profiles.js';
import { scanForTriggers, compileLoraDescriptions } from './lora.js';
import { processImageGeneration } from './insertion.js';
import { DEFAULT_SCENE_PROMPT, TAG_SCENE_PROMPT } from './promptTemplates.js';

/**
 * @type {Function|null} Stored reference to the prompt injection handler for cleanup.
 */
let promptInjectionHandler = null;

/**
 * @type {Function|null} Stored reference to the message received handler for cleanup.
 */
let messageReceivedHandler = null;

/**
 * Maps a prompt position setting to the appropriate chat completion role.
 * @param {string} position - The position value (e.g. 'deep_system', 'deep_user', 'deep_assistant').
 * @returns {string} The corresponding role string.
 */
function getRoleFromPosition(position) {
    switch (position) {
        case 'deep_system':
            return 'system';
        case 'deep_user':
            return 'user';
        case 'deep_assistant':
            return 'assistant';
        default:
            return 'system';
    }
}

/**
 * Resolves a user-defined custom macro to its text substitution value.
 * @param {object} macro - The macro definition from profile.customMacros.
 * @returns {string} The resolved text value.
 */
function resolveCustomMacro(macro) {
    switch (macro.type) {
        case 'list': {
            const opt = macro.options && macro.options[macro.value];
            return (opt && typeof opt === 'object') ? (opt.text || '') : (opt || '');
        }
        case 'bool':
            return macro.value ? (macro.text || '') : '';
        case 'int':
        case 'float':
            return String(macro.value ?? 0);
        default:
            return '';
    }
}

/**
 * Initializes the detection system by registering event handlers for
 * prompt injection and message-received regex scanning.
 */
export function initDetection() {
    console.log('[IGS] Initializing detection system');

    // Clean up any existing handlers first
    destroyDetection();

    // Handler for injecting prompts into chat completion requests
    promptInjectionHandler = async (eventData) => {
        try {
            const profile = getActiveProfile();
            const settings = getSettings();
            if (!profile) {
                return;
            }

            if (!profile.prompt || !profile.prompt.enabled) {
                return;
            }

            // Initialize counter if not present
            if (typeof profile.prompt.messageCounter === 'undefined') {
                profile.prompt.messageCounter = 0;
            }

            // Check frequency gating
            const frequency = profile.prompt.frequency || 1;
            profile.prompt.messageCounter++;

            if (profile.prompt.messageCounter < frequency) {
                // Not yet time to inject, save the updated counter
                saveProfiles();
                return;
            }

            // Reset counter since we've reached the frequency threshold
            profile.prompt.messageCounter = 0;
            saveProfiles();

            // Determine injection role from position
            const position = profile.prompt.position || 'deep_system';
            const role = getRoleFromPosition(position);

            // Build injection content starting from the template
            let injectionContent = profile.prompt.template || '';
            // A user-owned profile may have no built-in macros. Applying scene
            // defaults should still produce usable instructions without changing
            // that profile's macro definitions or touching custom templates.
            if (profile.prompt.template === DEFAULT_SCENE_PROMPT || profile.prompt.template === TAG_SCENE_PROMPT) {
                const definedMacros = new Set((profile.customMacros || []).map(macro => macro.id));
                const fallbacks = {
                    minwords: '120', maxwords: '500',
                    perspective: '', camera: '', mood: '', focus: '', tone: '',
                };
                for (const [id, value] of Object.entries(fallbacks)) {
                    if (!definedMacros.has(id)) {
                        injectionContent = injectionContent.replaceAll(`{${id}}`, () => value);
                    }
                }
            }

            // Scan for LoRA triggers in recent chat messages
            const context = getContext();
            const chat = context.chat || [];
            const loraDepth = (profile.loras && profile.loras.depth) ? profile.loras.depth : 5;
            const recentMessages = chat.slice(-loraDepth);
            const matches = await scanForTriggers(profile, recentMessages);

            // If LoRA matches found, append their descriptions
            if (matches.length > 0) {
                const loraDescriptions = compileLoraDescriptions(matches);
                if (loraDescriptions) {
                    injectionContent += '\n' + loraDescriptions;
                }
            }

            // If a character is selected, append the character defining prompt
            const charProfileId = profile.activeCharacterProfileId;
            const charProfile = charProfileId && settings.characterProfiles?.[charProfileId];
            const characters = charProfile?.characters || [];
            if (profile.activeCharacterId && characters.length > 0) {
                const selectedChar = characters.find(c => c.id === profile.activeCharacterId);
                if (selectedChar && selectedChar.prompt) {
                    let charDefining = profile.promptConstruction?.characterDefining || '';
                    if (charDefining) {
                        // Resolve {outfits} placeholder - build list of outfit descriptions
                        let outfitsList = '';
                        if (selectedChar.outfits && selectedChar.outfits.length > 0) {
                            outfitsList = selectedChar.outfits
                                .filter(o => o.name && o.description)
                                .map(o => `"${o.name}, ${o.description}"`)
                                .join(',\n');
                        }
                        // Expand once so reference text remains literal, even if it
                        // contains dollar signs or another reference placeholder.
                        const characterReference = {
                            characterName: selectedChar.name || '',
                            character: selectedChar.prompt,
                            outfits: outfitsList,
                        };
                        charDefining = charDefining.replace(/\{(characterName|character|outfits)\}/g,
                            (_, key) => characterReference[key]);

                        injectionContent += '\n' + charDefining;
                    }
                }
            }

            // Resolve user-defined custom macros on the injection content
            if (profile.customMacros && profile.customMacros.length > 0) {
                for (const macro of profile.customMacros) {
                    const resolved = resolveCustomMacro(macro);
                    injectionContent = injectionContent.replaceAll(`{${macro.id}}`, () => resolved);
                }
            }

            // Build the injection message object
            const injectionMessage = {
                role: role,
                content: injectionContent,
            };

            // Insert into eventData.chat at the specified depth
            const depth = profile.prompt.depth || 0;

            if (depth === 0) {
                eventData.chat.push(injectionMessage);
            } else {
                const spliceIndex = Math.max(0, eventData.chat.length - depth);
                eventData.chat.splice(spliceIndex, 0, injectionMessage);
            }

            console.log('[IGS] Injected prompt at depth', depth, 'with role', role);
        } catch (error) {
            console.error('[IGS] Error in prompt injection handler:', error);
        }
    };

    // Handler for detecting image generation tags in received messages
    messageReceivedHandler = (messageIndex) => {
        try {
            const profile = getActiveProfile();
            if (!profile) {
                return;
            }

            if (!profile.settings || profile.settings.insertType === 'disabled') {
                return;
            }

            const context = getContext();
            const chat = context.chat || [];

            // Get the message at the provided index, or fall back to last message
            const message = (typeof messageIndex === 'number' && chat[messageIndex])
                ? chat[messageIndex]
                : chat[chat.length - 1];

            if (!message) {
                return;
            }

            // Skip user messages
            if (message.is_user) {
                return;
            }

            // Parse the detection regex
            const regexStr = profile.settings.regex;
            if (!regexStr) {
                return;
            }

            const regex = regexFromString(regexStr);
            if (!regex) {
                console.log('[IGS] Failed to parse regex:', regexStr);
                return;
            }

            // Ensure global flag for findAll
            const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');

            // Find all matches in the message text
            const messageText = message.mes || '';
            const allMatches = [...messageText.matchAll(globalRegex)];

            if (allMatches.length === 0) {
                return;
            }

            // Determine the actual message index
            const actualMessageIndex = (typeof messageIndex === 'number')
                ? messageIndex
                : chat.length - 1;

            console.log('[IGS] Found', allMatches.length, 'image tag(s) in message', actualMessageIndex);

            // Use setTimeout to avoid blocking the UI
            setTimeout(async () => {
                try {
                    toastr.info(`Generating ${allMatches.length} image(s)...`);

                    for (const match of allMatches) {
                        // Extract prompt from capture group 1
                        const prompt = match[1] || '';
                        const originalTag = match[0];

                        console.log('[IGS] Processing image tag:', originalTag, 'prompt:', prompt);
                        await processImageGeneration(profile, prompt, actualMessageIndex, originalTag);
                    }

                    toastr.success('Image(s) generated!');
                } catch (error) {
                    console.error('[IGS] Error generating images:', error);
                    toastr.error('Failed to generate image(s): ' + error.message);
                }
            }, 0);
        } catch (error) {
            console.error('[IGS] Error in message received handler:', error);
        }
    };

    // Register event handlers
    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, promptInjectionHandler);
    eventSource.on(event_types.MESSAGE_RECEIVED, messageReceivedHandler);

    console.log('[IGS] Detection system initialized');
}

/**
 * Manually scans the latest character message (or at targetIndex) for image tags and runs generation.
 * @param {number|null} targetIndex - The index of the message to scan, or null to auto-scan backward.
 * @returns {string} Status explanation.
 */
export function triggerDetection(targetIndex = null) {
    const profile = getActiveProfile();
    if (!profile) {
        toastr.warning('No active profile.');
        return 'No active profile.';
    }

    if (!profile.settings || profile.settings.insertType === 'disabled') {
        toastr.warning('Detection is disabled in active profile settings.');
        return 'Detection is disabled.';
    }

    const context = getContext();
    const chat = context.chat || [];
    if (chat.length === 0) {
        toastr.warning('Chat is empty.');
        return 'Chat is empty.';
    }

    let actualIndex = targetIndex;
    if (actualIndex === null) {
        // Scan backwards for the latest assistant/character message
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user && !chat[i].is_system) {
                actualIndex = i;
                break;
            }
        }
    }

    if (actualIndex === null || typeof chat[actualIndex] === 'undefined') {
        toastr.warning('Could not find any character messages to scan.');
        return 'No character messages found.';
    }

    const message = chat[actualIndex];
    const regexStr = profile.settings.regex;
    if (!regexStr) {
        toastr.warning('No detection regex configured.');
        return 'No detection regex.';
    }

    const regex = regexFromString(regexStr);
    if (!regex) {
        toastr.error('Failed to parse detection regex.');
        return 'Failed to parse regex.';
    }

    const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    const messageText = message.mes || '';
    const allMatches = [...messageText.matchAll(globalRegex)];

    if (allMatches.length === 0) {
        toastr.info('No image tags found in the latest character message.');
        return 'No matches found.';
    }

    console.log('[IGS] Manual trigger: found', allMatches.length, 'tags in message', actualIndex);
    
    setTimeout(async () => {
        try {
            toastr.info(`Generating ${allMatches.length} image(s)...`);
            for (const match of allMatches) {
                const prompt = match[1] || '';
                const originalTag = match[0];
                await processImageGeneration(profile, prompt, actualIndex, originalTag);
            }
            toastr.success('Image(s) generated!');
        } catch (error) {
            console.error('[IGS] Manual trigger error:', error);
            toastr.error('Failed to generate image(s): ' + error.message);
        }
    }, 0);

    return 'Triggered detection.';
}

/**
 * Destroys the detection system by removing all registered event handlers.
 */
export function destroyDetection() {
    if (promptInjectionHandler) {
        eventSource.removeListener(event_types.CHAT_COMPLETION_PROMPT_READY, promptInjectionHandler);
        promptInjectionHandler = null;
        console.log('[IGS] Removed prompt injection handler');
    }

    if (messageReceivedHandler) {
        eventSource.removeListener(event_types.MESSAGE_RECEIVED, messageReceivedHandler);
        messageReceivedHandler = null;
        console.log('[IGS] Removed message received handler');
    }
}
