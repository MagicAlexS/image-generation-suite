import {
    formatCharacterAvatar,
    getCharacterAvatar,
    getRequestHeaders,
    getUserAvatar,
    substituteParams,
    user_avatar,
} from '../../../../../script.js';
import { extension_settings, getContext } from '../../../../extensions.js';
import { getBase64Async } from '../../../../utils.js';
import { SlashCommandParser } from '../../../../slash-commands/SlashCommandParser.js';
import { getConnectionMode } from './connectionSettings.js';
import { tr } from './i18n.js';

export {
    createDefaultConnection,
    getConnectionMode,
    normalizeConnection,
    setConnectionMode,
} from './connectionSettings.js';

export const WORKFLOW_VARIABLES = [
    { name: 'prompt', label: 'Positive prompt', type: 'string', field: 'prompt' },
    { name: 'negative_prompt', label: 'Negative prompt', type: 'string', field: 'negativePrompt' },
    { name: 'seed', label: 'Seed', type: 'number', field: 'seed' },
    { name: 'denoise', label: 'Denoising strength', type: 'number', field: 'denoisingStrength' },
    { name: 'clip_skip', label: 'Clip skip', type: 'number', field: 'clipSkip' },
    { name: 'model', label: 'Model', type: 'string', field: 'model' },
    { name: 'vae', label: 'VAE', type: 'string', field: 'vae' },
    { name: 'sampler', label: 'Sampler', type: 'string', field: 'sampler' },
    { name: 'scheduler', label: 'Scheduler', type: 'string', field: 'scheduler' },
    { name: 'steps', label: 'Steps', type: 'number', field: 'steps' },
    { name: 'scale', label: 'CFG scale', type: 'number', field: 'cfgScale' },
    { name: 'width', label: 'Width', type: 'number', field: 'width' },
    { name: 'height', label: 'Height', type: 'number', field: 'height' },
    { name: 'user_avatar', label: 'User avatar (base64)', type: 'string', field: 'userAvatar' },
    { name: 'char_avatar', label: 'Character avatar (base64)', type: 'string', field: 'characterAvatar' },
];

const WORKFLOW_VARIABLE_NAMES = new Set(WORKFLOW_VARIABLES.map(variable => variable.name));
const TRANSPARENT_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const TAVERN_SOURCE_LABELS = {
    extras: 'Extras', horde: 'Stable Horde', auto: 'Automatic1111 / Forge',
    vlad: 'SD.Next', sdcpp: 'stable-diffusion.cpp', drawthings: 'Draw Things',
    comfy: 'ComfyUI', novel: 'NovelAI', openai: 'OpenAI', aimlapi: 'AIMLAPI',
    togetherai: 'Together AI', pollinations: 'Pollinations', stability: 'Stability AI',
    huggingface: 'Hugging Face', chutes: 'Chutes', electronhub: 'ElectronHub',
    nanogpt: 'NanoGPT', bfl: 'Black Forest Labs', falai: 'fal.ai', xai: 'xAI',
    google: 'Google', zai: 'Z.ai', openrouter: 'OpenRouter', workersai: 'Workers AI',
};

function getLiveTavernSettings() {
    const settings = extension_settings?.sd;
    if (!settings || typeof settings !== 'object') {
        throw new Error(tr('igs.tavern.unavailable', 'SillyTavern image generation settings are unavailable.'));
    }
    return settings;
}

/** Reads a summary of the currently active Tavern image source. */
export function getTavernSummary() {
    try {
        const sd = getLiveTavernSettings();
        const command = SlashCommandParser?.commands?.imagine;
        const available = typeof command?.callback === 'function';
        const source = String(sd.source || '');
        return {
            source,
            label: TAVERN_SOURCE_LABELS[source] || source || 'Unknown',
            model: String(sd.model || ''),
            width: Number(sd.width) || 0,
            height: Number(sd.height) || 0,
            workflow: source === 'comfy' ? String(sd.comfy_workflow || '') : '',
            available,
            error: available ? '' : tr('igs.tavern.commandUnavailable', 'SillyTavern image generation command is not ready.'),
        };
    } catch (error) {
        return { source: '', label: '', model: '', width: 0, height: 0, workflow: '', available: false, error: error.message };
    }
}

