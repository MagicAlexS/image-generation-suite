#!/usr/bin/env node
/**
 * Local browser fixture for the real IGS connection settings UI.
 * No dependencies beyond Node.js built-ins. All /api/sd requests are answered
 * in memory; backend URLs are never contacted and image generation is blocked.
 *
 * Usage: node tests/connection-preview.mjs [--jquery="D:\\SillyTavern-release\\public\\lib\\jquery-3.5.1.min.js"]
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const jqueryArg = args.find(arg => arg.startsWith('--jquery='))?.slice('--jquery='.length);
const jqueryPath = jqueryArg || 'D:\\SillyTavern-release\\public\\lib\\jquery-3.5.1.min.js';
const port = Number(args.find(arg => arg.startsWith('--port='))?.slice('--port='.length) || 8767);

const workflowStore = new Map([
    ['Demo.json', JSON.stringify({
        '1': { class_type: 'CLIPTextEncode', inputs: { text: '%prompt%', clip: ['4', 1] } },
        '2': { class_type: 'KSampler', inputs: { seed: '%seed%', steps: '%steps%', cfg: '%scale%', sampler_name: '%sampler%', scheduler: '%scheduler%', denoise: '%denoise%', positive: ['1', 0], negative: ['3', 0], latent_image: ['5', 0] } },
        '3': { class_type: 'CLIPTextEncode', inputs: { text: '%negative_prompt%', clip: ['4', 1] } },
        '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '%model%' } },
        '5': { class_type: 'EmptyLatentImage', inputs: { width: '%width%', height: '%height%', batch_size: 1 } },
    }, null, 2)],
    ['Portrait.json', JSON.stringify({
        '1': { class_type: 'CLIPTextEncode', inputs: { text: '%prompt%', clip: ['3', 1] } },
        '2': { class_type: 'KSampler', inputs: { seed: '%seed%', steps: '%steps%', cfg: '%scale%', sampler_name: '%sampler%', scheduler: '%scheduler%', denoise: '%denoise%' } },
        '3': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: '%model%' } },
    }, null, 2)],
]);
const sdSettings = {
    source: 'comfy', comfy_url: 'http://demo:8188', comfy_workflow: 'Demo.json', model: 'demo-model',
    steps: 20, width: 1024, height: 1024, scale: 7, sampler: 'euler', comfy_placeholders: [],
};
const customSnapshot = {
    serverType: 'comfy', comfyUrl: 'http://127.0.0.1:8188', autoUrl: 'http://localhost:7860', autoAuth: '',
    model: '', vae: '', sampler: '', scheduler: '', steps: 20, cfgScale: 7, width: 512, height: 512,
    denoisingStrength: 0.7, clipSkip: 1, seed: -1, comfyWorkflow: 'Demo.json', workflowVariables: [],
};
const profile = { id: 'preview-profile', name: 'Preview', connection: { ...customSnapshot, mode: 'tavern', backendSettings: { comfy: { ...customSnapshot }, auto: { ...customSnapshot, serverType: 'auto' } } } };
const diagnostics = { saved: 0, actions: [] };

function json(res, value, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(value));
}
async function requestBody(req) {
    let data = '';
    for await (const chunk of req) data += chunk;
    try { return data ? JSON.parse(data) : {}; } catch { return {}; }
}
function contentType(file) {
    return file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
}
async function serveFile(res, file, transform = value => value) {
    try {
        const data = await readFile(file, 'utf8');
        res.writeHead(200, { 'content-type': contentType(file), 'cache-control': 'no-store' });
        res.end(transform(data));
    } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`Preview fixture could not read ${path.basename(file)}: ${error.message}`);
    }
}

const hostSource = `
export const extension_settings = { sd: window.__previewSdSettings };
export const user_avatar = '';
export function getRequestHeaders() { return { 'Content-Type': 'application/json' }; }
export function getContext() { return { extensionSettings: {}, characters: [], translate: (fallback, key) => window.__previewTranslate(fallback, key) }; }
export function formatCharacterAvatar(value) { return value || ''; }
export function getCharacterAvatar() { return ''; }
export function getUserAvatar() { return ''; }
export function substituteParams(value) { return String(value ?? ''); }
export function getBase64Async(value) { return Promise.resolve(value); }
export const SlashCommandParser = { commands: { imagine: { callback: async () => '/mock/generated.png' } } };
`;

const shell = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IGS connection preview</title><link rel="stylesheet" href="/style.css"><style>
:root{color-scheme:dark;--SmartThemeBodyColor:#d7d9df;--SmartThemeEmColor:#fff;--SmartThemeBlurTintColor:#17191e;--SmartThemeBorderColor:#454a54;--SmartThemeQuoteColor:#aab3c4;--SmartThemeChatTintColor:#20242b;--SmartThemeUserMesBlurTintColor:#20242b;--SmartThemeBotMesBlurTintColor:#20242b}*{box-sizing:border-box}body{margin:0;background:#101216;color:#d7d9df;font:14px/1.5 system-ui,sans-serif}.preview-shell{width:min(calc(100vw - 24px),960px);margin:18px auto}.preview-banner{padding:12px 16px;border:1px solid #b27e3b;background:#302516;color:#ffd694;border-radius:8px;margin-bottom:12px}.preview-layout{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start}.preview-main,.preview-info{border:1px solid #353941;border-radius:8px;background:#191c22;padding:14px}.preview-info{position:sticky;top:12px}.preview-info h2{font-size:14px;margin:0 0 8px}.preview-info pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;color:#bdc6d6}.preview-log{max-height:130px;overflow:auto;border-top:1px solid #383c44;padding-top:8px;font-size:12px}.igs-settings-panel{min-height:400px}.igs-modal-field input,.igs-modal-field select,.igs-modal-field textarea{max-width:100%}.igs-connection-preview-toast{padding:6px 8px;border-radius:5px;margin:4px 0;background:#303844}.preview-narrow .preview-layout{grid-template-columns:1fr}.preview-narrow .preview-info{position:static}@media(max-width:720px){.preview-layout{grid-template-columns:1fr}.preview-info{position:static}.preview-shell{width:min(calc(100vw - 16px),500px);margin:8px auto}}</style></head><body>
<main class="preview-shell"><div class="preview-banner"><strong>模拟配置预览</strong> · 使用项目真实连接设置渲染与绑定；后端仅为本地内存模拟，禁止真实生图请求。</div><div class="preview-layout"><section class="preview-main"><div id="igs_settings_panel"></div></section><aside class="preview-info"><h2>实时配置状态</h2><pre id="preview-state"></pre><div class="preview-log" id="preview-log"></div></aside></div></main>
<script src="/jquery.js"></script><script>
window.__previewSdSettings=${JSON.stringify(sdSettings)};
window.__previewProfile=${JSON.stringify(profile)};
window.__previewDiagnostics=${JSON.stringify(diagnostics)};
const log=document.getElementById('preview-log');window.toastr={success:m=>toast('✓ '+m),info:m=>toast('ⓘ '+m),warning:m=>toast('⚠ '+m),error:m=>toast('✕ '+m)};function toast(m){const row=document.createElement('div');row.className='igs-connection-preview-toast';row.textContent=m;log.prepend(row)}
window.confirm=()=>true;window.prompt=(m,d='')=>{const v=window.promptValue;if(v!==undefined){delete window.promptValue;return v}return d||'NewWorkflow.json'};
function refreshState(){document.getElementById('preview-state').textContent=JSON.stringify({mode:window.__previewProfile.connection.mode,connection:window.__previewProfile.connection,tavern:window.__previewSdSettings,mockWorkflows:window.__previewWorkflowNames},null,2)}window.__previewRefresh=refreshState;
window.__previewWorkflowNames=['Demo.json','Portrait.json'];if(new URLSearchParams(location.search).get('width')==='360'){document.body.classList.add('preview-narrow');document.querySelector('.preview-shell').style.width='360px'}window.__previewRefresh();
(async()=>{const localeResponse=await fetch('/locales/zh-cn.json');if(!localeResponse.ok)throw new Error('中文目录加载失败');const locale=await localeResponse.json();window.SillyTavern={getContext:()=>({translate:(fallback,key)=>locale[key]??fallback})};window.__previewTranslate=(fallback,key)=>locale[key]??fallback;const {openSettingsModal}=await import('/src/settingsModal.js');openSettingsModal({},'connection');document.addEventListener('input',()=>setTimeout(refreshState,0));document.addEventListener('change',()=>setTimeout(refreshState,0));})().catch(e=>{document.getElementById('igs_settings_panel').textContent='预览加载失败：'+e.stack});
</script></body></html>`;

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/') return res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(shell);
    if (url.pathname === '/jquery.js') return serveFile(res, jqueryPath);
    if (url.pathname === '/style.css') return serveFile(res, path.join(root, 'style.css'));
    if (url.pathname === '/locales/zh-cn.json') return serveFile(res, path.join(root, 'locales', 'zh-cn.json'), value => value);
    if (url.pathname === '/host.js') return res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(hostSource);
    if (url.pathname === '/mock/profiles.js') {
        const source = await readFile(path.join(root, 'src/settingsModal.js'), 'utf8');
        const names = new Set();
        for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]\.\/profiles\.js['"]/g)) {
            for (const raw of match[1].split(',')) { const name = raw.trim().split(/\s+as\s+/)[0]; if (name) names.add(name); }
        }
        const exports = [...names].map(name => {
            if (name === 'getActiveProfile') return `export function ${name}(){return window.__previewProfile}`;
            if (name === 'getSettings') return `export function ${name}(){return {profiles:{[window.__previewProfile.id]:window.__previewProfile},activeProfileId:window.__previewProfile.id}}`;
            if (name === 'saveProfiles') return `export function ${name}(){window.__previewDiagnostics.saved++;window.__previewRefresh?.()}`;
            return `export function ${name}(...args){return ${name === 'exportAllProfiles' ? 'null' : 'undefined'}}`;
        }).join('\n');
        return res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(exports);
    }
    if (url.pathname === '/mock/lora.js' || url.pathname === '/mock/lora_agent.js') {
        const names = url.pathname.endsWith('lora.js') ? ['addLoraEntry','deleteLoraEntry','updateLoraEntry','toggleLoraEntry'] : ['discoverConnectionProfiles'];
        const source = names.map(name => `export function ${name}(){return ${name === 'discoverConnectionProfiles' ? '[]' : 'undefined'}}`).join('\n');
        return res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(source);
    }
    const moduleMap = {
        '/src/settingsModal.js': ['settingsModal.js', text => text
            .replaceAll("'./profiles.js'", "'/mock/profiles.js'")
            .replaceAll("'./lora.js'", "'/mock/lora.js'")
            .replaceAll("'./lora_agent.js'", "'/mock/lora_agent.js'")],
        '/src/connection.js': ['connection.js', text => text
            .replaceAll("'../../../../../script.js'", "'/host.js'")
            .replaceAll("'../../../../extensions.js'", "'/host.js'")
            .replaceAll("'../../../../utils.js'", "'/host.js'")
            .replaceAll("'../../../../slash-commands/SlashCommandParser.js'", "'/host.js'")],
        '/src/connectionSettings.js': ['connectionSettings.js', text => text.replaceAll("'../../../../extensions.js'", "'/host.js'").replaceAll("'../../../../../script.js'", "'/host.js'")],
        '/src/i18n.js': ['i18n.js', text => text],
        '/src/promptTemplates.js': ['promptTemplates.js', text => text],
    };
    if (moduleMap[url.pathname]) {
        const [file, transform] = moduleMap[url.pathname];
        return serveFile(res, path.join(root, 'src', file), transform);
    }
    if (url.pathname === '/diagnostics') return json(res, { profile, sdSettings, workflowNames: [...workflowStore.keys()], diagnostics, safe: true });
    if (url.pathname.startsWith('/api/sd/')) {
        const body = await requestBody(req);
        if (url.pathname.includes('/generate') || url.pathname.includes('txt2img') || url.pathname.includes('img2img')) {
            diagnostics.actions.push({ path: url.pathname, blocked: true });
            return json(res, { error: 'Preview fixture blocks all image generation requests.' }, 403);
        }
        if (url.pathname.endsWith('/ping')) return json(res, { ok: true });
        if (url.pathname.endsWith('/workflows')) return json(res, [...workflowStore.keys()]);
        if (url.pathname.endsWith('/workflow')) return json(res, workflowStore.get(body.file_name) ?? '{}');
        if (url.pathname.endsWith('/save-workflow')) { workflowStore.set(body.file_name, body.workflow ?? '{}'); return json(res, { ok: true }); }
        if (url.pathname.endsWith('/delete-workflow')) { workflowStore.delete(body.file_name); return json(res, { ok: true }); }
        if (url.pathname.endsWith('/rename-workflow')) { const data = workflowStore.get(body.old_name); if (data !== undefined) workflowStore.delete(body.old_name); workflowStore.set(body.new_name, data ?? '{}'); return json(res, { ok: true }); }
        if (url.pathname.endsWith('/models')) return json(res, ['demo-model','model-two']);
        if (url.pathname.endsWith('/vaes')) return json(res, ['Automatic','demo-vae']);
        if (url.pathname.endsWith('/samplers')) return json(res, ['euler','euler_ancestral','dpmpp_2m']);
        if (url.pathname.endsWith('/schedulers')) return json(res, ['normal','karras']);
        return json(res, { error: 'Unimplemented local preview API route.' }, 404);
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
});

server.listen(port, '127.0.0.1', () => {
    console.log(`IGS connection preview: http://127.0.0.1:${port}${process.argv.includes('--width=360') ? '?width=360' : ''}`);
    console.log(`jQuery source: ${jqueryPath}`);
    console.log('Only local in-memory /api/sd mocks are active. Press Ctrl+C to stop.');
});
process.on('SIGINT', () => server.close(() => process.exit(0)));
