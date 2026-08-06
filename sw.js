/* English PWA Service Worker */
const CACHE_NAME = 'english-study-v1';

// 根据 SW 脚本所在路径自动推断项目 base 路径
const SW_PATH = self.location.pathname; // e.g. /jlpt-study/sw.js or /sw.js
const BASE = SW_PATH.replace(/\/sw\.js$/, '') || '';

const STATIC_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/study.html',
  BASE + '/grammar.html',
  BASE + '/quiz.html',
  BASE + '/exam.html',
  BASE + '/css/common.css',
  BASE + '/js/common.js',
  BASE + '/site.webmanifest',
  BASE + '/icons/icon-192x192.png',
  BASE + '/icons/icon-512x512.png'
];

// JSON 数据文件采用按需缓存策略
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  // 静态资源：Cache First，回退 network
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // JSON 数据：Network First，缓存一份
  if (url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(request));
    return;
  }
});

function isStaticAsset(url) {
  const path = url.pathname;
  return path.endsWith('.css') ||
         path.endsWith('.js') ||
         path.endsWith('.html') ||
         path.endsWith('.webmanifest') ||
         path.endsWith('.png') ||
         path.endsWith('.jpg') ||
         path.endsWith('.svg') ||
         path === '/english-study/';
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200 && response.type === 'basic') {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}
