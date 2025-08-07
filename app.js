const express = require('express');
const path = require('path');
const session = require('express-session');
const db = require('./db');
const bodyParser = require('body-parser');
const app = express();
const port = 4000;
const PDFDocument = require('pdfkit'); // Importar PDFKit
const fs = require('fs'); // Importar el módulo de sistema de archivos
const mysql = require('mysql2');
const mariadb = require('mariadb');
const twilio = require('twilio');


   

// Configurar body-parser para procesar formularios
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configurar la carpeta de archivos estáticos
app.use(express.static(path.join(__dirname,'public')));

// Configurar express-session para manejar sesiones de usuario
app.use(session({
    secret: 'sortis-motos-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1 hora
})); 

 

// Ruta para mostrar la página de login o redirigir a la página principal
app.get('/', (req, res) => {
    if (req.session.user) {
        // Si el usuario está autenticado, redirige a /index
        res.redirect('public','/index');
    } else {
        // Si el usuario no está autenticado, muestra la página de login
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});


let nombreUsuario = ''; 

// Ruta para manejar el inicio de sesión
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Ahora db es un pool, se obtiene la conexión desde aquí
        
        // Consulta SQL para verificar usuario y clave
        const [result] = await conn.query('SELECT * FROM usuarios WHERE usuario = ? AND clave = ?', [username, password]);
        
        if (result.length > 0) {
            // Usuario y contraseña correctos 

            req.session.user = result[0]; // Guardar usuario en sesión
            console.log(req.session); // Verifica que la sesión se está guardando correctamente

            nombreUsuario = result[0].apenomb;

            // Obtener el nivel del usuario
            const nivelUsuario = result[0].nivel; // Asegúrate de que 'nivel' es el campo correcto

            // Redirigir según el nivel del usuario
            if (nivelUsuario !== 'Gerente') {
                res.redirect('login.html'); // Redirige a index.html si no es Gerente
            } else {
                res.redirect('/registro'); // Redirige a registro.html si es Gerente
            }
        } else {
            // Usuario o contraseña incorrectos
            res.send(`
                <script>
                    alert("Usuario o contraseña incorrectos. Intente nuevamente.");
                    window.location.href = "/";
                </script>
            `);
        }
    } catch (error) {
        console.error('Error al consultar la base de datos', error);
        res.status(500).send('Error interno del servidor');
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool (no es estrictamente necesario, pero es recomendable)
    }
});

// Ruta para la página principal (index.html)
app.get('/index', (req, res) => {
    if (req.session.user) {
        // Enviar el archivo index.html desde la carpeta public
        res.sendFile(path.join(__dirname,'public', 'index.html'));
    } else {
        res.redirect('/');
    }
});

// Ruta para la página de registro (registro.html)
app.get('/registro', (req, res) => {
    if (req.session.user) {
        // Enviar el archivo registro.html desde la carpeta public
        res.sendFile(path.join(__dirname,'public', 'registro.html'));
    } else {
        res.redirect('/');
    }
});

// Ruta para obtener el nombre completo del usuario y enviarlo como respuesta JSON
app.get('/get-user-data', (req, res) => {
    if (req.session.user) {
        res.json({ apenomb: req.session.user.apenomb });
    } else {
        res.status(401).send('No autorizado');
    }
});

// Ruta para buscar afiliado por DNI
app.get('/buscar-afiliado', async (req, res) => {
    const dni = req.query.dni;

    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Obtener conexión desde el pool
        
        // Ejecutar la consulta SQL
        const [result] = await conn.query(`
            SELECT
                altaplanafil.idafiliado,
                plan.idplan,
                afiliado.apenomb AS afiliado,
                afiliado.dni,
                plan.nombreplan AS plan,
                plan.cantcuotas,
                altaplanafil.fechacobro AS fecha_alta,
                altaplanafil.estado
            FROM
                altaplanafil
            JOIN
                afiliado ON afiliado.idafiliado = altaplanafil.idafiliado
            JOIN
                plan ON plan.idplan = altaplanafil.idplan
            WHERE
                afiliado.dni = ?
        `, [dni]);

        // Enviar la respuesta en formato JSON
        res.json(result);
    } catch (error) {
        console.error('Error al buscar afiliado:', error);
        res.status(500).json({ error: 'Error al buscar afiliado' });
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool
    }
});



