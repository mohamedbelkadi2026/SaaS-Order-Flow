// Push notification handlers — imported by the generated Workbox service worker.
// Keep this file in sync with the service worker scope (/push-handler.js).

self.addEventListener("push", function (event) {
  var rawText = event.data ? event.data.text() : "(empty)";
  console.log("[SW push] received event. data:", rawText);

  var data;
  if (!event.data) {
    console.warn("[SW push] event.data is null — showing fallback notification");
    data = { title: "TajerGrow", body: "Nouvelle notification" };
  } else {
    try {
      data = event.data.json();
      console.log("[SW push] parsed JSON:", JSON.stringify(data));
    } catch (e) {
      console.warn("[SW push] JSON parse failed, using text:", rawText);
      data = { title: "TajerGrow", body: rawText };
    }
  }

  if (!data.title) data.title = "TajerGrow";
  if (!data.body)  data.body  = "Notification";

  var options = {
    body:    data.body,
    icon:    data.icon  || "/android-chrome-192.png",
    badge:   "/android-chrome-192.png",
    data:    { orderId: data.orderId, type: data.type },
    vibrate: [200, 100, 200],
  };

  console.log("[SW push] calling showNotification:", data.title, options);

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(function () { console.log("[SW push] showNotification resolved"); })
      .catch(function (err) { console.error("[SW push] showNotification error:", err); })
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
