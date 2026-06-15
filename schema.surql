-- ============================================================
-- NAMESPACE Y DATABASE
-- ============================================================
DEFINE NAMESPACE IF NOT EXISTS banco;
USE NS banco;
DEFINE DATABASE IF NOT EXISTS futura;
USE DB futura;

-- ============================================================
-- ANALYZERS PARA FULL-TEXT SEARCH (BM25)
-- ============================================================
DEFINE ANALYZER IF NOT EXISTS es_analyzer TOKENIZERS blank, class
    FILTERS snowball(spanish), lowercase;

-- ============================================================
-- TABLA: user (usuarios del banco)
-- ============================================================
DEFINE TABLE IF NOT EXISTS user SCHEMAFULL
    PERMISSIONS
        FOR select WHERE id = $auth.id
        FOR create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS username   ON user TYPE string  ASSERT string::len($value) >= 3;
DEFINE FIELD IF NOT EXISTS email      ON user TYPE string  ASSERT string::is::email($value);
DEFINE FIELD IF NOT EXISTS password   ON user TYPE string;
DEFINE FIELD IF NOT EXISTS full_name  ON user TYPE string;
DEFINE FIELD IF NOT EXISTS created_at ON user TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS is_active  ON user TYPE bool     DEFAULT true;

DEFINE INDEX IF NOT EXISTS idx_user_email    ON user FIELDS email    UNIQUE;
DEFINE INDEX IF NOT EXISTS idx_user_username ON user FIELDS username UNIQUE;

-- ============================================================
-- TABLA: account (cuentas bancarias)
-- ============================================================
DEFINE TABLE IF NOT EXISTS account SCHEMAFULL
    PERMISSIONS
        FOR select WHERE owner = $auth.id
        FOR create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS owner       ON account TYPE record<user>;
DEFINE FIELD IF NOT EXISTS balance     ON account TYPE decimal DEFAULT 0;
DEFINE FIELD IF NOT EXISTS currency    ON account TYPE string  DEFAULT 'CLP';
DEFINE FIELD IF NOT EXISTS type        ON account TYPE string  ASSERT $value IN ['checking', 'savings'];
DEFINE FIELD IF NOT EXISTS is_active   ON account TYPE bool    DEFAULT true;
DEFINE FIELD IF NOT EXISTS created_at  ON account TYPE datetime DEFAULT time::now();

-- ============================================================
-- TABLA: card (tarjetas asociadas a cuentas)
-- ============================================================
DEFINE TABLE IF NOT EXISTS card SCHEMAFULL
    PERMISSIONS
        FOR select WHERE account.owner = $auth.id
        FOR create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS account     ON card TYPE record<account>;
DEFINE FIELD IF NOT EXISTS last_four   ON card TYPE string  ASSERT string::len($value) = 4;
DEFINE FIELD IF NOT EXISTS type        ON card TYPE string  ASSERT $value IN ['debit', 'credit'];
DEFINE FIELD IF NOT EXISTS status      ON card TYPE string  DEFAULT 'active'
    ASSERT $value IN ['active', 'blocked', 'expired', 'cancelled'];
DEFINE FIELD IF NOT EXISTS daily_limit ON card TYPE decimal DEFAULT 500000;
DEFINE FIELD IF NOT EXISTS blocked_at  ON card TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS blocked_by  ON card TYPE option<string>;

-- ============================================================
-- TABLA: transaction (movimientos)
-- ============================================================
DEFINE TABLE IF NOT EXISTS transaction SCHEMAFULL
    PERMISSIONS
        FOR select WHERE from_account.owner = $auth.id
                      OR to_account.owner = $auth.id
        FOR create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS from_account ON transaction TYPE option<record<account>>;
DEFINE FIELD IF NOT EXISTS to_account   ON transaction TYPE option<record<account>>;
DEFINE FIELD IF NOT EXISTS amount       ON transaction TYPE decimal ASSERT $value > 0;
DEFINE FIELD IF NOT EXISTS currency     ON transaction TYPE string  DEFAULT 'CLP';
DEFINE FIELD IF NOT EXISTS type         ON transaction TYPE string
    ASSERT $value IN ['transfer', 'deposit', 'withdrawal', 'payment'];
DEFINE FIELD IF NOT EXISTS description  ON transaction TYPE option<string>;
DEFINE FIELD IF NOT EXISTS status       ON transaction TYPE string  DEFAULT 'completed'
    ASSERT $value IN ['pending', 'completed', 'failed', 'reversed'];
DEFINE FIELD IF NOT EXISTS created_at   ON transaction TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_tx_from ON transaction FIELDS from_account;
DEFINE INDEX IF NOT EXISTS idx_tx_to   ON transaction FIELDS to_account;
DEFINE INDEX IF NOT EXISTS idx_tx_date ON transaction FIELDS created_at;

-- ============================================================
-- TABLA: audit_log (auditoría de operaciones del agente)
-- ============================================================
DEFINE TABLE IF NOT EXISTS audit_log SCHEMAFULL
    PERMISSIONS FOR select, create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS actor       ON audit_log TYPE string;
DEFINE FIELD IF NOT EXISTS action      ON audit_log TYPE string;
DEFINE FIELD IF NOT EXISTS tool_name   ON audit_log TYPE string;
DEFINE FIELD IF NOT EXISTS parameters  ON audit_log TYPE option<object>;
DEFINE FIELD IF NOT EXISTS result      ON audit_log TYPE option<object>;
DEFINE FIELD IF NOT EXISTS success     ON audit_log TYPE bool;
DEFINE FIELD IF NOT EXISTS error_msg   ON audit_log TYPE option<string>;
DEFINE FIELD IF NOT EXISTS timestamp   ON audit_log TYPE datetime DEFAULT time::now();