/** Maps the live Tavern settings for summaries and workflow editing without persisting them. */
export function readTavernConnection(type) {
    const sd = getLiveTavernSettings();
    const serverType = sd.source === 'comfy' ? 'comfy' : ['auto', 'vlad'].includes(sd.source) ? 'auto' : 'tavern';
    if (type && type !== serverType && type !== 'tavern') {
        throw new Error(tr('igs.tavern.sourceMismatch', 'The active SillyTavern source does not match the requested backend.'));
    }
    const workflowVariables = Array.isArray(sd.comfy_placeholders)
        ? sd.comfy_placeholders
            .filter(item => item && typeof item.find === 'string' && item.find.trim())
            .map(item => ({ name: item.find.trim(), type: 'string', value: String(item.replace ?? '') }))
        : [];
    return {
        mode: 'tavern',
        serverType: serverType === 'auto' ? 'auto' : 'comfy',
        source: sd.source,
        autoUrl: sd.source === 'vlad' ? sd.vlad_url : sd.auto_url,
        autoAuth: sd.source === 'vlad' ? sd.vlad_auth : sd.auto_auth,
        comfyUrl: sd.comfy_url,
        model: sd.model || '',
        vae: sd.vae || '',
        sampler: sd.sampler || '',
        scheduler: sd.scheduler || '',
        steps: sd.steps,
        cfgScale: sd.scale,
        width: sd.width,
        height: sd.height,
        denoisingStrength: sd.denoising_strength,
        clipSkip: sd.clip_skip,
        seed: sd.seed,
        comfyWorkflow: sd.comfy_workflow || '',
        workflowVariables,
    };
}

/**
 * Tests connectivity to a ComfyUI or A1111 backend.
 * @param {'comfy'|'auto'} serverType - The backend type.
 * @param {string} url - The backend URL.
 * @param {string} [auth] - Optional username:password for A1111.
 * @returns {Promise<boolean>} True if connection succeeded, false otherwise.
 */
export async function testConnection(serverType, url, auth) {
    try {
        let endpoint;
        let body;

        if (serverType === 'comfy') {
            endpoint = '/api/sd/comfy/ping';
            body = { url };
        } else {
            endpoint = '/api/sd/ping';
            body = { url, auth };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
        }

        const label = serverType === 'comfy' ? 'ComfyUI' : 'A1111';
        toastr.success(tr('igs.connection.success', 'Connected to {label}!', { label }));
        console.log('[IGS]', `Connection test to ${label} succeeded`);
        return true;
    } catch (error) {
        console.error('[IGS]', 'Connection test failed:', error);
        toastr.error(tr('igs.connection.failed', 'Connection failed: {message}', { message: error.message }));
        return false;
    }
}

/**
 * Loads available models from the backend.
 * @param {'comfy'|'auto'} serverType - The backend type.
 * @param {string} url - The backend URL.
 * @param {string} [auth] - Optional username:password for A1111.
 * @returns {Promise<string[]>} Array of model name strings.
 */
export async function loadModels(serverType, url, auth) {
    try {
        let endpoint;
        let body;

        if (serverType === 'comfy') {
            endpoint = '/api/sd/comfy/models';
            body = { url };
        } else {
            endpoint = '/api/sd/models';
            body = { url, auth };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
        }

        const data = await response.json();
        console.log('[IGS]', `Loaded ${data.length} models`);
        return data;
    } catch (error) {
        console.error('[IGS]', 'Failed to load models:', error);
        return [];
    }
}