// Ruta para obtener las cuotas basadas en idafiliado y idplan
app.get('/get-cuotas', async (req, res) => {
    const idafiliado = parseInt(req.query.idafiliado, 10);
    const idplan = parseInt(req.query.idplan, 10);

    if (isNaN(idafiliado) || isNaN(idplan)) {
        return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Obtener conexión desde el pool
        
        // Realizamos la consulta para obtener las cuotas
        const [result] = await conn.query(
            `SELECT c.idcuota, c.numcuota, c.fechavenc, c.fechapago, c.importe, c.estado
            FROM cuotas c
            INNER JOIN altaplanafil apf ON c.idalta = apf.idalta
            WHERE apf.idafiliado = ? AND apf.idplan = ?
            ORDER BY c.idcuota ASC`,
            [idafiliado, idplan]
        );

        // Verificamos si encontramos cuotas
        if (result.length > 0) {
            res.json(result); // En MariaDB, result es un array
        } else {
            res.status(404).json({ message: 'No se encontraron cuotas' });
        }
    } catch (error) {
        console.error('Error al obtener cuotas:', error);
        res.status(500).json({ error: 'Error al obtener cuotas' });
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool
    }
});



// Ruta para obtener vendedores
app.get('/get-vendedores', async (req, res) => {
    const query = 'SELECT idvendedor, apenomb FROM vendedor';

    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Obtener conexión desde el pool
        
        // Realizamos la consulta
        const [result] = await conn.query(query);
        
        // Enviar los resultados como JSON
        res.json(result); // En MariaDB, result es un array
    } catch (err) {
        console.error('Error al obtener vendedores:', err);
        res.status(500).send('Error al obtener vendedores');
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool
    }
});

// Ruta para obtener la cuota por idCuota
app.get('/get-cuota/:idCuota', async (req, res) => {
    const { idCuota } = req.params;
    const sql = `SELECT * FROM cuotas WHERE idcuota = ?`;

    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Obtener conexión desde el pool

        // Realizamos la consulta
        const [result] = await conn.query(sql, [idCuota]);

        // Verificamos si encontramos la cuota
        if (result.length > 0) {
            res.json(result[0]); // Enviar los datos de la cuota
            console.log('idcuota: ', idCuota);
        } else {
            res.status(404).json({ error: 'Cuota no encontrada' });
        }
    } catch (err) {
        console.error('Error al obtener la cuota:', err);
        res.status(500).send('Error al obtener la cuota');
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool
    }
});

// Ruta para obtener el id vendedor dependiendo del nombre
app.get('/get-vendedor-id', async (req, res) => {
    const apenomb = req.query.apenomb;
    const sqlQuery = 'SELECT idvendedor FROM vendedor WHERE apenomb = ?';

    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Obtener conexión desde el pool
        
        // Ejecutar la consulta
        const [results] = await conn.query(sqlQuery, [apenomb]);

        // Verificar si se encontró el vendedor
        if (results.length > 0) {
            res.json({ idvendedor: results[0].idvendedor });
        } else {
            res.status(404).json({ error: 'Vendedor no encontrado' });
        }
    } catch (error) {
        console.error('Error ejecutando la consulta:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool
    }
});






app.post('/update-cuota', async (req, res) => {
    const { idcuota, importe, formapago, nrecibo, fechapago, idvendedor, obs, estado } = req.body;

    // Validaciones de los datos
    if (!idvendedor || isNaN(idvendedor)) {
        return res.status(400).send('ID Vendedor no válido');
    }
    if (!importe || isNaN(importe)) {
        return res.status(400).send('Importe no válido');
    }
    if (!nrecibo || isNaN(nrecibo)) {
        return res.status(400).send('Número de recibo no válido');
    }
    if (!fechapago || isNaN(new Date(fechapago).getTime())) {  // Verifica que sea una fecha válida
        return res.status(400).send('Fecha de pago no válida');
    }

    console.log('Datos recibidos en el servidor:');
    console.log('ID Cuota:', idcuota);
    console.log('Importe:', importe);
    console.log('Forma de Pago:', formapago);
    console.log('Número de Recibo:', nrecibo);
    console.log('Fecha de Pago:', fechapago);
    console.log('ID Vendedor:', idvendedor);
    console.log('Observación:', obs);
    console.log('Estado:', estado);

    // Consulta SQL para actualizar la cuota
    const sql = `UPDATE cuotas 
                 SET importe = ?, formapago = ?, nrecibo = ?, fechapago = ?, idvendedor = ?, obs = ?, estado = ?
                 WHERE idcuota = ?`;

    let conn;
    try {
        // Obtener una conexión del pool
        conn = await db.getConnection(); // Obtener conexión desde el pool

        // Ejecutar la consulta de actualización
        const [result] = await conn.query(sql, [
            parseFloat(importe),
            formapago,
            parseInt(nrecibo, 10),
            fechapago,
            parseInt(idvendedor, 10),
            obs,
            estado,
            parseInt(idcuota, 10)
        ]);

        // Verificar si la actualización afectó alguna fila
        if (result.affectedRows > 0) {
            console.log('Cuota actualizada correctamente');
            res.status(200).send('Cuota actualizada correctamente');
        } else {
            res.status(404).send('Cuota no encontrada');
        }
    } catch (err) {
        console.error("Error actualizando cuota:", err.message);
        res.status(500).send('Error actualizando cuota: ' + err.message);
    } finally {
        if (conn) conn.release(); // Liberar la conexión del pool
    }
});






