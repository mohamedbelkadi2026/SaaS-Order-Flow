// Push notification handlers — imported by the generated Workbox service worker.
// Keep this file in sync with the service worker scope (/push-handler.js).

self.addEventListener("push", function (event) {
  if (!event.data) return;
  var data;
  try { data = event.data.json(); } catch (_) { data = { title: "TajerGrow", body: event.data.text() }; }

  var options = {
    body:    data.body   || "",
    icon:    data.icon   || "/android-chrome-192.png",
    badge:   "/android-chrome-192.png",
    data:    { orderId: data.orderId, type: data.type },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || "TajerGrow", options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var orderId = event.notification.data && event.notification.data.orderId;
  var url = orderId ? "/orders?openOrder=" + orderId : "/orders";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
      for (var i = 0; i < clients.length; i++) {
        var c = clients[i];
        if ("navigate" in c && "focus" in c) {
          return c.navigate(url).then(function (fc) { return fc && fc.focus(); });
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