/**
 * Loads available VAEs from the backend.
 * @param {'comfy'|'auto'} serverType - The backend type.
 * @param {string} url - The backend URL.
 * @param {string} [auth] - Optional username:password for A1111.
 * @returns {Promise<string[]>} Array of VAE name strings.
 */
export async function loadVaes(serverType, url, auth) {
    try {
        let endpoint;
        let body;

        if (serverType === 'comfy') {
            endpoint = '/api/sd/comfy/vaes';
            body = { url };
        } else {
            endpoint = '/api/sd/vaes';
            body = { url, auth };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
        }

        const data = await response.json();
        console.log('[IGS]', `Loaded ${data.length} VAEs`);
        return data;
    } catch (error) {
        console.error('[IGS]', 'Failed to load VAEs:', error);
        return [];
    }
}

/**
 * Loads available samplers from the backend.
 * @param {'comfy'|'auto'} serverType - The backend type.
 * @param {string} url - The backend URL.
 * @param {string} [auth] - Optional username:password for A1111.
 * @returns {Promise<string[]>} Array of sampler name strings.
 */
export async function loadSamplers(serverType, url, auth) {
    try {
        let endpoint;
        let body;

        if (serverType === 'comfy') {
            endpoint = '/api/sd/comfy/samplers';
            body = { url };
        } else {
            endpoint = '/api/sd/samplers';
            body = { url, auth };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
        }

        const data = await response.json();
        console.log('[IGS]', `Loaded ${data.length} samplers`);
        return data;
    } catch (error) {
        console.error('[IGS]', 'Failed to load samplers:', error);
        return [];
    }
}

/**
 * Loads available schedulers from the backend.
 * @param {'comfy'|'auto'} serverType - The backend type.
 * @param {string} url - The backend URL.
 * @param {string} [auth] - Optional username:password for A1111.
 * @returns {Promise<string[]>} Array of scheduler name strings (may be empty for A1111).
 */
export async function loadSchedulers(serverType, url, auth) {
    try {
        let endpoint;
        let body;

        if (serverType === 'comfy') {
            endpoint = '/api/sd/comfy/schedulers';
            body = { url };
        } else {
            endpoint = '/api/sd/schedulers';
            body = { url, auth };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
        }

        const data = await response.json();
        console.log('[IGS]', `Loaded ${data.length} schedulers`);
        return data;
    } catch (error) {
        console.error('[IGS]', 'Failed to load schedulers:', error);
        return [];
    }
}

/**
 * Loads available ComfyUI workflow files.
 * @returns {Promise<string[]>} Array of workflow filename strings.
 */
export async function loadWorkflows() {
    const response = await fetch('/api/sd/comfy/workflows', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({}),
    });
    if (!response.ok) {
        throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
    }
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(tr('igs.workflow.invalidList', 'SillyTavern returned an invalid workflow list.'));
    console.log('[IGS]', `Loaded ${data.length} workflows`);
    return data;
}

/**
 * Loads a single ComfyUI workflow file by name.
 * @param {string} fileName - The workflow filename.
 * @returns {Promise<object>} The workflow JSON object.
 * @throws {Error} If the request fails.
 */
export async function loadWorkflow(fileName) {
    const response = await fetch('/api/sd/comfy/workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ file_name: fileName }),
    });
    if (!response.ok) throw new Error(tr('igs.workflow.loadFailed', 'Failed to load workflow'));
    return await response.json();
}

/**
 * Saves (creates or overwrites) a ComfyUI workflow file.
 * @param {string} fileName - The workflow filename.
 * @param {string} workflow - The workflow JSON string.
 * @throws {Error} If the request fails.
 */
export async function saveWorkflow(fileName, workflow) {
    const response = await fetch('/api/sd/comfy/save-workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ file_name: fileName, workflow }),
    });
    if (!response.ok) throw new Error(tr('igs.workflow.saveFailed', 'Failed to save workflow'));
}

