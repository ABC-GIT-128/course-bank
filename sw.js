/* Service Worker：让站点在校园网差、甚至断网时也能打开
 *
 * 策略：
 *   页面（导航请求）  → 先走网络，失败用缓存（保证更新能及时看到）
 *   其它同源静态资源  → 先给缓存，同时后台更新（stale-while-revalidate）
 *
 * 改版本号即可让所有客户端下次访问时换新缓存。
 */
const VERSION = 'oc-v2';
const CACHE = VERSION;

/* 首屏必需文件：装好之后离线也能进站 */
const SHELL = [
  './',
  './index.html',
  './quiz.html',
  './about.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/home.js',
  './assets/quiz.js',
  './assets/pwa.js',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './data/courses.js',
  './data/_status.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;   // 跨域一律不接管

  /* 页面导航：网络优先，断网回落到缓存的首页 / 当前页 */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  /* 课程数据（courses.js / 各课程.js）：网络优先
   * 这些文件很小、改动频繁，若用缓存优先，加了新课程后会有一段时间看不到。 */
  if (/\/data\/[^/]+\.js$/.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  /* 其它静态资源：缓存优先 + 后台更新 */
  e.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
