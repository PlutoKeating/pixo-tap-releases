// 静态页面脚本：语言（pixo-language）、移动端菜单。无依赖。
(() => {
  const KEY = 'pixo-language';
  const root = document.documentElement;
  let lang = 'zh';
  try { lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch (e) { /* 存储不可用时使用默认中文 */ }

  function apply(next) {
    lang = next === 'en' ? 'en' : 'zh';
    root.lang = lang === 'en' ? 'en' : 'zh-CN';
    const title = root.getAttribute('data-title-' + lang);
    if (title) document.title = title;
    const desc = root.getAttribute('data-desc-' + lang);
    const meta = document.querySelector('meta[name="description"]');
    if (desc && meta) meta.setAttribute('content', desc);
    document.querySelectorAll('[data-aria-zh]').forEach((el) => el.setAttribute('aria-label', el.getAttribute('data-aria-' + lang)));
    const sel = document.getElementById('px-lang');
    if (sel) sel.value = lang;
  }
  apply(lang);

  const sel = document.getElementById('px-lang');
  if (sel) sel.addEventListener('change', () => {
    apply(sel.value);
    try { localStorage.setItem(KEY, lang); } catch (e) { /* 忽略 */ }
  });
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(e.newValue); });

  const header = document.getElementById('px-header');
  const btn = document.getElementById('px-menu-btn');
  if (header && btn) {
    const set = (open) => {
      if (open) header.setAttribute('data-open', ''); else header.removeAttribute('data-open');
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!header.hasAttribute('data-open')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && header.hasAttribute('data-open')) { set(false); btn.focus(); } });
    header.querySelectorAll('.px-nav a').forEach((a) => a.addEventListener('click', () => set(false)));
    window.matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) set(false); });
  }
})();