/**
 * Deletes a ComfyUI workflow file.
 * @param {string} fileName - The workflow filename to delete.
 * @throws {Error} If the request fails.
 */
export async function deleteWorkflow(fileName) {
    const response = await fetch('/api/sd/comfy/delete-workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ file_name: fileName }),
    });
    if (!response.ok) throw new Error(tr('igs.workflow.deleteFailed', 'Failed to delete workflow'));
}

/**
 * Renames a ComfyUI workflow file.
 * @param {string} oldName - The current workflow filename.
 * @param {string} newName - The new workflow filename.
 * @throws {Error} If the request fails.
 */
export async function renameWorkflow(oldName, newName) {
    const response = await fetch('/api/sd/comfy/rename-workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ old_name: oldName, new_name: newName }),
    });
    if (!response.ok) throw new Error(tr('igs.workflow.renameFailed', 'Failed to rename workflow'));
}

/**
 * Generates an image using the given profile's connection settings.
 * @param {object} profile - The generation profile containing connection settings.
 * @param {string} prompt - The positive prompt text.
 * @param {string} negativePrompt - The negative prompt text.
 * @param {AbortSignal} [signal] - Optional AbortSignal for cancellation.
 * @returns {Promise<{format: string, data: string}|{url: string}>} Custom image data or a saved Tavern image URL.
 * @throws {Error} If generation fails.
 */
export async function generateImage(profile, prompt, negativePrompt, signal) {
    if (signal?.aborted) throw new DOMException('Image generation was cancelled.', 'AbortError');
    const connection = profile.connection || profile;
    if (getConnectionMode(connection) === 'tavern') {
        return await generateTavernImage(prompt, negativePrompt, signal);
    }

    if (getConnectionMode(connection) === 'comfy') {
        return await generateComfyImage(connection, prompt, negativePrompt, signal);
    }
    return await generateAutoImage(connection, prompt, negativePrompt, signal);
}

/** Runs SillyTavern's registered image command with structured arguments. */
async function generateTavernImage(prompt, negativePrompt, signal) {
    if (signal?.aborted) throw new DOMException('Image generation was cancelled.', 'AbortError');
    const command = SlashCommandParser?.commands?.imagine;
    if (typeof command?.callback !== 'function') {
        throw new Error(tr('igs.tavern.commandUnavailable', 'SillyTavern image generation command is not ready.'));
    }

    const triggerKeywords = new Set(['you', 'me', 'scene', 'raw_last', 'last', 'face', 'background']);
    const trigger = String(prompt || '');
    const safeTrigger = triggerKeywords.has(trigger.trim().toLowerCase()) ? `${trigger},` : trigger;

    // This invokes the native callback directly: prompt contents never pass through
    // slash-command text parsing, and ST remains responsible for its active source.
    const url = await command.callback({
        quiet: 'true',
        gallery: 'false',
        extend: 'false',
        edit: 'false',
        negative: String(negativePrompt || ''),
        _abortController: signal,
    }, safeTrigger);
    if (signal?.aborted) throw new DOMException('Image generation was cancelled.', 'AbortError');
    if (!url || typeof url !== 'string') {
        throw new Error(tr('igs.tavern.generationFailed', 'SillyTavern image generation failed or returned no image.'));
    }
    return { url };
}

function unwrapWorkflow(parsed) {
    if (parsed?.input?.workflow && typeof parsed.input.workflow === 'object') return parsed.input.workflow;
    if (parsed?.prompt && typeof parsed.prompt === 'object') return parsed.prompt;
    return parsed;
}

function validateWorkflowGraph(graph) {
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
        throw new Error(tr('igs.workflow.invalidJson', 'Workflow must be a JSON object.'));
    }
    const nodes = Object.entries(graph);
    if (!nodes.length) throw new Error(tr('igs.workflow.empty', 'Workflow contains no API nodes.'));
    for (const [id, node] of nodes) {
        if (!node || typeof node !== 'object' || Array.isArray(node)
            || typeof node.class_type !== 'string'
            || !node.inputs || typeof node.inputs !== 'object' || Array.isArray(node.inputs)) {
            throw new Error(tr('igs.workflow.invalidNode', 'Workflow node {id} must contain class_type and inputs.', { id }));
        }
    }
    return graph;
}

