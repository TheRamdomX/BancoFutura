-- Consultas de auditoría útiles (Fase 8).
-- Ejecutar con:  surreal sql --conn http://localhost:8000 --user root --pass root \
--                            --ns banco --db futura < audit_queries.surql

-- Últimas 50 operaciones del agente
SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50;

-- Operaciones fallidas
SELECT * FROM audit_log WHERE success = false ORDER BY timestamp DESC;

-- Alertas de seguridad / intentos de login fallidos
SELECT * FROM audit_log WHERE action IN ['security_alert', 'login_failed']
ORDER BY timestamp DESC;

-- Transferencias del día
SELECT tool_name, parameters, timestamp
FROM audit_log
WHERE tool_name = 'make_transfer'
  AND success = true
  AND timestamp >= time::now() - 24h
ORDER BY timestamp DESC;

-- Resumen de uso por herramienta
SELECT tool_name, count() AS uses
FROM audit_log
GROUP BY tool_name;
