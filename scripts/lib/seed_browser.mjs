// Puts fixture takes into the browser build's IndexedDB.
//
// The browser build reads recordings from IndexedDB, not from
// public/recordings.json -- that path is only used when window.euphonia exists
// (see dashboard-react/src/App.tsx and src/browser/installBridge.ts). Anything
// that wants to render a populated dashboard in a browser has to write here.
//
// Schema mirrors dashboard-react/src/browser/db.ts: database "euphonia-browser"
// version 2, stores recordings/audio/insights/details, all keyPath "id".
// Detail rows are stored as {...detail, id}.

/**
 * @param {import('playwright').Page} page  a page already navigated to the app
 * @param {any[]} takes  from makeTakes(); each carries __detail
 * @returns {Promise<{recordings: number, details: number}>}
 */
export async function seedBrowserData(page, takes) {
  return page.evaluate(async (rows) => {
    const openDb = () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("euphonia-browser", 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of ["recordings", "audio", "insights", "details"]) {
            if (!db.objectStoreNames.contains(s)) {
              db.createObjectStore(s, { keyPath: "id" });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    const put = (db, store, value) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

    const db = await openDb();
    let details = 0;
    for (const row of rows) {
      const { __detail, ...rec } = row;
      await put(db, "recordings", rec);
      if (__detail) {
        await put(db, "details", { ...__detail, id: rec.id });
        details++;
      }
    }
    return { recordings: rows.length, details };
  }, takes);
}
