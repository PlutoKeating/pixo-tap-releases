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

  // ---- 分段标签（/docs/ 的安装步骤）：按系统默认选中，所有语言副本同步 ----
  const ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
  const detected = /Windows/i.test(ua) ? 'win' : /Android|iPhone|iPad|iPod/i.test(ua) ? 'mac' : /Linux|X11/i.test(ua) && !/Mac/i.test(ua) ? 'linux' : 'mac';
  const widgets = Array.from(document.querySelectorAll('.dtabs'));
  function pick(key) {
    widgets.forEach((w) => {
      w.setAttribute('data-ready', '');
      w.querySelectorAll('.dtab').forEach((b) => { const on = b.getAttribute('data-tab') === key; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
      w.querySelectorAll('.dpanel').forEach((p) => { p.hidden = p.getAttribute('data-tab') !== key; });
    });
  }
  if (widgets.length) {
    pick(detected);
    widgets.forEach((w) => {
      const tabs = Array.from(w.querySelectorAll('.dtab'));
      tabs.forEach((b, i) => {
        b.addEventListener('click', () => pick(b.getAttribute('data-tab')));
        b.addEventListener('keydown', (e) => {
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const n = tabs[(i + d + tabs.length) % tabs.length];
          pick(n.getAttribute('data-tab'));
          n.focus();
        });
      });
    });
  }

  // ---- 复制命令按钮 ----
  document.querySelectorAll('[data-copy]').forEach((b) => {
    b.addEventListener('click', async () => {
      let ok = false;
      try { await navigator.clipboard.writeText(b.getAttribute('data-copy')); ok = true; } catch (e) { /* 剪贴板不可用 */ }
      if (!ok) { const d = b.parentElement && b.parentElement.parentElement && b.parentElement.parentElement.querySelector('details'); if (d) d.open = true; return; }
      b.textContent = b.getAttribute('data-copied');
      b.classList.add('is-copied');
      setTimeout(() => { b.textContent = b.getAttribute('data-label'); b.classList.remove('is-copied'); }, 1800);
    });
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- 折叠卡片的平滑展开/收起 ----
  if (!reduce) {
    document.querySelectorAll('details.faq').forEach((d) => {
      const sum = d.querySelector('summary');
      if (!sum || !d.animate) return;
      sum.addEventListener('click', (e) => {
        e.preventDefault();
        if (d.__anim) d.__anim.cancel();
        const start = d.offsetHeight;
        if (!d.open) d.open = true;
        else d.setAttribute('data-closing', '');
        const closing = d.hasAttribute('data-closing');
        const end = closing ? sum.offsetHeight + 2 : d.scrollHeight + 2;
        d.style.overflow = 'hidden';
        const a = d.animate({ height: [start + 'px', end + 'px'] }, { duration: 260, easing: 'ease' });
        d.__anim = a;
        a.onfinish = a.oncancel = () => {
          if (closing) { d.open = false; d.removeAttribute('data-closing'); }
          d.style.overflow = ''; d.__anim = null;
        };
      });
    });
  }

  // ---- 进场微动效：只给尚未进入视口的块加淡入上移 ----
  if (!reduce && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.step, details.faq').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top > window.innerHeight * 0.9) { el.classList.add('will-reveal'); io.observe(el); }
    });
  }
})();
