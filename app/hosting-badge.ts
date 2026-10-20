// Removes hosting badges such as "Powered by Netlify" if a host injects one into the page. Only elements
// added directly to <html>/<body> are checked (that is where such badges are inserted), so the twin's own
// frequent DOM updates never trigger a scan. Content inside a cross-origin frame cannot be reached from
// the page; the developer badge's solid background covers that corner in any case.
const SELECTOR = [
  '#netlify-badge', '.netlify-badge', '[class*="netlify-badge" i]', '[id*="netlify-badge" i]', 'netlify-badge',
  'a[href*="netlify.com"]', 'iframe[src*="netlify" i]', '[data-netlify-badge]', '.powered-by-netlify',
].join(',');
const TEXT = /powered\s+by\s+netlify/i;

function isBadge(el: Element): boolean {
  if (el === document.head || el === document.body || /^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) return false;
  if (el.closest('.dev-badge, #root')) return false;
  if (el.tagName.startsWith('NETLIFY-')) return true; // custom elements such as the Netlify toolbar
  if (el.matches(SELECTOR) || el.querySelector(SELECTOR)) return true;
  const text = (el.textContent ?? '').trim();
  return text.length < 80 && TEXT.test(text);
}

function sweep() {
  for (const parent of [document.documentElement, document.body]) {
    if (!parent) continue;
    for (const el of Array.from(parent.children)) if (isBadge(el)) el.remove();
  }
  document.querySelectorAll(SELECTOR).forEach((el) => { if (!el.closest('.dev-badge, #root')) el.remove(); });
}

/**
 * With equal z-index (both at the maximum), the element later in the document paints on top. Keep the
 * developer badge last: at the end of <body>, or after anything a host appends to <html> itself.
 */
function keepBadgeOnTop() {
  const badge = document.querySelector('.dev-badge');
  const html = document.documentElement, body = document.body;
  if (!badge || !body) return;
  const afterBody = body.nextElementSibling !== null;
  const parent = afterBody ? html : body;
  if (parent.lastElementChild !== badge) parent.appendChild(badge);
}

export function removeHostingBadges() {
  sweep();
  keepBadgeOnTop();
  const obs = new MutationObserver((records) => {
    if (records.some((r) => Array.from(r.addedNodes).some((n) => n !== document.querySelector('.dev-badge')))) {
      sweep();
      keepBadgeOnTop();
    }
  });
  obs.observe(document.documentElement, { childList: true });
  if (document.body) obs.observe(document.body, { childList: true });
}
