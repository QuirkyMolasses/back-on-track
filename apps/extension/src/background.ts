import {
  importSchema,
  syncRequestSchema,
} from '../../../packages/domain/src/index';
declare const __APP_ORIGIN__: string;
// No content-script bridge, no window.postMessage, and no authentication data.
chrome.runtime.onMessageExternal.addListener(
  (message: unknown, sender, respond) => {
    if (
      sender.origin !== __APP_ORIGIN__ ||
      !sender.url ||
      new URL(sender.url).origin !== __APP_ORIGIN__
    )
      return false;
    const request = syncRequestSchema.safeParse(message);
    if (!request.success) return false;
    const nonce = request.data.nonce;
    void chrome.storage.local.get('pending').then(({ pending }) => {
      const parsed = importSchema.safeParse(pending);
      respond(
        parsed.success
          ? {
              kind: 'back-on-track/response',
              version: 1,
              nonce,
              payload: parsed.data,
            }
          : {
              kind: 'back-on-track/error',
              version: 1,
              nonce,
              error: 'Zuerst eine ILIAS-Seite mit der Erweiterung lesen.',
            },
      );
    });
    return true;
  },
);
