// --- DEPENDÊNCIAS ---
const express = require('express');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer');
const cors = require('cors');
const path =require('path');
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

// --- DADOS DO ADMIN ---
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
//                      ROTAS DA APLICAÇÃO
// ==================================================================

// --- ROTA DE LOGIN UNIFICADA ---
app.post('/auth/login', async (req, res) => {
    const { login, password } = req.body;
    if (!login || !password) {
        return res.status(400).json({ message: "Email/CPF e senha são obrigatórios." });
    }
    const client = await pool.connect();
    try {
        const admin = admins.find(a => a.email === login && a.password === password);
        if (admin) {
            console.log("Admin logado:", admin.email);
            return res.status(200).json({ type: "admin", user: admin });
        }

        let userResult = await client.query('SELECT * FROM users WHERE email = $1 OR cpf = $2', [login, login]);
        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (passwordMatch) {
                if (user.status !== 'aprovado') {
                    return res.status(403).json({ message: `Seu cadastro está com status: ${user.status}.`});
                }
                console.log("Motorista logado:", user.name);
                delete user.password;
                return res.status(200).json({ type: "driver", user: user });
            }
        }

        let clientResult = await client.query('SELECT * FROM clients WHERE email = $1 OR cpf = $2', [login, login]);
        if (clientResult.rows.length > 0) {
            const clientUser = clientResult.rows[0];
            const passwordMatch = await bcrypt.compare(password, clientUser.password);
            if (passwordMatch) {
                console.log("Cliente logado:", clientUser.name);
                delete clientUser.password;
                return res.status(200).json({ type: "client", user: clientUser });
            }
        }
        
        return res.status(404).json({ message: "Usuário ou senha inválidos." });
    } catch (error) {
        console.error('Erro no processo de login:', error);
        res.status(500).json({ message: "Erro interno do servidor." });
    } finally {
        client.release();
    }
});


// ==================================================================
//                      ROTAS DO ADMIN
// ==================================================================
app.get('/admin/drivers', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT id, name, email, cpf, phoneNumber, cidade, cnhPhotoUrl, motoDocUrl, profilePhotoUrl, status, created_at FROM users ORDER BY created_at DESC');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar motoristas para o admin:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
});

app.post('/admin/drivers/:id/approve', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query("UPDATE users SET status = 'aprovado' WHERE id = $1", [id]);
        res.status(200).json({ message: 'Motorista aprovado com sucesso.' });
    } catch (error) {
        console.error('Erro ao aprovar motorista:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
});

app.post('/admin/drivers/:id/reprove', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query("UPDATE users SET status = 'reprovado' WHERE id = $1", [id]);
        res.status(200).json({ message: 'Motorista reprovado com sucesso.' });
    } catch (error) {
        console.error('Erro ao reprovar motorista:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
});


// --- ROTAS DO MOTORISTA ---
// **INÍCIO DA CORREÇÃO**
app.post('/register/driver', upload.fields([
    { name: 'cnhPhoto', maxCount: 1 }, { name: 'motoDoc', maxCount: 1 }, { name: 'profilePhoto', maxCount: 1 }
]), async (req, res) => {
    // Adiciona age e maritalStatus
    const { name, email, password, cpf, phoneNumber, cidade, age, maritalStatus } = req.body;
    const cnhPhoto = req.files['cnhPhoto']?.[0];
    const motoDoc = req.files['motoDoc']?.[0];
    const profilePhoto = req.files['profilePhoto']?.[0];

    // Adiciona os novos campos na validação
    if (!name || !cpf || !email || !password || !cnhPhoto || !motoDoc || !profilePhoto || !age || !maritalStatus) {
        return res.status(400).json({ message: "Todos os campos e fotos são obrigatórios." });
    }

    const client = await pool.connect();
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
        const cnhPhotoUrl = `${baseUrl}/uploads/${cnhPhoto.filename}`;
        const motoDocUrl = `${baseUrl}/uploads/${motoDoc.filename}`;
        const profilePhotoUrl = `${baseUrl}/uploads/${profilePhoto.filename}`;

        // Atualiza a query de inserção para incluir os novos campos
        await client.query(
            `INSERT INTO users (name, email, password, cpf, phoneNumber, cidade, age, maritalStatus, cnhPhotoUrl, motoDocUrl, profilePhotoUrl, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pendente')`,
            [name, email, hashedPassword, cpf, phoneNumber, cidade, age, maritalStatus, cnhPhotoUrl, motoDocUrl, profilePhotoUrl]
        );
        
        res.status(201).json({ message: "Cadastro recebido! Seu perfil está em análise." });
    } catch (error) {
        console.error('Erro no cadastro de motorista:', error); // Adiciona um log mais detalhado
        if (error.code === '23505') {
            return res.status(409).json({ message: "Email ou CPF já cadastrado." });
        }
        res.status(500).json({ message: "Erro interno do servidor." });
    } finally {
        client.release();
    }
});
// **FIM DA CORREÇÃO**

