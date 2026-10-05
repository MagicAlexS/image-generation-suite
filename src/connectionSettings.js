const CUSTOM_KEYS = [
    'comfyUrl', 'autoUrl', 'autoAuth', 'model', 'vae', 'sampler', 'scheduler',
    'steps', 'cfgScale', 'width', 'height', 'denoisingStrength', 'clipSkip',
    'seed', 'comfyWorkflow', 'workflowVariables',
];

function getCustomValues(connection) {
    return Object.fromEntries(CUSTOM_KEYS.map(key => [key, connection[key]]));
}

/** Returns the currently selected connection mode, preserving legacy profiles. */
export function getConnectionMode(connection = {}) {
    if (['tavern', 'comfy', 'auto'].includes(connection.mode)) return connection.mode;
    return connection.serverType === 'auto' ? 'auto' : 'comfy';
}

/** Changes the connection mode while keeping each custom backend's values isolated. */
export function setConnectionMode(connection, mode) {
    if (!connection || !['tavern', 'comfy', 'auto'].includes(mode)) return connection;

    const currentMode = getConnectionMode(connection);
    connection.backendSettings ||= {};
    if (currentMode === 'comfy' || currentMode === 'auto') {
        connection.backendSettings[currentMode] = getCustomValues(connection);
    }

    connection.mode = mode;
    if (mode !== 'tavern') {
        connection.serverType = mode;
        const saved = connection.backendSettings[mode];
        const defaults = createCustomConnection(mode);
        Object.assign(connection, { ...defaults, ...(saved || {}) });
        connection.serverType = mode;
    }
    return connection;
}

function createCustomConnection(mode) {
    return {
        serverType: mode,
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
        workflowVariables: [],
    };
}

/** Builds a new default connection. New profiles start in Tavern mode. */
export function createDefaultConnection(mode = 'tavern') {
    const comfy = createCustomConnection('comfy');
    const auto = createCustomConnection('auto');
    return {
        ...(mode === 'auto' ? auto : comfy),
        mode,
        backendSettings: { comfy: { ...comfy }, auto: { ...auto } },
    };
}

/** Fills missing profile fields without mutating the stored object. */
export function normalizeConnection(connection) {
    if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
        return createDefaultConnection('comfy');
    }

    const mode = getConnectionMode(connection);
    const defaults = createDefaultConnection(mode);
    const savedBackends = connection.backendSettings && typeof connection.backendSettings === 'object'
        ? connection.backendSettings
        : {};
    const normalized = {
        ...defaults,
        ...connection,
        mode,
        backendSettings: {
            ...defaults.backendSettings,
            ...savedBackends,
        },
    };
    for (const backend of ['comfy', 'auto']) {
        if (!normalized.backendSettings[backend] || typeof normalized.backendSettings[backend] !== 'object') {
            normalized.backendSettings[backend] = { ...defaults.backendSettings[backend] };
        }
    }
    if (mode !== 'tavern') normalized.serverType = mode;

    // The legacy endpoint treated an empty selection as Tavern's default file.
    // Make that selection explicit so existing profiles keep generating.
    if (!connection.mode && mode === 'comfy' && !connection.comfyWorkflow) {
        normalized.comfyWorkflow = 'Default_Comfy_Workflow.json';
    }

    // Existing profiles stored a single custom connection at the top level.
    // Seed only that legacy backend's snapshot; preserve any explicit snapshots.
    if (!connection.mode && (connection.serverType === 'comfy' || connection.serverType === 'auto')) {
        normalized.backendSettings[mode] = {
            ...normalized.backendSettings[mode],
            ...getCustomValues(normalized),
        };
    }

    return normalized;
}
