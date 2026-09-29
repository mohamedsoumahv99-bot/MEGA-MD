import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export function runWithSessionStore(store, task) {
    return storage.run(store, task);
}

export function getSessionStore() {
    return storage.getStore() || null;
}
