// /go 微信中转页脚本：识别 UA、校验站内目标、引导到系统浏览器。无依赖，不发任何网络请求。
// 纯函数挂在 globalThis.PixoGo 上（测试用 node:vm 直接加载）；只有在浏览器里（存在 document）才会自动运行。
(function (g) {
  'use strict';

  /** ?to= 允许的站内路径（精确匹配目录路径，不含查询串与片段）。新增页面时同步这里与 sites/pages/README 的说明。 */
  var ALLOWED_PATHS = ['/', '/download/', '/download/history/', '/docs/', '/about/', '/privacy/', '/terms/', '/account/'];

  /** 返回站内安全路径；任何不在白名单内、带协议/主机/反斜杠/控制字符的值一律回到 '/'。 */
  function safeTarget(raw) {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) return '/';
    if (raw.charAt(0) !== '/' || raw.charAt(1) === '/' || raw.charAt(1) === '\\') return '/';
    if (/[\\\u0000-\u001f\u007f\s]/.test(raw)) return '/';
    var path = raw.split('#')[0].split('?')[0];
    if (path.length > 1 && path.charAt(path.length - 1) !== '/') path += '/';
    return ALLOWED_PATHS.indexOf(path) >= 0 ? path : '/';
  }

  /** 从 location.search 里取 to 参数并校验。 */
  function targetFromSearch(search) {
    var m = /(?:^|[?&])to=([^&#]*)/.exec(search || '');
    if (!m) return '/';
    var v;
    try { v = decodeURIComponent(m[1]); } catch (e) { return '/'; }
    return safeTarget(v);
  }

  /**
   * 识别内置浏览器。微信（含企业微信）UA 含 MicroMessenger；QQ 内置浏览器含 "QQ/"。
   * 注意：微信 UA 里还有 MQQBrowser（X5 内核），所以不能拿 MQQBrowser 判断 QQ；独立的 QQ 浏览器（MQQBrowser 且无 MicroMessenger / "QQ/"）不算内置。
   */
  function detectEnv(ua) {
    ua = String(ua || '');
    var wechat = /MicroMessenger/i.test(ua);
    var qq = !wechat && /(^|[\s(;])QQ\//.test(ua);
    var android = /Android/i.test(ua);
    var ios = /iPhone|iPad|iPod/i.test(ua);
    return { wechat: wechat, qq: qq, inApp: wechat || qq, android: android, ios: ios, app: wechat ? 'wechat' : qq ? 'qq' : '' };
  }

  /** 预览/测试钩子：?ua=wechat | wechat-android | wechat-ios | qq 模拟对应内置浏览器（只影响本页展示，不影响任何数据）。 */
  var MOCK_UA = {
    wechat: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 MicroMessenger/8.0.50',
    'wechat-android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 MicroMessenger/8.0.50 MMWEBID/1 Android',
    'wechat-ios': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.50',
    qq: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36 V1_AND_SQ_8.9.0 QQ/8.9.0 Android',
  };
  function mockFromSearch(search) {
    var m = /(?:^|[?&])ua=([a-z-]+)(?:&|#|$)/.exec(search || '');
    return m && Object.prototype.hasOwnProperty.call(MOCK_UA, m[1]) ? MOCK_UA[m[1]] : null;
  }

  /** Android 的 intent:// 链接（让系统用默认浏览器打开 https 地址）。微信常会拦截，只能作为用户点击后的尝试。 */
  function buildIntentUrl(origin, target) {
    var u = String(origin).replace(/^https?:\/\//, '');
    return 'intent://' + u + target + '#Intent;scheme=https;action=android.intent.action.VIEW;end';
  }

  g.PixoGo = { ALLOWED_PATHS: ALLOWED_PATHS, safeTarget: safeTarget, targetFromSearch: targetFromSearch, detectEnv: detectEnv, mockFromSearch: mockFromSearch, buildIntentUrl: buildIntentUrl };

  if (typeof document === 'undefined') return;

  var loc = g.location;
  var target = targetFromSearch(loc.search);
  var full = loc.origin + target;
  var env = detectEnv(mockFromSearch(loc.search) || (g.navigator && g.navigator.userAgent));
  var root = document.documentElement;

  function show(state) {
    document.body.setAttribute('data-state', state);
    document.querySelectorAll('[data-view]').forEach(function (el) { el.hidden = el.getAttribute('data-view') !== state; });
  }

  document.querySelectorAll('[data-go-link]').forEach(function (el) { el.textContent = full; });
  document.querySelectorAll('a[data-go-target]').forEach(function (a) { a.setAttribute('href', target); });

  if (!env.inApp) {
    // 普通浏览器：直接进入目标页（目标已经过白名单校验）。
    show('pending');
    loc.replace(target);
    return;
  }

  show('guide');
  root.setAttribute('data-app', env.app);
  root.setAttribute('data-os', env.android ? 'android' : env.ios ? 'ios' : 'other');
  document.querySelectorAll('[data-only]').forEach(function (el) { el.hidden = el.getAttribute('data-only') !== (env.android ? 'android' : env.ios ? 'ios' : ''); });

  var status = document.getElementById('go-copy-status');
  function say(key) {
    if (!status) return;
    status.setAttribute('data-key', key);
    status.textContent = '';
    var el = document.querySelector('[data-say="' + key + '"]');
    if (el) status.textContent = el.textContent;
  }

  function legacyCopy() {
    var ta = document.createElement('textarea');
    ta.className = 'go-offscreen';
    ta.value = full;
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, full.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  var copyBtn = document.getElementById('go-copy');
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      if (g.navigator && g.navigator.clipboard && g.isSecureContext) {
        g.navigator.clipboard.writeText(full).then(function () { say('ok'); }, function () { say(legacyCopy() ? 'ok' : 'fail'); });
      } else {
        say(legacyCopy() ? 'ok' : 'fail');
      }
    });
  }

  var intentBtn = document.getElementById('go-intent');
  if (intentBtn) {
    // 仅在用户点击后尝试；微信多数版本会拦截 intent://，页面保持不变，引导仍然有效。
    intentBtn.addEventListener('click', function () { loc.href = buildIntentUrl(loc.origin, target); });
  }
})(globalThis);
