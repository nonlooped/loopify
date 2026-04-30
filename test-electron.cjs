const { app, BrowserWindow } = require("electron");
console.log("app:", app);
console.log("typeof app.whenReady:", typeof app.whenReady);
app.whenReady().then(() => {
  console.log("Electron is ready!");
  app.quit();
});
