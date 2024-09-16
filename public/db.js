// db.js
const { Pool } = require('pg');

// Configuración de conexión a la base de datos
const pool = new Pool({
    user: 'mesa.entrada',
    host: '192.168.1.3',
    database: 'sistema',
    password: 'admin',
    port: 5432
});

module.exports = pool;
