const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('../database/index');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Initialize database
const db = new Database();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../client')));

// Session configuration
app.use(session({
    secret: 'casino-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

const requireAdmin = (req, res, next) => {
    if (req.session.userId && req.session.isAdmin) {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// Game state management
const gameRooms = new Map(); // roomId -> room data
const connectedUsers = new Map(); // socketId -> user data

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/login.html'));
});

app.get('/admin', requireAuth, (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../client/admin.html'));
});

// API Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const userId = await db.createUser(username, password, email);
        req.session.userId = userId;
        req.session.username = username;
        req.session.isAdmin = false;

        res.json({ success: true, userId, username });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: 'Username already exists or invalid data' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = await db.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.isAdmin = user.is_admin;

        res.json({ 
            success: true, 
            user: {
                id: user.id,
                username: user.username,
                balance: user.balance,
                isAdmin: user.is_admin
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/user', requireAuth, async (req, res) => {
    try {
        const user = await db.getUserById(req.session.userId);
        res.json({
            id: user.id,
            username: user.username,
            balance: user.balance,
            isAdmin: user.is_admin
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const leaderboard = await db.getLeaderboard();
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// Admin API Routes
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await new Promise((resolve, reject) => {
            db.db.all('SELECT id, username, email, balance, is_admin, is_active, created_at FROM users', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.put('/api/admin/users/:id/balance', requireAdmin, async (req, res) => {
    try {
        const { balance } = req.body;
        const userId = req.params.id;
        
        const user = await db.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await db.updateUserBalance(userId, balance);
        await db.recordTransaction(userId, null, 'admin_adjustment', balance - user.balance, user.balance, balance, 'Admin balance adjustment');
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update balance' });
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('authenticate', async (data) => {
        try {
            const user = await db.getUserById(data.userId);
            if (user) {
                connectedUsers.set(socket.id, {
                    id: user.id,
                    username: user.username,
                    balance: user.balance,
                    isAdmin: user.is_admin
                });
                socket.emit('authenticated', { success: true });
            }
        } catch (error) {
            socket.emit('authenticated', { success: false });
        }
    });

    socket.on('join_lobby', (data) => {
        const { gameType } = data;
        const user = connectedUsers.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: 'Authentication required' });
            return;
        }

        // Join game type lobby
        socket.join(`lobby_${gameType}`);
        socket.emit('lobby_joined', { gameType });
        
        // Send available rooms
        const rooms = Array.from(gameRooms.values())
            .filter(room => room.gameType === gameType && !room.started)
            .map(room => ({
                id: room.id,
                host: room.host.username,
                players: room.players.length,
                maxPlayers: 8
            }));
        
        socket.emit('rooms_list', rooms);
    });

    socket.on('create_room', (data) => {
        const { gameType } = data;
        const user = connectedUsers.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: 'Authentication required' });
            return;
        }

        const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const room = {
            id: roomId,
            gameType,
            host: user,
            players: [{ ...user, socketId: socket.id }],
            bots: [],
            started: false,
            gameState: null,
            createdAt: new Date()
        };

        gameRooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room_created', { roomId, room });
        
        // Notify lobby
        io.to(`lobby_${gameType}`).emit('room_created', {
            id: roomId,
            host: user.username,
            players: 1,
            maxPlayers: 8
        });
    });

    socket.on('join_room', (data) => {
        const { roomId } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user) {
            socket.emit('error', { message: 'Authentication required' });
            return;
        }

        if (!room) {
            socket.emit('error', { message: 'Room not found' });
            return;
        }

        if (room.started) {
            socket.emit('error', { message: 'Game already started' });
            return;
        }

        if (room.players.length >= 8) {
            socket.emit('error', { message: 'Room is full' });
            return;
        }

        room.players.push({ ...user, socketId: socket.id });
        socket.join(roomId);
        
        // Update room for all players
        io.to(roomId).emit('room_updated', room);
        
        // Update lobby
        io.to(`lobby_${room.gameType}`).emit('room_updated', {
            id: roomId,
            host: room.host.username,
            players: room.players.length,
            maxPlayers: 8
        });
    });

    socket.on('start_game', (data) => {
        const { roomId } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room || room.host.id !== user.id) {
            socket.emit('error', { message: 'Only room host can start the game' });
            return;
        }

        // Fill remaining slots with bots
        const botsNeeded = Math.max(0, Math.min(8 - room.players.length, 7)); // Max 7 bots
        for (let i = 0; i < botsNeeded; i++) {
            room.bots.push({
                id: `bot_${i}_${Date.now()}`,
                username: `Bot ${i + 1}`,
                balance: 1000,
                isBot: true
            });
        }

        room.started = true;
        room.startedAt = new Date();

        // Initialize game based on type
        const GameModule = require(`../games/${room.gameType}`);
        room.gameState = new GameModule(room.players, room.bots);

        io.to(roomId).emit('game_started', {
            gameType: room.gameType,
            players: room.players,
            bots: room.bots,
            gameState: room.gameState.getPublicState()
        });

        // Remove from lobby
        io.to(`lobby_${room.gameType}`).emit('room_removed', roomId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        connectedUsers.delete(socket.id);
        
        // Handle player leaving rooms
        for (const [roomId, room] of gameRooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                
                if (room.players.length === 0) {
                    // Remove empty room
                    gameRooms.delete(roomId);
                    io.to(`lobby_${room.gameType}`).emit('room_removed', roomId);
                } else {
                    // Update remaining players
                    io.to(roomId).emit('room_updated', room);
                    io.to(`lobby_${room.gameType}`).emit('room_updated', {
                        id: roomId,
                        host: room.host.username,
                        players: room.players.length,
                        maxPlayers: 8
                    });
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`AI Casino server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    db.close();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});