-- ============================================================
-- TABLA: kb_document (documentos de la base de conocimiento)
-- ============================================================
DEFINE TABLE IF NOT EXISTS kb_document SCHEMAFULL
    PERMISSIONS FOR select FULL FOR create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS title       ON kb_document TYPE string;
DEFINE FIELD IF NOT EXISTS category    ON kb_document TYPE string;
DEFINE FIELD IF NOT EXISTS content     ON kb_document TYPE string;
DEFINE FIELD IF NOT EXISTS version     ON kb_document TYPE int    DEFAULT 1;
DEFINE FIELD IF NOT EXISTS created_at  ON kb_document TYPE datetime DEFAULT time::now();
DEFINE FIELD IF NOT EXISTS updated_at  ON kb_document TYPE datetime DEFAULT time::now();

-- ============================================================
-- TABLA: kb_chunk (fragmentos vectorizados)
-- ============================================================
DEFINE TABLE IF NOT EXISTS kb_chunk SCHEMAFULL
    PERMISSIONS FOR select FULL FOR create, update, delete NONE;

DEFINE FIELD IF NOT EXISTS document    ON kb_chunk TYPE record<kb_document>;
DEFINE FIELD IF NOT EXISTS content     ON kb_chunk TYPE string;
DEFINE FIELD IF NOT EXISTS chunk_index ON kb_chunk TYPE int;
DEFINE FIELD IF NOT EXISTS embedding   ON kb_chunk TYPE option<array>;
DEFINE FIELD IF NOT EXISTS created_at  ON kb_chunk TYPE datetime DEFAULT time::now();

-- Índice full-text BM25 sobre el contenido de los chunks
DEFINE INDEX IF NOT EXISTS idx_chunk_fts ON kb_chunk
    FIELDS content SEARCH ANALYZER es_analyzer BM25;

-- Índice vectorial MTREE para búsqueda semántica
-- (dimensión 768 para embeddings de Gemini text-embedding-004)
DEFINE INDEX IF NOT EXISTS idx_chunk_vec ON kb_chunk
    FIELDS embedding MTREE DIMENSION 768 DIST COSINE;

-- ============================================================
-- TABLA: ui_state (estado de la UI controlado por el agente)
-- Estado no sensible: lectura abierta para que el frontend pueda suscribirse
-- (live query). La escritura queda solo para el backend (root la bypasea).
-- ============================================================
DEFINE TABLE IF NOT EXISTS ui_state SCHEMALESS
    PERMISSIONS FOR select FULL FOR create, update, delete NONE;

-- ============================================================
-- ACCESS: autenticación de usuarios
-- ============================================================
DEFINE ACCESS IF NOT EXISTS user_access ON DATABASE
    TYPE RECORD
    SIGNUP (
        CREATE user SET
            username = $username,
            email = $email,
            password = crypto::argon2::generate($password),
            full_name = $full_name
    )
    SIGNIN (
        SELECT * FROM user WHERE
            username = $username
            AND crypto::argon2::compare(password, $password)
    )
    DURATION FOR TOKEN 24h FOR SESSION 7d;

-- ============================================================
-- DATOS SEMILLA
-- ============================================================

-- Usuarios
CREATE user:demo_1 SET
    username = 'jperez',
    email = 'jperez@example.com',
    password = crypto::argon2::generate('demo1234'),
    full_name = 'Juan Pérez';

CREATE user:demo_2 SET
    username = 'mlopez',
    email = 'mlopez@example.com',
    password = crypto::argon2::generate('demo1234'),
    full_name = 'María López';

-- Cuentas
CREATE account:acc_1 SET
    owner = user:demo_1,
    balance = 1500000,
    currency = 'CLP',
    type = 'checking';

CREATE account:acc_2 SET
    owner = user:demo_1,
    balance = 3200000,
    currency = 'CLP',
    type = 'savings';

CREATE account:acc_3 SET
    owner = user:demo_2,
    balance = 750000,
    currency = 'CLP',
    type = 'checking';

-- Tarjetas
CREATE card:card_1 SET
    account = account:acc_1,
    last_four = '4521',
    type = 'debit',
    status = 'active',
    daily_limit = 500000;

CREATE card:card_2 SET
    account = account:acc_1,
    last_four = '8873',
    type = 'credit',
    status = 'active',
    daily_limit = 1000000;

CREATE card:card_3 SET
    account = account:acc_3,
    last_four = '2210',
    type = 'debit',
    status = 'active',
    daily_limit = 300000;

-- Transacciones de ejemplo
CREATE transaction:tx_1 SET
    from_account = account:acc_1,
    to_account = account:acc_3,
    amount = 50000,
    type = 'transfer',
    description = 'Pago almuerzo',
    status = 'completed';

CREATE transaction:tx_2 SET
    from_account = account:acc_3,
    to_account = account:acc_1,
    amount = 25000,
    type = 'transfer',
    description = 'Devolución parcial',
    status = 'completed';

-- Estado UI inicial
CREATE ui_state:current SET
    active_screen = 'DashboardScreen',
    last_action = NONE,
    agent_message = NONE;