function getCustomWorkflowValues(connection) {
    const variables = Array.isArray(connection.workflowVariables) ? connection.workflowVariables : [];
    const values = Object.create(null);
    for (const variable of variables) {
        const name = String(variable?.name || '').trim();
        if (!name || /["%]/.test(name)) {
            throw new Error(tr('igs.workflow.invalidVariableName', 'Custom variable names cannot be empty or contain quotes or percent signs.'));
        }
        if (WORKFLOW_VARIABLE_NAMES.has(name) || Object.hasOwn(values, name)) {
            throw new Error(tr('igs.workflow.duplicateVariable', 'Custom variable {name} is reserved or duplicated.', { name }));
        }
        const type = ['string', 'number', 'boolean'].includes(variable.type) ? variable.type : 'string';
        const raw = variable.value ?? '';
        let value;
        if (type === 'number') {
            if (String(raw).trim() === '') {
                throw new Error(tr('igs.workflow.variableNotNumber', 'Custom variable {name} must be a finite number.', { name }));
            }
            value = Number(raw);
            if (!Number.isFinite(value)) throw new Error(tr('igs.workflow.variableNotNumber', 'Custom variable {name} must be a finite number.', { name }));
        } else if (type === 'boolean') {
            if (typeof raw === 'boolean') value = raw;
            else if (/^(true|false)$/i.test(String(raw))) value = String(raw).toLowerCase() === 'true';
            else throw new Error(tr('igs.workflow.variableNotBoolean', 'Custom variable {name} must be true or false.', { name }));
        } else {
            value = typeof substituteParams === 'function' ? substituteParams(String(raw)) : String(raw);
        }
        values[name] = value;
    }
    return values;
}

function getAvatarUrl(kind) {
    if (kind === 'user') return getUserAvatar(user_avatar);
    const context = getContext();
    if (context.groupId) {
        const groupMembers = context.groups?.find(group => group.id === context.groupId)?.members;
        const lastMessageAvatar = context.chat?.filter(item => !item.is_system && !item.is_user)?.slice(-1)[0]?.original_avatar;
        const randomMember = Array.isArray(groupMembers) && groupMembers.length
            ? groupMembers[Math.floor(Math.random() * groupMembers.length)]
            : null;
        return formatCharacterAvatar(lastMessageAvatar || randomMember);
    }
    return getCharacterAvatar(context.characterId);
}

async function getAvatarBase64(kind, signal) {
    try {
        const response = await fetch(getAvatarUrl(kind), { signal });
        if (!response.ok) return TRANSPARENT_PNG;
        const dataUrl = await getBase64Async(await response.blob());
        return String(dataUrl).split(',').at(-1) || TRANSPARENT_PNG;
    } catch (error) {
        if (signal?.aborted) throw error;
        return TRANSPARENT_PNG;
    }
}

async function buildWorkflowValues(connection, prompt, negativePrompt, { preview = false, signal, used = [] } = {}) {
    const rawSeed = Number(connection.seed);
    const seed = Number.isFinite(rawSeed) && rawSeed >= 0
        ? rawSeed
        : preview ? 0 : Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const values = {
        prompt: String(prompt || ''),
        negative_prompt: String(negativePrompt || ''),
        seed,
        denoise: Number(connection.denoisingStrength ?? 0.7),
        clip_skip: -Number(connection.clipSkip ?? 1),
        model: String(connection.model || ''),
        vae: String(connection.vae || ''),
        sampler: String(connection.sampler || ''),
        scheduler: String(connection.scheduler || ''),
        steps: Number(connection.steps ?? 20),
        scale: Number(connection.cfgScale ?? 7),
        width: Number(connection.width ?? 512),
        height: Number(connection.height ?? 512),
        user_avatar: '',
        char_avatar: '',
        ...getCustomWorkflowValues(connection),
    };
    if (!preview) {
        if (used.includes('user_avatar')) values.user_avatar = await getAvatarBase64('user', signal);
        if (used.includes('char_avatar')) values.char_avatar = await getAvatarBase64('character', signal);
    }
    return values;
}

function substituteWorkflow(text, values) {
    const tokens = [...String(text).matchAll(/"%([^"%]+)%"/g)].map(match => match[1]);
    const available = new Set([...WORKFLOW_VARIABLE_NAMES, ...Object.keys(values)]);
    const unknown = [...new Set(tokens.filter(token => !available.has(token)))];
    const used = [...new Set(tokens)];
    const output = String(text).replace(/"%([^"%]+)%"/g, (match, token) =>
        Object.hasOwn(values, token) ? JSON.stringify(values[token]) : match);
    return { output, used, unknown };
}

