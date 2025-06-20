// --- DEPENDÊNCIAS ---
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // Carrega as variáveis de ambiente do arquivo .env

// --- CONFIGURAÇÃO DO APP ---
const app = express();
// Render fornecerá a porta via variável de ambiente. 3000 é um fallback para dev local.
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ATENÇÃO: O sistema de arquivos do Render é efêmero. 
// Arquivos enviados para 'uploads/' serão DELETADOS quando o servidor reiniciar ou dormir.
// Para produção, o ideal é usar um serviço de storage como AWS S3, Cloudinary, etc.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- BANCO DE DADOS EM MEMÓRIA (SOMENTE PARA DESENVOLVIMENTO) ---
// ATENÇÃO: Estes dados serão PERDIDOS toda vez que o servidor no Render reiniciar ou dormir.
// Para um app real, substitua isso por um banco de dados persistente (ex: o PostgreSQL gratuito do Render).
let nextUserId = 1;
let nextClientId = 1;
let nextRideId = 1;

let users = [];
let clients = [];
let rides = [];

// Usando variáveis de ambiente para dados sensíveis. NUNCA deixe senhas no código.
const admins = [{ 
    id: "admin01", 
    email: process.env.ADMIN_EMAIL || "admin@exemplo.com", 
    password: process.env.ADMIN_PASSWORD || "admin123", 
    role: "master" 
}];

// Adiciona um motorista de teste para facilitar (se necessário para desenvolvimento)
// Em produção, você pode querer remover isso e cadastrar motoristas apenas pela rota.
if (process.env.NODE_ENV === 'development') {
    users.push({
        id: `user${nextUserId++}`,
        name: "João da Silva (Teste)",
        cpf: "12345678900",
        cidade: "Colider-MT",
        email: "joao@driver.com",
        password: "123",
        phoneNumber: "66999998888",
        profilePhotoUrl: "url_fake",
        status: "aprovado"
    });
}


// --- Configuração do Multer ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/';
        // Garante que o diretório exista
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- ROTA DE LOGIN UNIFICADA ---
app.post('/auth/login', (req, res) => {
    const { login, password } = req.body;
    const admin = admins.find(a => a.email === login && a.password === password);
    if (admin) {
        console.log("Admin logado:", admin.email);
        return res.status(200).json({ type: "admin", user: admin });
    }
    const driver = users.find(u => (u.email === login || u.cpf === login) && u.password === password);
    if (driver) {
        console.log("Motorista logado:", driver.name);
        return res.status(200).json({ type: "driver", user: driver });
    }
    const client = clients.find(c => (c.email === login || c.cpf === login) && c.password === password);
    if (client) {
        console.log("Cliente logado:", client.name);
        return res.status(200).json({ type: "client", user: client });
    }
    return res.status(404).json({ message: "Usuário ou senha inválidos." });
});


// --- ROTAS DO MOTORISTA ---
app.post('/register/driver', upload.fields([
    { name: 'cnhPhoto', maxCount: 1 },
    { name: 'motoDoc', maxCount: 1 },
    { name: 'profilePhoto', maxCount: 1 }
]), (req, res) => {
    const { name, age, maritalStatus, cpf, phoneNumber, cidade, email, password } = req.body;
    const cnhPhoto = req.files['cnhPhoto']?.[0];
    const motoDoc = req.files['motoDoc']?.[0];
    const profilePhoto = req.files['profilePhoto']?.[0];

    if (!name || !cpf || !cnhPhoto || !motoDoc || !email || !password || !profilePhoto || !phoneNumber || !cidade) {
        return res.status(400).json({ message: "Todos os campos e fotos são obrigatórios." });
    }
    // ... (validações de CPF/email)

    // REMOVIDO IP FIXO. A URL base agora vem de uma variável de ambiente.
    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    
    const newUser = {
        id: `user${nextUserId++}`,
        name, age, maritalStatus, cpf, phoneNumber, cidade, email, password,
        // As URLs agora são construídas dinamicamente
        cnhPhotoUrl: `${baseUrl}/${cnhPhoto.path.replace(/\\/g, "/")}`,
        motoDocUrl: `${baseUrl}/${motoDoc.path.replace(/\\/g, "/")}`,
        profilePhotoUrl: `${baseUrl}/${profilePhoto.path.replace(/\\/g, "/")}`,
        status: "pendente"
    };
    users.push(newUser);
    console.log("Novo motorista cadastrado:", newUser);
    res.status(201).json({ message: "Cadastro de motorista recebido! Aguarde a aprovação." });
});

app.get('/driver/rides', (req, res) => {
    const availableRides = rides.filter(r => r.status === 'PENDING');
    res.status(200).json(availableRides);
});


// --- ROTAS DO CLIENTE ---
app.post('/register/client', (req, res) => {
    // ... (lógica de cadastro de cliente mantida)
    const { name, email, password, cpf, phoneNumber, city } = req.body;
    if (!name || !email || !password || !cpf || !phoneNumber || !city) {
        return res.status(400).json({ message: "Todos os campos são obrigatórios." });
    }
    if (clients.some(c => c.cpf === cpf)) {
        return res.status(409).json({ message: "Este CPF já está cadastrado." });
    }
    if (clients.some(c => c.email === email)) {
        return res.status(409).json({ message: "Este e-mail já está em uso." });
    }
    const newClient = { id: `client${nextClientId++}`, name, email, password, cpf, phoneNumber, city };
    clients.push(newClient);
    console.log("Novo cliente cadastrado:", newClient);
    res.status(201).json({ message: "Cadastro realizado com sucesso!", user: newClient });
});

