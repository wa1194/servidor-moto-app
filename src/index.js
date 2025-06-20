// --- DEPENDÊNCIAS ---
const express = require('express');
const { Pool } = require('pg');
const http = require('http'); // Módulo HTTP nativo do Node
const { Server } = require("socket.io"); // Biblioteca do Socket.IO
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
require('dotenv').config();

// --- CONFIGURAÇÃO DO APP E SERVIDOR ---
const app = express();
const server = http.createServer(app); // Cria um servidor HTTP usando o app Express
const io = new Server(server, {        // Inicia o Socket.IO "em cima" do servidor HTTP
  cors: {
    origin: "*", // Permite conexões de qualquer origem
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 3000;

// --- CONEXÃO COM O BANCO DE DADOS POSTGRESQL ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- LÓGICA DO SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('Um usuário se conectou via WebSocket:', socket.id);

  socket.on('disconnect', () => {
    console.log('Usuário desconectou:', socket.id);
  });
});

// --- DADOS TEMPORÁRIOS ---
const admins = [{ 
    id: "admin01", 
    email: process.env.ADMIN_EMAIL || "admin@exemplo.com", 
    password: process.env.ADMIN_PASSWORD || "admin123", 
    role: "master" 
}];

// --- Configuração do Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '..', 'uploads');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ==================================================================
//                      ROTAS DA APLICAÇÃO
// ==================================================================

// --- ROTAS DO CLIENTE ---

app.post('/register/client', async (req, res) => {
  const { name, email, password, cpf, phoneNumber, city } = req.body;
  if (!name || !email || !password || !cpf || !phoneNumber || !city) {
    return res.status(400).json({ message: "Todos os campos são obrigatórios." });
  }
  const client = await pool.connect();
  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const result = await client.query(
      'INSERT INTO clients (name, email, password, cpf, phoneNumber, city) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, email, hashedPassword, cpf, phoneNumber, city]
    );
    const newClient = result.rows[0];
    console.log("Novo cliente cadastrado no BANCO DE DADOS:", newClient);
    delete newClient.password;
    res.status(201).json({ message: "Cadastro realizado com sucesso!", user: newClient });
  } catch (error) {
    console.error('Erro ao cadastrar cliente:', error);
    if (error.code === '23505') {
      return res.status(409).json({ message: "Email ou CPF já cadastrado." });
    }
    res.status(500).json({ message: "Erro interno do servidor." });
  } finally {
    client.release();
  }
});

// ROTA ATUALIZADA para salvar a corrida E avisar os motoristas
app.post('/client/request-service', async (req, res) => {
  const { clientId, startLocation, endLocation, paymentMethod, requestType } = req.body;
  if (!clientId || !startLocation || !endLocation) {
    return res.status(400).json({ message: "Dados da corrida incompletos." });
  }
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO rides (client_id, start_location, end_location, payment_method, request_type, value, status) 
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
      [clientId, startLocation, endLocation, paymentMethod, requestType, 7.0]
    );
    const newRide = result.rows[0];
    console.log(`Nova solicitação de ${requestType} pelo cliente ${clientId}:`, newRide);

    // AVISO EM TEMPO REAL PARA TODOS OS CONECTADOS
    io.emit('nova_corrida', newRide); 
    console.log(`Evento 'nova_corrida' emitido com os dados:`, newRide);

    res.status(201).json({ message: "Solicitação enviada com sucesso.", ride: newRide });
  } catch (error) {
    console.error('Erro ao solicitar corrida:', error);
    res.status(500).json({ message: "Erro interno do servidor." });
  } finally {
    client.release();
  }
});


// --- ROTAS AINDA EM CONSTRUÇÃO ---

app.post('/auth/login', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.post('/register/driver', upload.fields([
    { name: 'cnhPhoto', maxCount: 1 }, { name: 'motoDoc', maxCount: 1 }, { name: 'profilePhoto', maxCount: 1 }
]), (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.get('/driver/rides', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});

app.get('/ride/:rideId/status', (req, res) => {
    return res.status(501).json({ message: "Rota em construção." });
});


// --- FUNÇÃO PARA CRIAR TABELAS (SE NÃO EXISTIREM) ---
const createTables = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, cpf VARCHAR(14) UNIQUE NOT NULL, cidade VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, phoneNumber VARCHAR(20),
        profilePhotoUrl VARCHAR(255), status VARCHAR(20) DEFAULT 'pendente', cnhPhotoUrl VARCHAR(255), motoDocUrl VARCHAR(255)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, cpf VARCHAR(14) UNIQUE NOT NULL, city VARCHAR(100),
        email VARCHAR(100) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL, phoneNumber VARCHAR(20)
      );
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS rides (
        id SERIAL PRIMARY KEY, client_id INT REFERENCES clients(id), driver_id INT REFERENCES users(id) NULL,
        start_location VARCHAR(255) NOT NULL, end_location VARCHAR(255) NOT NULL, payment_method VARCHAR(50),
        request_type VARCHAR(50), value NUMERIC(10, 2), status VARCHAR(20) DEFAULT 'PENDING',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Tabelas verificadas/criadas com sucesso.');
  } catch (err) {
    console.error('Erro ao criar as tabelas:', err);
  } finally {
    client.release();
  }
};

// --- INICIALIZAÇÃO DO SERVIDOR ---
server.listen(port, () => { // CORRIGIDO: Usando server.listen em vez de app.listen
    console.log(`Servidor rodando na porta ${port}`);
    createTables();
});
