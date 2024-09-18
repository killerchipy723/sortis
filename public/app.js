const express = require('express');
const path = require('path');
const session = require('express-session');
const { Pool } = require('pg'); // Para conectar a PostgreSQL
const bodyParser = require('body-parser');
const app = express();
const port = 3000;

// Configurar body-parser para procesar formularios
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Configurar la carpeta de archivos estáticos
app.use(express.static(path.join(__dirname, '/public')));

// Configurar express-session para manejar sesiones de usuario
app.use(session({
    secret: 'sortis-motos-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1 hora
}));

// Configurar conexión a PostgreSQL
const pool = new Pool({
    user: 'mesa.entrada',
    host: '192.168.1.3',
    database: 'sistema',
    password: 'admin',
    port: 5432
});

// Ruta para mostrar la página de login o redirigir a la página principal
app.get('/', (req, res) => {
    if (req.session.user) {
        // Si el usuario está autenticado, redirige a /index
        res.redirect('/index');
    } else {
        // Si el usuario no está autenticado, muestra la página de login
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

// Ruta para manejar el inicio de sesión
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // Consulta SQL para verificar usuario y clave
        const result = await pool.query('SELECT * FROM usuario WHERE usuario = $1 AND clave = $2', [username, password]);
        
        if (result.rows.length > 0) {
            // Usuario y contraseña correctos
            req.session.user = result.rows[0]; // Guardar usuario en sesión
            res.redirect('/index');
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
    }
});

// Ruta para la página principal (index.html)
app.get('/index', (req, res) => {
    if (req.session.user) {
        // Enviar el archivo index.html desde la carpeta public
        res.sendFile(path.join(__dirname, 'index.html'));
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

    try {
        const result = await pool.query(`
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
                afiliado.dni = $1
        `, [dni]);

        res.json(result.rows);
    } catch (error) {
        console.error('Error al buscar afiliado:', error);
        res.status(500).json({ error: 'Error al buscar afiliado' });
    }
});

// Ruta para obtener las cuotas basadas en idafiliado y idplan
app.get('/get-cuotas', async (req, res) => {
    const idafiliado = parseInt(req.query.idafiliado, 10);
    const idplan = parseInt(req.query.idplan, 10);

    if (isNaN(idafiliado) || isNaN(idplan)) {
        return res.status(400).json({ error: 'Parámetros inválidos' });
    }

    try {
        const result = await pool.query(
            `SELECT c.idcuota, c.numcuota, c.fechavenc, c.fechapago, c.importe, c.estado
            FROM cuotas c
            INNER JOIN altaplanafil apf ON c.idalta = apf.idalta
            WHERE apf.idafiliado = $1 AND apf.idplan = $2
            ORDER BY c.idcuota ASC`,
            [idafiliado, idplan]
        );

        if (result.rows.length > 0) {
            res.json(result.rows);
        } else {
            res.status(404).json({ message: 'No se encontraron cuotas' });
        }
    } catch (error) {
        console.error('Error al obtener cuotas:', error);
        res.status(500).json({ error: 'Error al obtener cuotas' });
    }
});

app.get('/get-vendedores', (req, res) => {
    const query = 'SELECT idvendedor, apenomb FROM vendedor';
    
    pool.query(query, (err, result) => {
        if (err) {
            console.error('Error al obtener vendedores:', err);
            res.status(500).send('Error al obtener vendedores');
        } else {
            res.json(result.rows);  // En PostgreSQL, se accede a los resultados a través de 'rows'
        }
    });
});

// Ruta para obtener la cuota por idCuota
app.get('/get-cuota/:idCuota', (req, res) => {
    const { idCuota } = req.params;
    const sql = `SELECT * FROM cuotas WHERE idcuota = $1`;
    pool.query(sql, [idCuota], (err, result) => {
        if (err) {
            console.error('Error al obtener la cuota:', err);
            res.status(500).send('Error al obtener la cuota');
        } else {
            res.json(result.rows[0]); // Enviar los datos de la cuota
            console.log('idcuota: ', idCuota);
        }
    });
});

// Ruta para actualizar una cuota
app.post('/update-cuota', (req, res) => {
    const { idcuota, importe, formapago, nrecibo, fechapago, idvendedor, obs, estado } = req.body;
    const fechaElegida = new Date(fechapago);

    console.log('Datos recibidos en el servidor:');
    console.log('ID Cuota:', idcuota);
    console.log('Importe:', importe);
    console.log('Forma de Pago:', formapago);
    console.log('Número de Recibo:', nrecibo);
    console.log('Fecha de Pago:', fechaElegida);
    console.log('ID Vendedor:', idvendedor);
    console.log('Observación:', obs);
    console.log('Estado:', estado);

    const sql = `UPDATE cuotas 
                 SET importe = $1, formapago = $2, nrecibo = $3, fechapago = $4, idvendedor = $5, obs = $6, estado = $7
                 WHERE idcuota = $8`;

    pool.query(sql, [
        parseFloat(importe),
        formapago,
        parseInt(nrecibo, 10),
        fechaElegida,
        parseInt(idvendedor, 10),
        obs,
        estado,
        parseInt(idcuota, 10)
    ], (err, result) => {
        if (err) {
            console.error("Error actualizando cuota:", err);
            res.status(500).send('Error actualizando cuota');
            console.log('idCuota: ', idcuota);
            console.log('IdVendedor: ', idvendedor);
        } else {
            console.log('Cuota actualizada correctamente');
            res.status(200).send('Cuota actualizada correctamente');
        }
    });
});

// Ruta para generar el PDF
app.get('/generar-pdf/:idc', async (req, res) => {
    const idc = req.params.idc;
    const sql = `SELECT c.idcuota, a.apenomb, c.numcuota, c.estado, c.obs, c.fechavenc, c.importe, c.fechapago 
                FROM cuotas c 
                JOIN altaplanafil ap ON c.idalta = ap.idalta 
                JOIN afiliado a ON ap.idafiliado = a.idafiliado 
                WHERE c.idcuota = $1`;

    try {
        const result = await client.query(sql, [idc]);

        if (result.rows.length > 0) {
            const cuota = result.rows[0];

            // Generar PDF usando PDFKit
            const doc = new PDFDocument();

            // Ruta donde se va a guardar el archivo PDF
            const ruta = path.join(__dirname, `OrdenPago-${idc}.pdf`);
            doc.pipe(fs.createWriteStream(ruta));

            // Dibujar un cuadro alrededor de la página
            doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).stroke();

            // Título del documento
            doc.fontSize(18).text('SORTIS-MOTOS', { align: 'left', indent: 30 });
            doc.text('San José de Metán', { indent: 30 });
            doc.fontSize(18).text('RECIBO DE PAGO', { align: 'center' });

            // Información de la cuota
            doc.moveDown().fontSize(12).text(`Identificador: ${idc}`, { align: 'right' });
            doc.moveDown().text(`Recibí de: ${cuota.apenomb}`);
            doc.text(`La cantidad de Pesos: $${cuota.importe}`);
            doc.text(`En concepto de Pago cuota N°: ${cuota.numcuota}`);
            doc.text(`Fecha de Vencimiento: ${cuota.fechavenc}`);
            doc.text(`Fecha de Pago: ${cuota.fechapago}`);
            doc.text(`Estado de la Cuota: ${cuota.estado}`);
            doc.text(`Observaciones: ${cuota.obs}`);

            // Firma y otros datos
            doc.moveDown().text('_________________________', { align: 'center' });
            doc.text('CAJERO', { align: 'center' });
            doc.text('_________________________', { align: 'right' });
            doc.text('FIRMA Y SELLO DE LA ENTIDAD', { align: 'right' });

            doc.end();

            // Enviar el archivo PDF generado al cliente
            res.download(ruta, `OrdenPago-${idc}.pdf`, (err) => {
                if (err) {
                    console.error("Error al descargar el PDF: ", err);
                }

                // Borrar el archivo temporal después de ser descargado
                fs.unlinkSync(ruta);
            });
        } else {
            res.status(404).send('No se encontró la cuota.');
        }
    } catch (err) {
        console.error("Error al generar el PDF:", err);
        res.status(500).send('Error en el servidor.');
    }
});

// Iniciar servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

app.listen(port, '0.0.0.0',() => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});
