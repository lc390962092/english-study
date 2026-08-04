/* English 学习应用 — 公共脚本（主题切换、工具函数） */
(function () {
  'use strict';

  const THEME_KEY = 'english_theme';
  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';
  const THEME_AUTO = 'auto';

  const ICONS = {
    [THEME_LIGHT]: '☀️',
    [THEME_DARK]: '🌙',
    [THEME_AUTO]: '🌗'
  };

  function getSystemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getEffectiveTheme(stored) {
    if (stored === THEME_DARK || stored === THEME_LIGHT) return stored;
    return getSystemPrefersDark() ? THEME_DARK : THEME_LIGHT;
  }

  function applyTheme(stored) {
    const root = document.documentElement;
    const effective = getEffectiveTheme(stored);
    if (effective === THEME_DARK) {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
    document.body.classList.toggle('dark-mode', effective === THEME_DARK);
    updateToggleButton(stored, effective);
  }

  function getStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY) || THEME_AUTO;
    } catch (e) {
      return THEME_AUTO;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      // ignore storage errors
    }
  }

  function cycleTheme() {
    const current = getStoredTheme();
    let next;
    if (current === THEME_LIGHT) next = THEME_DARK;
    else if (current === THEME_DARK) next = THEME_AUTO;
    else next = THEME_LIGHT;
    setStoredTheme(next);
    applyTheme(next);
  }

  let toggleBtn = null;

  function updateToggleButton(stored, effective) {
    if (!toggleBtn) return;
    toggleBtn.textContent = ICONS[stored] || ICONS[effective];
    toggleBtn.title = `主题：${stored === THEME_AUTO ? '跟随系统' : stored === THEME_DARK ? '深夜模式' : '白天模式'}（点击切换）`;
    toggleBtn.setAttribute('aria-label', toggleBtn.title);
  }

  function createToggleButton() {
    if (toggleBtn || document.getElementById('english-theme-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'english-theme-toggle';
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', '切换主题');
    btn.addEventListener('click', cycleTheme);
    document.body.appendChild(btn);
    toggleBtn = btn;
  }

  function init() {
    const stored = getStoredTheme();
    applyTheme(stored);
    createToggleButton();
    updateToggleButton(stored, getEffectiveTheme(stored));

    // 监听系统主题变化，当处于 auto 时自动切换
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        if (getStoredTheme() === THEME_AUTO) {
          applyTheme(THEME_AUTO);
        }
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // 只在安全上下文（localhost / https）注册
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isLocalhost && location.protocol !== 'https:') return;

    // 自动适配 GitHub Pages 子目录或根目录部署
    const basePath = location.pathname.replace(/\/[^\/]*\.html$/, '').replace(/\/$/, '') || '';
    const swPath = (basePath ? basePath : '') + '/sw.js';
    navigator.serviceWorker.register(swPath)
      .then((reg) => {
        console.log('[English-SW] registered', reg.scope);
      })
      .catch((err) => {
        console.warn('[English-SW] registration failed', err);
      });
  }
  registerServiceWorker();

  // 暴露全局方法，方便页面调用
  window.ENGLISH = window.ENGLISH || {};
  window.ENGLISH.theme = {
    cycle: cycleTheme,
    get: getStoredTheme,
    set: setStoredTheme,
    apply: applyTheme,
    isDark: () => getEffectiveTheme(getStoredTheme()) === THEME_DARK
  };
})();
