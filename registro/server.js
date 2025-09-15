// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// --- CONEXIÓN A MONGODB ---
const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/ems";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Conectado a MongoDB"))
    .catch(err => console.error("Error conectando a MongoDB:", err));

// --- MODELOS ---
const UserSchema = new mongoose.Schema({
    nombre: { type: String, unique: true, required: true }
});

const RegistroSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    entrada: { type: Date, required: true },
    salida: { type: Date }
});

const ResumenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    periodo: { type: String, enum: ["semana", "mes"], required: true },
    inicio: { type: Date, required: true },
    fin: { type: Date },
    horas: { type: Number, default: 0 }
});

const User = mongoose.model("User", UserSchema);
const Registro = mongoose.model("Registro", RegistroSchema);
const Resumen = mongoose.model("Resumen", ResumenSchema);

// --- FUNCIONES UTILES ---
function calcularHorasTotales(registros) {
    let total = 0;
    registros.forEach(r => {
        if (r.entrada && r.salida) {
            total += (r.salida - r.entrada) / 1000 / 60 / 60;
        }
    });
    return total.toFixed(2);
}

// --- RUTAS ---
// Login simple por nombre
app.post("/login", async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).send({ error: "Nombre requerido" });

    try {
        let user = await User.findOne({ nombre });
        if (!user) {
            user = await User.create({ nombre });
        }
        res.send(user);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Registrar entrada
app.post("/entrada", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send({ error: "userId requerido" });

    try {
        const registro = await Registro.create({ userId, entrada: new Date() });
        res.send({ success: true, registro });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Registrar salida
app.post("/salida", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).send({ error: "userId requerido" });

    try {
        const registro = await Registro.findOne({ userId, salida: null }).sort({ entrada: -1 });
        if (!registro) return res.status(400).send({ error: "No hay turno activo" });

        registro.salida = new Date();
        await registro.save();
        res.send({ success: true, registro });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Obtener todos los registros con nombre
app.get("/registros", async (req, res) => {
    try {
        const registros = await Registro.find().populate("userId", "nombre").sort({ entrada: -1 });
        const resultado = registros.map(r => ({
            id: r._id,
            nombre: r.userId.nombre,
            entrada: r.entrada,
            salida: r.salida
        }));
        res.send(resultado);
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Contador semanal individual
app.get("/contador-semanal/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).send({ error: "userId requerido" });

    const ahora = new Date();
    const dia = ahora.getDay();
    const diff = dia === 0 ? 6 : dia - 1;
    const primerDiaSemana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diff, 0, 0, 0);

    try {
        const registros = await Registro.find({
            userId,
            entrada: { $gte: primerDiaSemana },
            salida: { $ne: null }
        });
        const horas = calcularHorasTotales(registros);
        res.send({ userId, horas });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Contador mensual individual
app.get("/contador-mensual/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!userId) return res.status(400).send({ error: "userId requerido" });

    const ahora = new Date();
    const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

    try {
        const registros = await Registro.find({
            userId,
            entrada: { $gte: primerDiaMes },
            salida: { $ne: null }
        });
        const horas = calcularHorasTotales(registros);
        res.send({ userId, horas });
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// --- RESUMEN GENERAL ---
// Resumen semanal de todos los usuarios
app.get("/resumen-semanal", async (req, res) => {
    try {
        const ahora = new Date();
        const dia = ahora.getDay();
        const diff = dia === 0 ? 6 : dia - 1;
        const primerDiaSemana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diff, 0, 0, 0);

        const registros = await Registro.find({
            entrada: { $gte: primerDiaSemana },
            salida: { $ne: null }
        }).populate("userId", "nombre");

        const resumen = {};
        registros.forEach(r => {
            const horas = (r.salida - r.entrada) / 1000 / 60 / 60;
            if (!resumen[r.userId.nombre]) resumen[r.userId.nombre] = 0;
            resumen[r.userId.nombre] += horas;
        });

        res.send(Object.entries(resumen).map(([nombre, horas]) => ({
            nombre,
            horas: horas.toFixed(2)
        })));
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// Resumen mensual de todos los usuarios
app.get("/resumen-mensual", async (req, res) => {
    try {
        const ahora = new Date();
        const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

        const registros = await Registro.find({
            entrada: { $gte: primerDiaMes },
            salida: { $ne: null }
        }).populate("userId", "nombre");

        const resumen = {};
        registros.forEach(r => {
            const horas = (r.salida - r.entrada) / 1000 / 60 / 60;
            if (!resumen[r.userId.nombre]) resumen[r.userId.nombre] = 0;
            resumen[r.userId.nombre] += horas;
        });

        res.send(Object.entries(resumen).map(([nombre, horas]) => ({
            nombre,
            horas: horas.toFixed(2)
        })));
    } catch (err) {
        res.status(500).send({ error: err.message });
    }
});

// --- FUNCIONES DE REINICIO ---
// Reinicio mensual (elimina registros antiguos)
async function reinicioMensual() {
    try {
        const ahora = new Date();
        const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        await Registro.deleteMany({ entrada: { $lt: primerDiaMes } });
        console.log("Reinicio mensual: registros antiguos eliminados");
    } catch (err) {
        console.error("Error en reinicio mensual:", err);
    }
}

// Reinicio semanal (guardar resumen y reiniciar contador semanal)
async function reinicioSemanal() {
    try {
        const ahora = new Date();
        const dia = ahora.getDay();
        const diff = dia === 0 ? 6 : dia - 1;
        const inicioSemana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diff, 0, 0, 0);

        // Obtener registros de la semana pasada
        const registros = await Registro.find({
            entrada: { $lt: inicioSemana },
            salida: { $ne: null }
        }).populate("userId");

        const horasPorUsuario = {};
        registros.forEach(r => {
            const horas = (r.salida - r.entrada) / 1000 / 60 / 60;
            if (!horasPorUsuario[r.userId._id]) horasPorUsuario[r.userId._id] = 0;
            horasPorUsuario[r.userId._id] += horas;
        });

        // Guardar resúmenes semanales
        for (const [userId, horas] of Object.entries(horasPorUsuario)) {
            await Resumen.create({
                userId,
                periodo: "semana",
                inicio: inicioSemana,
                fin: ahora,
                horas
            });
        }

        console.log("Reinicio semanal completado");
    } catch (err) {
        console.error("Error en reinicio semanal:", err);
    }
}

// Ejecutar reinicio al iniciar servidor
reinicioMensual();
reinicioSemanal();

// --- CRON ---
// Cada lunes a medianoche
cron.schedule("0 0 * * 1", () => { reinicioSemanal(); });
// Cada 1 del mes a medianoche
cron.schedule("0 0 1 * *", () => { reinicioMensual(); });

// --- INICIO DEL SERVIDOR ---
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "registro.html"));
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
