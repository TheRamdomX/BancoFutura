DEFINE NAMESPACE banco;
USE NAMESPACE banco;
DEFINE DATABASE futura;
USE DATABASE futura;

-- Estructuras
DEFINE TABLE account SCHEMALESS;
DEFINE TABLE transaction SCHEMALESS;
DEFINE TABLE ui_state SCHEMALESS;

-- Datos Semilla
CREATE account:user_1 SET balance = 100000, user = 'user_1';
CREATE account:user_2 SET balance = 50000, user = 'user_2';

CREATE ui_state:current SET active_screen = 'DashboardScreen';
