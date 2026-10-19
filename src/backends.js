// Storage backends share one interface over two collections, 'items' and 'tabs':
//   start(onChange)  — onChange(coll, docsArray, { fromCache }) now and on every change
//   put(coll, doc) / del(coll, id)
//   status           — 'local' | 'synced' | 'offline', with onStatus(cb)

export const COLLECTIONS = ['items', 'tabs'];

export function localBackend(space) {
  const key = (coll) => (coll === 'items' ? `todosmart:${space}` : `todosmart:${space}:${coll}`);
  const data = {};
  let notify = () => {};
  const load = (coll) => {
    try { data[coll] = new Map(JSON.parse(localStorage.getItem(key(coll)) ?? '[]').map((d) => [d.id, d])); } catch { data[coll] = new Map(); }
  };
  const emit = (coll) => notify(coll, [...data[coll].values()], { fromCache: false });
  const save = (coll) => {
    try { localStorage.setItem(key(coll), JSON.stringify([...data[coll].values()])); } catch {}
    emit(coll);
  };
  // Other tabs of the same browser stay in sync.
  addEventListener('storage', (e) => {
    const coll = COLLECTIONS.find((c) => key(c) === e.key);
    if (coll) { load(coll); emit(coll); }
  });
  return {
    status: 'local',
    onStatus() {},
    start(cb) { notify = cb; for (const c of COLLECTIONS) { load(c); emit(c); } },
    put(coll, doc) { data[coll].set(doc.id, doc); save(coll); },
    del(coll, id) { data[coll].delete(id); save(coll); },
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
  const col = (coll) => fs.collection(db, 'spaces', space, coll);
  const statusListeners = [];
  const setStatus = (s) => {
    if (s === backend.status) return;
    backend.status = s;
    statusListeners.forEach((f) => f(s));
  };
  const backend = {
    status: 'offline',
    onStatus(cb) { statusListeners.push(cb); },
    start(cb) {
      for (const coll of COLLECTIONS) {
        fs.onSnapshot(col(coll), { includeMetadataChanges: true }, (snap) => {
          const { fromCache, hasPendingWrites } = snap.metadata;
          cb(coll, snap.docs.map((d) => d.data()), { fromCache });
          if (coll === 'items') setStatus(fromCache || hasPendingWrites ? 'offline' : 'synced');
        }, (err) => console.error('[todosmart] sync error', coll, err));
      }
    },
    put(coll, doc) { fs.setDoc(fs.doc(col(coll), doc.id), doc).catch((e) => console.error('[todosmart] write', e)); },
    del(coll, id) { fs.deleteDoc(fs.doc(col(coll), id)).catch((e) => console.error('[todosmart] delete', e)); },
  };
  return backend;
}
