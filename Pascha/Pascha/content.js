(() => {
  'use strict';

  let injected = false;

  function shouldInject() {
    return location.hostname.endsWith('tiktok.com') &&
      (location.pathname.includes('/upload') || location.pathname.includes('/creator-center'));
  }

  function injectBypass() {
    if (injected || !shouldInject()) return;
    injected = true;
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  injectBypass();

  const observer = new MutationObserver(injectBypass);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('popstate', injectBypass, true);
})();
