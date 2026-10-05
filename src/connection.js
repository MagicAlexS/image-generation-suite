import { getRequestHeaders } from '../../../../../script.js';
import { tr } from './i18n.js';

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
 * @param {string} url - The ComfyUI backend URL.
 * @returns {Promise<string[]>} Array of workflow filename strings.
 */
export async function loadWorkflows(url) {
    try {
        const response = await fetch('/api/sd/comfy/workflows', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ url }),
        });

        if (!response.ok) {
            throw new Error(tr('igs.error.httpStatus', 'HTTP {status}: {statusText}', { status: response.status, statusText: response.statusText }));
        }

        const data = await response.json();
        console.log('[IGS]', `Loaded ${data.length} workflows`);
        return data;
    } catch (error) {
        console.error('[IGS]', 'Failed to load workflows:', error);
        return [];
    }
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
 * @returns {Promise<{format: string, data: string}>} The generated image as base64.
 * @throws {Error} If generation fails.
 */
export async function generateImage(profile, prompt, negativePrompt, signal) {
    const connection = profile.connection;

    if (connection.serverType === 'comfy') {
        return await generateComfyImage(connection, prompt, negativePrompt, signal);
    } else {
        return await generateAutoImage(connection, prompt, negativePrompt, signal);
    }
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
    // Step 1: Load the workflow JSON
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

    // Step 2: Get the workflow string (handling whether backend returns a raw JSON string or object)
    let workflow = typeof workflowJson === 'string' ? workflowJson : JSON.stringify(workflowJson);

    // Step 3: Replace placeholders
    const seed = connection.seed >= 0
        ? connection.seed
        : Math.round(Math.random() * Number.MAX_SAFE_INTEGER);

    const clipSkipValue = isNaN(connection.clipSkip) ? -1 : -connection.clipSkip;

    workflow = workflow.replace(/"%prompt%"/g, JSON.stringify(prompt));
    workflow = workflow.replace(/"%negative_prompt%"/g, JSON.stringify(negativePrompt));
    workflow = workflow.replace(/"%seed%"/g, JSON.stringify(seed));
    workflow = workflow.replace(/"%denoise%"/g, JSON.stringify(connection.denoisingStrength));
    workflow = workflow.replace(/"%clip_skip%"/g, JSON.stringify(clipSkipValue));
    workflow = workflow.replace(/"%model%"/g, JSON.stringify(connection.model));
    workflow = workflow.replace(/"%vae%"/g, JSON.stringify(connection.vae));
    workflow = workflow.replace(/"%sampler%"/g, JSON.stringify(connection.sampler));
    workflow = workflow.replace(/"%scheduler%"/g, JSON.stringify(connection.scheduler));
    workflow = workflow.replace(/"%steps%"/g, JSON.stringify(connection.steps));
    workflow = workflow.replace(/"%scale%"/g, JSON.stringify(connection.cfgScale));
    workflow = workflow.replace(/"%width%"/g, JSON.stringify(connection.width));
    workflow = workflow.replace(/"%height%"/g, JSON.stringify(connection.height));

    console.log('[IGS]', 'ComfyUI workflow prepared, sending generation request');

    // Step 4: Send generation request
    const generateResponse = await fetch('/api/sd/comfy/generate', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            url: connection.comfyUrl,
            prompt: '{"prompt": ' + workflow + '}',
        }),
        signal,
    });

    if (!generateResponse.ok) {
        throw new Error(tr('igs.generation.comfyFailed', 'ComfyUI generation failed: HTTP {status}', { status: generateResponse.status }));
    }

    // Step 5: Parse response
    const result = await generateResponse.json();
    console.log('[IGS]', 'ComfyUI image generated successfully');
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
