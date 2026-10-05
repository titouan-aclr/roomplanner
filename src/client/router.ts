// Routage minimal : « / » (plans) et « /compte ». Les liens marqués data-nav restent dans l'application.
type Handler = (path: string) => void;
let handler: Handler = () => {};
let listening = false;

export function startRouter(h: Handler) {
  handler = h;
  if (listening) { handler(location.pathname); return; }
  listening = true;
  window.addEventListener('popstate', () => handler(location.pathname));
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-nav]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(a.getAttribute('href')!);
  });
  handler(location.pathname);
}

export function navigate(path: string) {
  if (path !== location.pathname) history.pushState(null, '', path);
  handler(path);
}
