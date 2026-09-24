// ARC Raiders Event Timer — Service Worker
// Receives Web Push events from the Cloudflare Worker and displays a
// notification, even if this app isn't open in any tab.

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "ARC Raiders", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ARC Raiders";
  const options = {
    body: data.body || "",
    tag: "arc-reminder",
    renotify: true,
    data: { url: self.registration.scope }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
