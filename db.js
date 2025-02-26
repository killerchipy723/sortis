const mysql = require('mysql2');


const connection = mysql.createPool({
    host: '200.58.106.156',      
    user: 'c2710325_killer',           
    password: 'SistemaIES6021',           
    database: 'c2710325_sortis'    
}).promise();               


module.exports = connection;


