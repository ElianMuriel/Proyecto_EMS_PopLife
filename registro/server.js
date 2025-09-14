const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// Conectar a la base de datos SQLite
const db = new sqlite3.Database("./database.db", (err) => {
  if (err) console.error(err.message);
  else console.log("Conectado a la base de datos SQLite.");
});

// Crear tablas si no existen
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS registros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    entrada TEXT,
    salida TEXT,
    tiempo_total INTEGER, -- minutos trabajados
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// =======================
// ENDPOINTS
// =======================

// Login simple por nombre (sin contraseña)
app.post("/login", (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).send({ error: "Nombre requerido" });

  db.get("SELECT * FROM users WHERE nombre=?", [nombre], (err, row) => {
    if (err) return res.status(500).send({ error: err.message });
    if (row) res.send(row);
    else {
      db.run("INSERT INTO users(nombre) VALUES(?)", [nombre], function (err) {
        if (err) return res.status(500).send({ error: err.message });
        db.get("SELECT * FROM users WHERE id=?", [this.lastID], (err, row) => {
          res.send(row);
        });
      });
    }
  });
});

// Registrar entrada
app.post("/entrada", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).send({ error: "userId requerido" });

  const ahora = new Date().toISOString();
  db.run(
    "INSERT INTO registros(user_id,entrada) VALUES(?,?)",
    [userId, ahora],
    function (err) {
      if (err) return res.status(500).send({ error: err.message });
      res.send({ success: true });
    }
  );
});

// Registrar salida y calcular tiempo total
app.post("/salida", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).send({ error: "userId requerido" });

  // Buscar último registro sin salida
  db.get(
    "SELECT * FROM registros WHERE user_id=? AND salida IS NULL ORDER BY id DESC LIMIT 1",
    [userId],
    (err, row) => {
      if (err) return res.status(500).send({ error: err.message });
      if (!row) return res.status(400).send({ error: "No hay turno activo" });

      const ahora = new Date();
      const entrada = new Date(row.entrada);
      const minutosTrabajados = Math.floor(
        (ahora.getTime() - entrada.getTime()) / (1000 * 60)
      );

      db.run(
        "UPDATE registros SET salida=?, tiempo_total=? WHERE id=?",
        [ahora.toISOString(), minutosTrabajados, row.id],
        function (err) {
          if (err) return res.status(500).send({ error: err.message });
          res.send({ success: true, minutos: minutosTrabajados });
        }
      );
    }
  );
});

// Obtener todos los registros con nombre
app.get("/registros", (req, res) => {
  db.all(
    `SELECT r.id, u.nombre, r.entrada, r.salida, r.tiempo_total
     FROM registros r 
     JOIN users u ON r.user_id = u.id
     ORDER BY r.entrada DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).send({ error: err.message });
      res.send(rows);
    }
  );
});

// =======================
// Iniciar servidor
// =======================
app.listen(PORT, () =>
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
);