app.get('/driver/rides', async (req, res) => {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT * FROM rides WHERE status = 'PENDING' ORDER BY created_at DESC");
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Erro ao buscar corridas disponíveis:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
});

app.post('/driver/rides/:rideId/accept', async (req, res) => {
    const { rideId } = req.params;
    const { driverId } = req.body;
    if (!driverId) {
        return res.status(400).json({ message: "ID do motorista é obrigatório." });
    }
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE rides SET status = 'ACCEPTED', driver_id = $1 WHERE id = $2 AND status = 'PENDING' RETURNING *`,
            [driverId, rideId]
        );
        if (result.rows.length === 0) {
            return res.status(409).json({ message: "Corrida não está mais disponível." });
        }
        const acceptedRide = result.rows[0];
        io.emit('ride_status_update', acceptedRide);
        res.status(200).json(acceptedRide);
    } catch (error) {
        res.status(500).json({ message: "Erro interno do servidor." });
    } finally {
        client.release();
    }
});

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
        delete newClient.password;
        res.status(201).json({ message: "Cadastro realizado com sucesso!", user: newClient });
    } catch (error) {
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

    const finalPaymentMethod = paymentMethod || 'Não informado';
    const finalRequestType = requestType || 'Padrão';
    const rideValue = 7.0;

    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO rides (client_id, start_location, end_location, payment_method, request_type, value, status) 
            VALUES ($1, $2, $3, $4, $5, $6, 'PENDING') RETURNING *`,
            [clientId, startLocation, endLocation, finalPaymentMethod, finalRequestType, rideValue]
        );
        const newRide = result.rows[0];
        io.emit('nova_corrida', newRide);
        res.status(201).json({ message: "Solicitação enviada com sucesso.", ride: newRide });
    } catch (error) {
        console.error('Erro ao solicitar corrida:', error);
        res.status(500).json({ message: "Erro interno do servidor." });
    } finally {
        client.release();
    }
});

app.get('/ride/:rideId/status', async (req, res) => {
    const { rideId } = req.params;
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT r.*, 
                    u.name AS driver_name, 
                    u.phoneNumber AS driver_phone_number,
                    u.profilePhotoUrl AS driver_photo_url
             FROM rides r
             LEFT JOIN users u ON r.driver_id = u.id
             WHERE r.id = $1`,
            [rideId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Corrida não encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Erro ao buscar status da corrida:', error);
        res.status(500).json({ message: 'Erro interno do servidor.' });
    } finally {
        client.release();
    }
});

// --- FUNÇÃO PARA CRIAR TABELAS (SE NÃO EXISTIREM) ---
const createTables = async () => {
    const client = await pool.connect();
    try {
        // **INÍCIO DA CORREÇÃO**
        // Adiciona as colunas 'age' e 'maritalStatus' na tabela de usuários
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                cpf VARCHAR(14) UNIQUE NOT NULL,
                phoneNumber VARCHAR(20),
                cidade VARCHAR(100),
                age VARCHAR(10),
                maritalStatus VARCHAR(50),
                cnhPhotoUrl VARCHAR(255),
                motoDocUrl VARCHAR(255),
                profilePhotoUrl VARCHAR(255),
                status VARCHAR(20) DEFAULT 'pendente',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // **FIM DA CORREÇÃO**
        await client.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                cpf VARCHAR(14) UNIQUE NOT NULL,
                phoneNumber VARCHAR(20),
                city VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS rides (
                id SERIAL PRIMARY KEY,
                client_id INTEGER REFERENCES clients(id),
                driver_id INTEGER REFERENCES users(id),
                start_location VARCHAR(255) NOT NULL,
                end_location VARCHAR(255) NOT NULL,
                payment_method VARCHAR(50),
                request_type VARCHAR(50),
                value NUMERIC(10, 2),
                status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("Tabelas verificadas/criadas com sucesso.");
    } catch (error) {
        console.error("Erro ao criar as tabelas:", error);
    } finally {
        client.release();
    }
};


// --- INICIALIZAÇÃO DO SERVIDOR ---
server.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    createTables();
});