app.post('/client/request-service', (req, res) => {
    const { clientId, startLocation, endLocation, paymentMethod, requestType } = req.body;
    const client = clients.find(c => c.id === clientId);
    if (!client) return res.status(404).json({ message: "Cliente não encontrado." });

    const newRide = {
        id: `ride${nextRideId++}`,
        clientId, clientName: client.name, startLocation, endLocation, paymentMethod, requestType,
        value: 7.0, 
        status: 'PENDING', // MUDANÇA PRINCIPAL: Toda nova corrida começa como pendente
        clientPhoneNumber: client.phoneNumber, 
        chatHistory: []
    };

    // REMOVIDO: Lógica que atribuía um motorista automaticamente.
    // Agora a corrida fica pendente até um motorista aceitar.
    /*
    const availableDriver = users.find(u => u.status === 'aprovado');
    if (availableDriver) {
        newRide.status = 'ACCEPTED';
        newRide.driverId = availableDriver.id;
        newRide.driverInfo = { ... };
        console.log(`Motorista ${availableDriver.name} atribuído à corrida ${newRide.id}.`);
    }
    */
    
    rides.push(newRide);
    console.log(`Nova solicitação de ${requestType} pelo cliente ${client.name}:`, newRide.id);
    res.status(201).json({ message: "Solicitação enviada. Aguardando motorista.", rideId: newRide.id });
});

// ... (Restante das rotas: /ride/:rideId/status, /chat/*, /admin/*)
// Nenhuma mudança crítica nessas rotas para o deploy inicial.
// Apenas lembrando que os dados do CHAT também serão perdidos com o banco em memória.
app.get('/ride/:rideId/status', (req, res) => {
    const { rideId } = req.params;
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return res.status(404).json({ message: "Corrida não encontrada." });
    if (!ride.driverInfo) return res.status(200).json({ status: ride.status }); // Retorna status PENDING se não houver motorista
    
    // Simulação de movimento (pode ser mantida para teste)
    ride.driverInfo.lat += (Math.random() - 0.5) * 0.001;
    ride.driverInfo.lng += (Math.random() - 0.5) * 0.001;

    res.status(200).json({
        driverName: ride.driverInfo.name,
        driverLat: ride.driverInfo.lat,
        driverLng: ride.driverInfo.lng,
        vehicleModel: ride.driverInfo.vehicleModel,
        vehiclePlate: ride.driverInfo.vehiclePlate,
        status: ride.status
    });
});

app.get('/chat/:rideId/messages', (req, res) => {
    const { rideId } = req.params;
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return res.status(404).json({ message: "Corrida não encontrada." });
    res.status(200).json(ride.chatHistory);
});

app.post('/chat/send', (req, res) => {
    const { rideId, senderId, message } = req.body;
    const ride = rides.find(r => r.id === rideId);
    if (!ride) return res.status(404).json({ message: "Corrida não encontrada." });

    const newMessage = { senderId, message, timestamp: Date.now() };
    ride.chatHistory.push(newMessage);
    
    // Lógica de resposta automática mantida para teste
    if (senderId.startsWith('client')) {
        setTimeout(() => {
            if(ride.driverId) { // Só responde se já tiver um motorista
                ride.chatHistory.push({
                    senderId: ride.driverId,
                    message: "Ok, entendi!",
                    timestamp: Date.now()
                });
                console.log(`Resposta automática enviada para a corrida ${rideId}`);
            }
        }, 2000);
    }
    console.log(`Nova mensagem na corrida ${rideId} de ${senderId}`);
    res.status(200).send();
});


app.get('/admin/drivers', (req, res) => {
    res.status(200).json(users);
});

app.post('/admin/drivers/:id/approve', (req, res) => {
    const { id } = req.params;
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ message: "Motorista não encontrado." });
    users[userIndex].status = 'aprovado';
    console.log(`Motorista ${users[userIndex].name} aprovado.`);
    res.status(200).json({ message: "Motorista aprovado." });
});

app.post('/admin/drivers/:id/reprove', (req, res) => {
    const { id } = req.params;
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) return res.status(404).json({ message: "Motorista não encontrado." });
    users[userIndex].status = 'reprovado';
    console.log(`Motorista ${users[userIndex].name} reprovado.`);
    res.status(200).json({ message: "Motorista reprovado." });
});

app.post('/admin/create-ride', (req, res) => {
    const { startLocation, endLocation, paymentMethod } = req.body;
    if (!startLocation || !endLocation || !paymentMethod) {
        return res.status(400).json({ message: "Dados da corrida incompletos." });
    }
    const newRide = {
        id: `ride${nextRideId++}`,
        clientId: 'admin', clientName: 'Admin', startLocation, endLocation, paymentMethod,
        value: 7.0, status: 'PENDING', clientPhoneNumber: 'N/A', chatHistory: []
    };
    rides.push(newRide);
    console.log(`Nova corrida criada pelo admin:`, newRide.id);
    res.status(201).json({ message: "Corrida criada com sucesso." });
});

app.post('/admin/rides/stop-all', (req, res) => {
    const adminId = req.headers['admin-id'];
    if (!admins.some(a => a.id === adminId)) {
        return res.status(403).json({ message: "Admin inválido." });
    }
    const initialCount = rides.length;
    rides = rides.filter(ride => ride.status !== 'PENDING');
    const removedCount = initialCount - rides.length;
    console.log(`Admin ${adminId} removeu ${removedCount} corridas pendentes.`);
    res.status(200).json({ message: `${removedCount} corridas pendentes foram removidas.` });
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    console.log('--- Status Inicial do Servidor ---');
    console.log(`${clients.length} clientes, ${users.length} motoristas, ${rides.length} corridas.`);
    console.log('---------------------------------');
});