// 静态站 API 拦截器：把前端对 /api/v1/* 的 GET 请求重定向到快照 JSON
// （data/api/v1/<path>.json）。必须在应用 bundle 之前加载。
// 另负责 GitHub Pages 的 BrowserRouter 兜底（?p= 参数还原真实路由）。
(function () {
  var BASE = '/txy-site/app/data';
  // 静态快照标记：前端据此关掉快照上必然失真的交互（如分页 loadMore——
  // shim 按路径重定向会无视 query，page=2 拿到的仍是 page=1，审查 C6）
  window.__TXY_STATIC_SNAPSHOT__ = true;

  // --- GitHub Pages SPA 路由还原 ---
  // 404.html 把未知路由重定向到 /app/?p=/app/<route>，
  // 这里无刷新还原成真实路径，交给 react-router 接管。
  // 2026-09-19（审查 C16）：手工构造的 ?p=/macro / ?p=macro 也归一还原，
  // 不再静默落在首页。
  try {
    var p = new URLSearchParams(location.search).get('p');
    if (p) {
      if (p.indexOf('/app/') !== 0) {
        p = '/app/' + String(p).replace(/^\/+/, '');
      }
      history.replaceState(null, '', '/txy-site' + p);
    }
  } catch (e) { /* ignore */ }

  function snapshotUrl(url) {
    try {
      var u = new URL(url, location.origin);
      if (u.origin !== location.origin) return null; // 外链不拦
      if (u.pathname.indexOf('/api/v1/') !== 0) return null;
      return BASE + u.pathname + '.json';
    } catch (e) {
      return null;
    }
  }

  // --- 静态资源路径重定向（2026-08-30）---
  // 前端用绝对路径 fetch('/stocks.index.json')；在 GitHub Pages 子路径下会 404，
  // 白名单改写到 /txy-site/app/（与 assemble_site 的 index.html 资源改写同一原则）。
  var ASSET_PATH_PREFIXES = ['/stocks.index.json'];
  function assetUrl(url) {
    try {
      var u = new URL(url, location.origin);
      if (u.origin !== location.origin) return null;
      for (var i = 0; i < ASSET_PATH_PREFIXES.length; i++) {
        if (u.pathname.indexOf(ASSET_PATH_PREFIXES[i]) === 0) {
          return '/txy-site/app' + u.pathname + u.search;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // --- XMLHttpRequest（axios 默认通道）---
  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (String(url).indexOf('/api/v1/') >= 0) {
      if (method === 'GET' || method === 'get') {
        var target = snapshotUrl(url);
        if (target) arguments[1] = target;
      } else {
        arguments[1] = BASE + '/_method_not_allowed.json';
      }
    }
    return nativeOpen.apply(this, arguments);
  };

  // --- fetch（流式/局部代码使用）---
  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url;
      if (url && String(url).indexOf('/api/v1/') >= 0) {
        var method = ((init && init.method) || 'GET').toUpperCase();
        if (method === 'GET') {
          var target = snapshotUrl(url);
          if (target) return nativeFetch(target, init);
        } else {
          return Promise.resolve(
            new Response(JSON.stringify({ detail: '静态站点为只读快照' }), {
              status: 501,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        }
      }
      if (url) {
        var asset = assetUrl(url);
        if (asset) return nativeFetch(asset, init);
      }
      return nativeFetch.apply(this, arguments);
    };
  }
})();
