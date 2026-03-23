import { Surreal } from 'surrealdb.js';

const db = new Surreal();

export async function initSurreal() {
  await db.connect('ws://127.0.0.1:8000/rpc');
  await db.use({ namespace: 'banco', database: 'futura' });
}

export async function subscribeToBalance(userId: string, callback: (balance: number) => void) {
  await db.live(`account:${userId}`, (action, result) => {
    if (result.balance) {
      callback(result.balance);
    }
  });
}

export async function subscribeToUIState(callback: (screen: string) => void) {
  await db.live('ui_state:current', (action, result) => {
    if (result.active_screen) {
      callback(result.active_screen);
    }
  });
}
