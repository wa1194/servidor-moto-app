// --- DEPENDÊNCIAS ---
const express = require('express');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
require('dotenv').config();

// --- CONFIGURAÇÃO DO APP E SERVIDOR ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const port = process.env.PORT || 3000;

// --- CONEXÃO COM O BANCO DE DADOS ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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
    console.log(`Nova solicitação de corrida:`, newRide);
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

// --- ROTA DO MOTORISTA ---

// NOVA ROTA PARA ACEITAR A CORRIDA
app.post('/driver/rides/:rideId/accept', async (req, res) => {
    const { rideId } = req.params;
    const { driverId } = req.body; // O app do motorista enviará seu próprio ID

    if (!driverId) {
        return res.status(400).json({ message: "ID do motorista é obrigatório." });
    }

    const client = await pool.connect();
    try {
        // Atualiza a corrida, mas apenas se ela ainda estiver PENDENTE.
        // Isso evita que dois motoristas aceitem a mesma corrida ao mesmo tempo.
        const result = await client.query(
            `UPDATE rides SET status = 'ACCEPTED', driver_id = $1 
             WHERE id = $2 AND status = 'PENDING' 
             RETURNING *`, // RETURNING * nos devolve a linha que foi atualizada
            [driverId, rideId]
        );

        // Se result.rows estiver vazio, significa que a corrida não foi encontrada
        // ou que outro motorista já a aceitou.
        if (result.rows.length === 0) {
            return res.status(409).json({ message: "Corrida não está mais disponível." });
        }

        const acceptedRide = result.rows[0];
        console.log(`Corrida ${rideId} aceita pelo motorista ${driverId}`);
        
        // AVISA TODOS que o status da corrida mudou (principalmente o cliente)
        io.emit('ride_status_update', acceptedRide);
        console.log(`Evento 'ride_status_update' emitido:`, acceptedRide);

        res.status(200).json(acceptedRide);

    } catch (error) {
        console.error(`Erro ao aceitar corrida ${rideId}:`, error);
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
    // ... (código de criação de tabelas mantido igual)
    await client.query(`CREATE TABLE IF NOT EXISTS users (...)`);
    await client.query(`CREATE TABLE IF NOT EXISTS clients (...)`);
    await client.query(`CREATE TABLE IF NOT EXISTS rides (...)`);
    
    console.log('Tabelas verificadas/criadas com sucesso.');
  } catch (err) {
    console.error('Erro ao criar as tabelas:', err);
  } finally {
    client.release();
  }
};

// --- INICIALIZAÇÃO DO SERVIDOR ---
server.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    createTables();
});
