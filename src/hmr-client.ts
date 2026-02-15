// This script is injected into HTML pages during dev mode.
// It connects to the dev server's WebSocket endpoint and handles reload/swap messages.
export const hmrClientScript = `<script>
(function() {
  const ws = new WebSocket('ws://' + location.host + '/__hmr');
  ws.onmessage = function(event) {
    const msg = JSON.parse(event.data);
    if (msg.type === 'reload') {
      location.reload();
    } else if (msg.type === 'css') {
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      links.forEach(function(link) {
        const url = new URL(link.href);
        url.searchParams.set('t', Date.now());
        link.href = url.toString();
      });
    }
  };
  ws.onclose = function() {
    console.log('[HMR] Connection lost. Attempting to reconnect...');
    setTimeout(function() { location.reload(); }, 1000);
  };
})();
</script>`