app.get('/generar-pdf/:idc', async (req, res) => {
    const idc = req.params.idc;

    // Consulta SQL
    const sql = `SELECT c.idcuota, a.apenomb, c.numcuota, c.estado, c.obs, c.fechavenc, c.importe, c.fechapago 
                 FROM cuotas c 
                 JOIN altaplanafil ap ON c.idalta = ap.idalta 
                 JOIN afiliado a ON ap.idafiliado = a.idafiliado 
                 WHERE c.idcuota = ?`;

    let connection;
    try {
        connection = await db.getConnection();  // Obtén la conexión del pool

        const [result] = await connection.query(sql, [idc]);

        if (result && result.length > 0) {  // Verifica si hay resultados
            const cuota = result[0];  // Obtén la primera fila de resultados

            // Generar el PDF usando PDFKit
            const doc = new PDFDocument({ margin: 50 });
            const ruta = path.join(__dirname, `OrdenPago-${idc}.pdf`);
            const writeStream = fs.createWriteStream(ruta);
            doc.pipe(writeStream);

            // Encabezado con recuadro
            doc.rect(40, 40, 520, 120).stroke();  // Dibujar el recuadro
            doc.image('logo.png', 50, 50, { width: 80 })  // Logo de la empresa
                .fontSize(20).text('SORTIS-MOTOS', 240, 60, { align: 'right' })
                .fontSize(12).text('San José de Metán', 240, 90, { align: 'right' })
                .moveDown();
                
            doc.fontSize(13).text('Vendedor: ' + nombreUsuario, { align: 'right' }).moveDown(1);

            doc.fontSize(18).text('RECIBO DE PAGO', { align: 'left' }).moveDown(2);

            // Recuadro para los detalles del cliente
            doc.rect(40, 160, 520, 236).stroke();  // Dibujar el recuadro
            doc.fontSize(12)
                .text(`Identificador: ${idc}`, 50, 170, { width: 500, align: 'left' })  // Ajustar ancho
                .text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, 50, 190, { width: 500, align: 'left' })
                .moveDown()
                .text(`Recibí de: ${cuota.apenomb}`, 50, 210, { width: 500, align: 'left' })  // Ajustar ancho
                .text(`La cantidad de Pesos: $${cuota.importe}`, 50, 230, { width: 500, align: 'left' })
                .text(`En concepto de Pago cuota N°: ${cuota.numcuota}`, 50, 250, { width: 500, align: 'left' })
                .text(`Fecha de Vencimiento: ${new Date(cuota.fechavenc).toLocaleDateString()}`, 50, 270, { width: 500, align: 'left' })
                .text(`Fecha de Pago: ${new Date(cuota.fechapago).toLocaleDateString()}`, 50, 290, { width: 500, align: 'left' })
                .text(`Estado de la Cuota: ${cuota.estado}`, 50, 310, { width: 500, align: 'left' })
                .text(`Observaciones: ${cuota.obs}`, 50, 330, { width: 500, align: 'left' });

            // Línea separadora
            doc.moveDown().moveTo(50, doc.y).lineTo(550, doc.y).stroke();

            // Tabla de resumen con recuadro
            doc.moveDown(2).fontSize(12)
                .text('Resumen del Pago:', { bold: true }).moveDown(0.5);

            const tableTop = doc.y;
            doc.rect(40, tableTop - 10, 520, 120).stroke();  // Recuadro para la tabla

            // Bordes de la tabla
            doc.font('Helvetica-Bold');
            doc.text('Descripción', 50, tableTop, { width: 150, align: 'left' })  // Ajustar ancho
                .text('Variable', 200, tableTop, { width: 100, align: 'left' })  // Ajustar ancho
                .text('Importe de Cuota', 300, tableTop, { width: 150, align: 'left' })  // Ajustar ancho
                .text('Total', 450, tableTop, { width: 100, align: 'left' });  // Ajustar ancho

            // Cuerpo de la tabla
            doc.font('Helvetica');
            doc.text('Cuota ' + cuota.numcuota, 50, tableTop + 25, { width: 150, align: 'left' })  // Ajustar ancho
                .text('1', 200, tableTop + 25, { width: 100, align: 'left' })  // Ajustar ancho
                .text(`$${cuota.importe}`, 300, tableTop + 25, { width: 150, align: 'left' })  // Ajustar ancho
                .text(`$${cuota.importe}`, 450, tableTop + 25, { width: 100, align: 'left' });  // Ajustar ancho

            // Total a pagar con recuadro
            doc.moveDown(2);

            // Dibuja el recuadro para el total
            doc.rect(350, doc.y - 10, 200, 40).stroke();  // Recuadro para el total

            // Texto del total a pagar
            doc.font('Helvetica-Bold')  // Cambia la fuente a negrita
               .text(`Total a pagar: $${cuota.importe}`, 360, doc.y + 5, { width: 180, align: 'left' });  // Ajusta la posición y el ancho

            // Finalizar la escritura del PDF
            doc.end();

            // Esperar a que el archivo se haya cerrado
            writeStream.on('finish', () => {
                // Verificar el tamaño del archivo
                const stats = fs.statSync(ruta);
                console.log(`Tamaño del archivo PDF: ${stats.size} bytes`);

                // Enviar el archivo PDF generado al cliente
                res.download(ruta, `OrdenPago-${idc}.pdf`, (err) => {
                    if (err) {
                        console.error('Error al descargar el PDF: ', err);
                    }
                    // Borrar el archivo temporal después de la descarga
                    fs.unlink(ruta, (err) => {
                        if (err) {
                            console.error('Error al eliminar el PDF: ', err);
                        }
                    });
                });
            });
        } else {
            res.status(404).send('No se encontró la cuota.');
        }
    } catch (err) {
        console.error('Error al generar el PDF:', err);
        res.status(500).send('Error en el servidor.');
    } finally {
        if (connection) connection.release(); // Asegúrate de liberar la conexión
    }
});



