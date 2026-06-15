import { Surreal } from "surrealdb";

const SURREAL_URL =
  process.env.EXPO_PUBLIC_SURREAL_URL || "ws://localhost:8000/rpc";
const NS = "banco";
const DB = "futura";

let db: Surreal | null = null;

export async function getDb(): Promise<Surreal> {
  if (!db) {
    db = new Surreal();
    await db.connect(SURREAL_URL);
    await db.use({ namespace: NS, database: DB });
  }
  return db;
}

/** Inicia sesión con el access `user_access` (JWT por record). */
export async function signIn(username: string, password: string) {
  const conn = await getDb();
  const token = await conn.signin({
    namespace: NS,
    database: DB,
    access: "user_access",
    variables: { username, password },
  });
  return token;
}

export async function signOut() {
  if (db) {
    await db.invalidate();
  }
}

/** Devuelve las cuentas visibles para el usuario autenticado. */
export async function getAccounts(): Promise<any[]> {
  const conn = await getDb();
  const res = await conn.query<any[][]>(
    "SELECT id, balance, currency, type FROM account ORDER BY type;"
  );
  return (res?.[0] as any[]) || [];
}

export async function getTransactions(
  accountId: string,
  limit = 20
): Promise<any[]> {
  const conn = await getDb();
  const res = await conn.query<any[][]>(
    `SELECT *, from_account.owner.full_name AS from_name,
            to_account.owner.full_name AS to_name
     FROM transaction
     WHERE from_account = type::thing('account', $acct)
        OR to_account = type::thing('account', $acct)
     ORDER BY created_at DESC LIMIT $limit;`,
    { acct: accountId.replace("account:", ""), limit }
  );
  return (res?.[0] as any[]) || [];
}

export async function getCards(): Promise<any[]> {
  const conn = await getDb();
  const res = await conn.query<any[][]>(
    "SELECT id, last_four, type, status, daily_limit FROM card;"
  );
  return (res?.[0] as any[]) || [];
}

/** ID de registro como string legible (e.g. "account:acc_1"). */
export function recordId(id: any): string {
  return typeof id === "string" ? id : id?.toString?.() ?? String(id);
}