/** Validates a ComfyUI API workflow and returns used/unknown variables and a deterministic preview. */
export function inspectWorkflow(text, connection = {}) {
    const parsed = JSON.parse(String(text));
    const graph = validateWorkflowGraph(unwrapWorkflow(parsed));
    const rawSeed = Number(connection.seed);
    const previewSeed = Number.isFinite(rawSeed) && rawSeed >= 0 ? rawSeed : 0;
    const values = {
        prompt: 'Example prompt', negative_prompt: 'Example negative prompt', seed: previewSeed,
        denoise: Number(connection.denoisingStrength ?? 0.7),
        clip_skip: -Number(connection.clipSkip ?? 1), model: String(connection.model || ''),
        vae: String(connection.vae || ''), sampler: String(connection.sampler || ''),
        scheduler: String(connection.scheduler || ''), steps: Number(connection.steps ?? 20),
        scale: Number(connection.cfgScale ?? 7), width: Number(connection.width ?? 512),
        height: Number(connection.height ?? 512), user_avatar: '', char_avatar: '',
        ...getCustomWorkflowValues(connection),
    };
    const serialized = JSON.stringify(graph);
    const result = substituteWorkflow(serialized, values);
    validateWorkflowGraph(JSON.parse(result.output));
    return {
        used: result.used,
        unknown: result.unknown,
        preview: result.output,
        template: JSON.stringify(graph, null, 2),
    };
}

/**
 * Generates an image via ComfyUI by loading and populating a workflow template.
 * @param {object} connection - The connection settings from the profile.
 * @param {string} prompt - The positive prompt text.
 * @param {string} negativePrompt - The negative prompt text.
 * @param {AbortSignal} [signal] - Optional AbortSignal for cancellation.
 * @returns {Promise<{format: string, data: string}>} The generated image as base64.
 * @throws {Error} If generation fails.
 */