// Cambia el método a POST para que coincida con la solicitud en el frontend
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error al cerrar sesión');
        }
        // En lugar de redirigir, envía una respuesta de éxito
        res.status(200).json({ message: 'Sesión cerrada exitosamente' });
    });
});

app.post('/recaudacion', async (req, res) => {
    const { fecha } = req.body;

    if (!fecha) {
        return res.status(400).json({ error: 'La fecha es obligatoria.' });
    }

    try {
        // Convertir y validar la fecha
       const parsedDate = new Date(fecha + 'T03:00:00'); // Ajustamos para Argentina (UTC-3)

        if (isNaN(parsedDate)) {
            return res.status(400).json({ error: 'La fecha proporcionada no es válida.' });
        }

        // Crear rango de fecha con horas
        const startDate = new Date(parsedDate);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(parsedDate);
        endDate.setHours(23, 59, 59, 999);

        const sqlDetalles = ` 
            SELECT 
                c.idcuota AS idcuota, 
                a.apenomb AS afiliado, 
                a.dni AS doc, 
                c.numcuota AS cuota, 
                c.fechavenc AS fvenc, 
                c.fechapago AS fpag, 
                c.formapago AS forma, 
                c.importe AS importe
            FROM cuotas c 
            JOIN altaplanafil ap ON c.idalta = ap.idalta 
            JOIN afiliado a ON ap.idafiliado = a.idafiliado 
            WHERE c.fechapago BETWEEN ? AND ? AND c.estado = 'Pagado'
        `;

        const sqlTotales = `
            SELECT 
                c.formapago AS forma, 
                SUM(c.importe) AS total
            FROM cuotas c 
            WHERE c.fechapago BETWEEN ? AND ? AND c.estado = 'Pagado'
            GROUP BY c.formapago
        `;

        const connection = await db.getConnection();

        // Ejecutar la primera consulta
        const [detalles] = await connection.query(sqlDetalles, [startDate, endDate]);

        // Ejecutar la segunda consulta
        const [totales] = await connection.query(sqlTotales, [startDate, endDate]);

        connection.release();

        return res.json({
            detalles: detalles,
            totales: totales
        });

    } catch (error) {
        console.error('Error al consultar la base de datos:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
});



// Cambia el método a POST para que coincida con la solicitud en el frontend
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Error al cerrar sesión');
        }
        // En lugar de redirigir, envía una respuesta de éxito
        res.status(200).json({ message: 'Sesión cerrada exitosamente' });
    });
});


app.listen(port, '0.0.0.0',() => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
