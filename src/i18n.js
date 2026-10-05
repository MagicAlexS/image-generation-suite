/**
 * UI translations use the locale selected by SillyTavern. English source text
 * remains the fallback; locale selection and loading belong to the host.
 */
export function tr(key, fallback, params = {}) {
    const translate = globalThis.SillyTavern?.getContext?.().translate;
    const text = typeof translate === 'function' ? translate(fallback, key) : fallback;
    return String(text).replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name) =>
        Object.hasOwn(params, name) ? String(params[name]) : token);
}

/**
 * Translate our HTML before mounting it, including dynamically rendered tabs.
 * Only explicitly marked text leaves/attributes are touched. User values and
 * unmarked markup are preserved. The markers also work with ST's own observer.
 */
export function localizeHtml(html) {
    const document = new DOMParser().parseFromString(html, 'text/html');
    for (const element of document.body.querySelectorAll('[data-i18n]')) {
        for (const entry of element.getAttribute('data-i18n').split(';')) {
            const match = entry.match(/^(?:\[([^\]]+)\])?(igs\.[\w.-]+)$/);
            if (!match) continue;
            const [, attribute, key] = match;
            if (attribute) {
                if (element.hasAttribute(attribute)) {
                    element.setAttribute(attribute, tr(key, element.getAttribute(attribute)));
                }
            } else {
                element.textContent = tr(key, element.textContent);
            }
        }
    }
    return document.body.innerHTML;
}