async function generateComfyImage(connection, prompt, negativePrompt, signal) {
    if (!connection.comfyWorkflow) {
        throw new Error(tr('igs.workflow.selectRequired', 'Select a ComfyUI workflow before generating an image.'));
    }
    const workflows = await loadWorkflows();
    if (!workflows.includes(connection.comfyWorkflow)) {
        throw new Error(tr('igs.workflow.missing', 'Workflow "{name}" was not found in SillyTavern.', { name: connection.comfyWorkflow }));
    }

    // Load the selected shared SillyTavern workflow.
    const workflowResponse = await fetch('/api/sd/comfy/workflow', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ file_name: connection.comfyWorkflow }),
        signal,
    });

    if (!workflowResponse.ok) {
        throw new Error(tr('igs.workflow.loadHttpFailed', 'Failed to load workflow: HTTP {status}', { status: workflowResponse.status }));
    }

    const workflowJson = await workflowResponse.json();
    const workflowText = typeof workflowJson === 'string' ? workflowJson : JSON.stringify(workflowJson);
    let parsed;
    try {
        parsed = JSON.parse(workflowText);
    } catch {
        throw new Error(tr('igs.workflow.invalidJson', 'Workflow must be a JSON object.'));
    }
    const graph = validateWorkflowGraph(unwrapWorkflow(parsed));
    const original = JSON.stringify(graph);
    const tokenNames = [...new Set([...original.matchAll(/"%([^"%]+)%"/g)].map(match => match[1]))];
    const values = await buildWorkflowValues(connection, prompt, negativePrompt, { signal, used: tokenNames });
    const replacement = substituteWorkflow(original, values);
    if (replacement.unknown.length) {
        throw new Error(tr('igs.workflow.unknownVariables', 'Workflow contains unknown variables: {names}', { names: replacement.unknown.join(', ') }));
    }
    let workflow;
    try {
        workflow = JSON.stringify(validateWorkflowGraph(JSON.parse(replacement.output)));
    } catch (error) {
        throw new Error(tr('igs.workflow.invalidAfterReplace', 'Workflow variables produced invalid API nodes: {message}', { message: error.message }));
    }

    console.log('[IGS]', 'ComfyUI workflow prepared, sending generation request');

    // Step 4: Send generation request
    const generateResponse = await fetch('/api/sd/comfy/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            url: connection.comfyUrl,
            prompt: JSON.stringify({ prompt: JSON.parse(workflow) }),
        }),
        signal,
    });

    if (!generateResponse.ok) {
        throw new Error(tr('igs.generation.comfyFailed', 'ComfyUI generation failed: HTTP {status}', { status: generateResponse.status }));
    }

    // Step 5: Parse response
    const result = await generateResponse.json();
    console.log('[IGS]', 'ComfyUI image generated successfully');
    if (!result?.data) throw new Error(tr('igs.generation.noData', 'Image generation returned no data'));
    return { format: result.format, data: result.data };
}

/**
 * Generates an image via A1111 / Automatic1111 WebUI API.
 * @param {object} connection - The connection settings from the profile.
 * @param {string} prompt - The positive prompt text.
 * @param {string} negativePrompt - The negative prompt text.
 * @param {AbortSignal} [signal] - Optional AbortSignal for cancellation.
 * @returns {Promise<{format: string, data: string}>} The generated image as base64.
 * @throws {Error} If generation fails.
 */
async function generateAutoImage(connection, prompt, negativePrompt, signal) {
    // Step 1: Build the payload
    const payload = {
        url: connection.autoUrl,
        auth: connection.autoAuth,
        prompt: prompt,
        negative_prompt: negativePrompt,
        sampler_name: connection.sampler,
        scheduler: connection.scheduler,
        steps: connection.steps,
        cfg_scale: connection.cfgScale,
        width: connection.width,
        height: connection.height,
        denoising_strength: connection.denoisingStrength,
        seed: connection.seed >= 0 ? connection.seed : undefined,
        override_settings: {
            CLIP_stop_at_last_layers: connection.clipSkip,
            sd_vae: connection.vae || undefined,
            ...(connection.model ? { sd_model_checkpoint: connection.model } : {}),
        },
        override_settings_restore_afterwards: true,
        save_images: true,
        send_images: true,
    };

    console.log('[IGS]', 'A1111 payload prepared, sending generation request');

    // Step 2: Send generation request
    const response = await fetch('/api/sd/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) {
        throw new Error(tr('igs.generation.a1111Failed', 'A1111 generation failed: HTTP {status}', { status: response.status }));
    }

    // Step 3: Parse response
    const responseJson = await response.json();
    if (!responseJson.images?.length) {
        throw new Error(tr('igs.generation.a1111NoImages', 'A1111 returned no images.'));
    }
    console.log('[IGS]', 'A1111 image generated successfully');
    return { format: 'png', data: responseJson.images[0] };
}
