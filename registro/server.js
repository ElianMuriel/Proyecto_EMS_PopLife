// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

// --- CONEXIÓN A MONGODB ---
const mongoURI = process.env.MONGO_URI || "mongodb://localhost:27017/ems_registros";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log("Conectado a MongoDB"))
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

const User = mongoose.model("User", UserSchema);
const Registro = mongoose.model("Registro", RegistroSchema);

// --- FUNCIONES UTILES ---
function calcularHorasTotales(registros){
  let total = 0;
  registros.forEach(r => {
    if(r.entrada && r.salida){
      total += (r.salida - r.entrada) / 1000 / 60 / 60; // de ms a horas
    }
  });
  return total.toFixed(2);
}

// --- RUTAS ---
// Login simple por nombre
app.post("/login", async (req,res)=>{
  const { nombre } = req.body;
  if(!nombre) return res.status(400).send({error:"Nombre requerido"});

  try{
    let user = await User.findOne({nombre});
    if(!user){
      user = await User.create({nombre});
    }
    res.send(user);
  }catch(err){
    res.status(500).send({error: err.message});
  }
});

// Registrar entrada
app.post("/entrada", async (req,res)=>{
  const { userId } = req.body;
  if(!userId) return res.status(400).send({error:"userId requerido"});

  try{
    const registro = await Registro.create({userId, entrada: new Date()});
    res.send({success:true, registro});
  }catch(err){
    res.status(500).send({error: err.message});
  }
});

// Registrar salida
app.post("/salida", async (req,res)=>{
  const { userId } = req.body;
  if(!userId) return res.status(400).send({error:"userId requerido"});

  try{
    const registro = await Registro.findOne({userId, salida: null}).sort({entrada:-1});
    if(!registro) return res.status(400).send({error:"No hay turno activo"});

    registro.salida = new Date();
    await registro.save();
    res.send({success:true, registro});
  }catch(err){
    res.status(500).send({error: err.message});
  }
});

// Obtener todos los registros con nombre
app.get("/registros", async (req,res)=>{
  try{
    const registros = await Registro.find().populate("userId", "nombre").sort({entrada:-1});
    const resultado = registros.map(r => ({
      id: r._id,
      nombre: r.userId.nombre,
      entrada: r.entrada,
      salida: r.salida
    }));
    res.send(resultado);
  }catch(err){
    res.status(500).send({error: err.message});
  }
});

// Contador semanal
app.get("/contador-semanal/:userId", async (req,res)=>{
  const { userId } = req.params;
  if(!userId) return res.status(400).send({error:"userId requerido"});

  const ahora = new Date();
  const primerDiaSemana = new Date(ahora.setDate(ahora.getDate() - ahora.getDay()));

  try{
    const registros = await Registro.find({
      userId,
      entrada: { $gte: primerDiaSemana },
      salida: { $ne: null }
    });
    const horas = calcularHorasTotales(registros);
    res.send({userId, horas});
  }catch(err){
    res.status(500).send({error: err.message});
  }
});

// Contador mensual
app.get("/contador-mensual/:userId", async (req,res)=>{
  const { userId } = req.params;
  if(!userId) return res.status(400).send({error:"userId requerido"});

  const ahora = new Date();
  const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  try{
    const registros = await Registro.find({
      userId,
      entrada: { $gte: primerDiaMes },
      salida: { $ne: null }
    });
    const horas = calcularHorasTotales(registros);
    res.send({userId, horas});
  }catch(err){
    res.status(500).send({error: err.message});
  }
});

// --- INICIO DEL SERVIDOR ---
app.listen(PORT, ()=> console.log(`Servidor corriendo en http://localhost:${PORT}`));
