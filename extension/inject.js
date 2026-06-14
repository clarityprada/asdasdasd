(() => {
  'use strict';

  if (window.__clarityPradaAlwaysOnBypassInstalled) return;
  window.__clarityPradaAlwaysOnBypassInstalled = true;
  window.__clarityPradaBypassAlwaysOn = true;

  function isTikTokUploadRoute() {
    const href = String(window.location && window.location.href || '');
    return href.includes('/upload') || href.includes('/creator-center');
  }

  function cleanUploadPayload(root) {
    const stack = [root];
    const seen = new WeakSet();

    while (stack.length) {
      const obj = stack.pop();
      if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
      seen.add(obj);

      // This is the bypass logic from the 5.4.1_0 injection, kept always on and stripped of UI/logging.
      delete obj.draft;
      delete obj.canvas_config;
      delete obj.vedit_segment_info;

      if (Object.prototype.hasOwnProperty.call(obj, 'cloud_edit_is_use_video_canvas')) {
        obj.cloud_edit_is_use_video_canvas = false;
      }

      if (obj.post_type === 2) {
        obj.post_type = 3;
      }

      for (const key in obj) {
        const value = obj[key];
        if (value && typeof value === 'object') stack.push(value);
      }
    }
  }

  const originalStringify = JSON.stringify;
  JSON.stringify = function patchedJSONStringify(value, replacer, space) {
    if (isTikTokUploadRoute() && value && typeof value === 'object') {
      try {
        const hasUploadShape =
          Object.prototype.hasOwnProperty.call(value, 'single_post_req_list') ||
          Object.prototype.hasOwnProperty.call(value, 'vedit_common_info') ||
          Object.prototype.hasOwnProperty.call(value, 'post_common_info');

        if (hasUploadShape) cleanUploadPayload(value);
      } catch (err) {
        // Keep TikTok upload flow alive even if payload shape changes.
      }
    }

    return originalStringify.apply(this, arguments);
  };
})();
