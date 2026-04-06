// js/auth.js

const CLIENT_ID = "YOUR CLIENT ID";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";

let tokenClient = null;
let currentToken = null;
let onReadyCallback = null;
let onSignOutCallback = null;

// Called by app.js to register what happens after sign-in
export function onReady(callback) {
  onReadyCallback = callback;
}

export function onSignOut(callback) {
  onSignOutCallback = callback;
}

// Initialise GIS token client — must be called after GIS script loads
export function initAuth() {
  return new Promise((resolve) => {
    const waitForGIS = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(waitForGIS);

        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPE,
          callback: (response) => {
            if (response.error) {
              console.error("GIS error:", response.error);
              return;
            }
            currentToken = response.access_token;
            if (onReadyCallback) onReadyCallback(currentToken);
          },
        });

        resolve();
      }
    }, 100);
  });
}

// Triggered by the sign-in button
export function signIn() {
  tokenClient?.requestAccessToken({ prompt: "select_account" });
}

// Triggered by the sign-out button
export function signOut() {
  if (currentToken) {
    window.google.accounts.oauth2.revoke(currentToken);
    currentToken = null;
  }
  if (onSignOutCallback) onSignOutCallback();
}

// Returns a function that silently refreshes the token.
// Passed to DriveFiles as onTokenExpired.
export function makeRefreshCallback() {
  return () =>
    new Promise((resolve, reject) => {
      const refreshClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error));
          currentToken = resp.access_token;
          resolve(resp.access_token);
        },
      });
      refreshClient.requestAccessToken({ prompt: "" });
    });
}
