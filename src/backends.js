// Storage backends share one interface:
//   start(onItems)  — calls onItems(itemsArray) now and on every change (local or remote)
//   put(item) / del(id)
//   status          — 'local' | 'synced' | 'offline', with onStatus(cb)

export function localBackend(space) {
  const key = `todosmart:${space}`;
  let items = new Map();
  let notify = () => {};
  const load = () => {
    try { items = new Map(JSON.parse(localStorage.getItem(key) ?? '[]').map((it) => [it.id, it])); } catch { items = new Map(); }
  };
  const save = () => {
    try { localStorage.setItem(key, JSON.stringify([...items.values()])); } catch {}
    notify([...items.values()]);
  };
  // Other tabs of the same browser stay in sync.
  addEventListener('storage', (e) => { if (e.key === key) { load(); notify([...items.values()]); } });
  return {
    status: 'local',
    onStatus() {},
    start(cb) { notify = cb; load(); cb([...items.values()]); },
    put(item) { items.set(item.id, item); save(); },
    del(id) { items.delete(id); save(); },
  };
}

const FB = 'https://www.gstatic.com/firebasejs/10.12.2';

export async function firestoreBackend(space, config) {
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const fs = await import(`${FB}/firebase-firestore.js`);
  const app = initializeApp(config);
  // Local cache first: writes are instant and survive offline, then sync.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });
  const col = fs.collection(db, 'spaces', space, 'items');
  const statusListeners = [];
  const backend = {
    status: 'offline',
    onStatus(cb) { statusListeners.push(cb); },
    start(cb) {
      fs.onSnapshot(col, { includeMetadataChanges: true }, (snap) => {
        cb(snap.docs.map((d) => d.data()));
        const s = snap.metadata.fromCache || snap.metadata.hasPendingWrites ? 'offline' : 'synced';
        if (s !== backend.status) { backend.status = s; statusListeners.forEach((f) => f(s)); }
      }, (err) => console.error('[todosmart] sync error', err));
    },
    put(item) { fs.setDoc(fs.doc(col, item.id), item).catch((e) => console.error('[todosmart] write', e)); },
    del(id) { fs.deleteDoc(fs.doc(col, id)).catch((e) => console.error('[todosmart] delete', e)); },
  };
  return backend;
}
