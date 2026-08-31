// AI 巡检 API 地址（由 ai-service/start-online.sh 自动更新公网隧道）
// 本地开发走 127.0.0.1；线上域名走 Cloudflare Tunnel
(function () {
  var local = 'http://127.0.0.1:8765';
  var publicApi = 'https://systematic-karma-loads-distribute.trycloudflare.com';
  var host = location.hostname || '';
  if (host === '127.0.0.1' || host === 'localhost') {
    window.SAFETY_AI_API = local;
  } else {
    window.SAFETY_AI_API = publicApi;
  }
})();
