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
    res.redirect('/');
});

app.get('/admin', requireAuth, (req, res) => {
    if (!req.session.isAdmin) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, '../client/admin.html'));
});

app.get('/history', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/history.html'));
});

app.get('/games/:gameType', (req, res) => {
    const gameType = req.params.gameType;
    const validGames = ['blackjack', 'roulette', 'poker'];
    
    if (validGames.includes(gameType)) {
        res.sendFile(path.join(__dirname, `../client/games/${gameType}.html`));
    } else {
        res.redirect('/');
    }
});

// API Routes
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Check if this is the first user - if so, make them admin
        const userCount = await db.getUserCount();
        const isFirstUser = userCount === 0;

        const userId = await db.createUser(username, password, email, isFirstUser);
        req.session.userId = userId;
        req.session.username = username;
        req.session.isAdmin = isFirstUser;

        res.json({ success: true, userId, username, isAdmin: isFirstUser });
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

// Game History API Routes
app.get('/api/games/history', requireAuth, async (req, res) => {
    try {
        const { gameType, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = 'WHERE g.ended_at IS NOT NULL';
        const params = [];
        
        if (gameType) {
            whereClause += ' AND g.type = ?';
            params.push(gameType);
        }
        
        const query = `
            SELECT 
                g.id, g.type, g.room_id, g.started_at, g.ended_at,
                u.username as host_username,
                COUNT(gp.id) as player_count
            FROM games g
            LEFT JOIN users u ON g.host_user_id = u.id
            LEFT JOIN game_participants gp ON g.id = gp.game_id
            ${whereClause}
            GROUP BY g.id
            ORDER BY g.ended_at DESC
            LIMIT ? OFFSET ?
        `;
        params.push(parseInt(limit), offset);
        
        const games = await new Promise((resolve, reject) => {
            db.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json(games);
    } catch (error) {
        console.error('Game history error:', error);
        res.status(500).json({ error: 'Failed to fetch game history' });
    }
});

app.get('/api/games/:gameId/details', requireAuth, async (req, res) => {
    try {
        const { gameId } = req.params;
        
        // Get game details
        const game = await new Promise((resolve, reject) => {
            db.db.get(
                'SELECT * FROM games WHERE id = ?',
                [gameId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
        
        if (!game) {
            return res.status(404).json({ error: 'Game not found' });
        }
        
        // Get participants
        const participants = await new Promise((resolve, reject) => {
            db.db.all(
                `SELECT gp.*, u.username 
                 FROM game_participants gp 
                 LEFT JOIN users u ON gp.user_id = u.id 
                 WHERE gp.game_id = ?`,
                [gameId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
        
        // Get game events
        const events = await new Promise((resolve, reject) => {
            db.db.all(
                'SELECT * FROM game_events WHERE game_id = ? ORDER BY timestamp ASC',
                [gameId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => ({
                        ...row,
                        event_data: row.event_data ? JSON.parse(row.event_data) : null
                    })));
                }
            );
        });
        
        res.json({
            game: {
                ...game,
                game_data: game.game_data ? JSON.parse(game.game_data) : null
            },
            participants,
            events
        });
    } catch (error) {
        console.error('Game details error:', error);
        res.status(500).json({ error: 'Failed to fetch game details' });
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

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    try {
        // Get various statistics
        const stats = await new Promise((resolve, reject) => {
            const queries = {
                totalUsers: 'SELECT COUNT(*) as count FROM users WHERE is_active = TRUE',
                totalBalance: 'SELECT SUM(balance) as total FROM users WHERE is_active = TRUE',
                activeGames: 'SELECT COUNT(*) as count FROM games WHERE ended_at IS NULL',
                gamesToday: `SELECT COUNT(*) as count FROM games WHERE date(created_at) = date('now')`
            };
            
            const results = {};
            const promises = Object.entries(queries).map(([key, query]) => {
                return new Promise((resolve, reject) => {
                    db.db.get(query, (err, row) => {
                        if (err) reject(err);
                        else {
                            results[key] = row.count || row.total || 0;
                            resolve();
                        }
                    });
                });
            });
            
            Promise.all(promises)
                .then(() => resolve(results))
                .catch(reject);
        });
        
        res.json(stats);
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Admin Audit API Routes  
app.get('/api/admin/audit/transactions', requireAdmin, async (req, res) => {
    try {
        const { userId, page = 1, limit = 50, type, startDate, endDate } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = 'WHERE 1=1';
        const params = [];
        
        if (userId) {
            whereClause += ' AND t.user_id = ?';
            params.push(userId);
        }
        
        if (type) {
            whereClause += ' AND t.type = ?';
            params.push(type);
        }
        
        if (startDate) {
            whereClause += ' AND t.created_at >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            whereClause += ' AND t.created_at <= ?';
            params.push(endDate);
        }
        
        const query = `
            SELECT 
                t.*,
                u.username,
                g.type as game_type
            FROM transactions t
            LEFT JOIN users u ON t.user_id = u.id
            LEFT JOIN games g ON t.game_id = g.id
            ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `;
        params.push(parseInt(limit), offset);
        
        const transactions = await new Promise((resolve, reject) => {
            db.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        res.json(transactions);
    } catch (error) {
        console.error('Audit transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

app.get('/api/admin/audit/events', requireAdmin, async (req, res) => {
    try {
        const { gameId, page = 1, limit = 50, eventType, startDate, endDate } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = 'WHERE 1=1';
        const params = [];
        
        if (gameId) {
            whereClause += ' AND ge.game_id = ?';
            params.push(gameId);
        }
        
        if (eventType) {
            whereClause += ' AND ge.event_type = ?';
            params.push(eventType);
        }
        
        if (startDate) {
            whereClause += ' AND ge.timestamp >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            whereClause += ' AND ge.timestamp <= ?';
            params.push(endDate);
        }
        
        const query = `
            SELECT 
                ge.*,
                g.type as game_type,
                g.room_id,
                u.username as host_username
            FROM game_events ge
            LEFT JOIN games g ON ge.game_id = g.id
            LEFT JOIN users u ON g.host_user_id = u.id
            ${whereClause}
            ORDER BY ge.timestamp DESC
            LIMIT ? OFFSET ?
        `;
        params.push(parseInt(limit), offset);
        
        const events = await new Promise((resolve, reject) => {
            db.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => ({
                    ...row,
                    event_data: row.event_data ? JSON.parse(row.event_data) : null
                })));
            });
        });
        
        res.json(events);
    } catch (error) {
        console.error('Audit events error:', error);
        res.status(500).json({ error: 'Failed to fetch game events' });
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
                spectators: room.spectators.length,
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
            spectators: [],
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
            spectators: room.spectators.length,
            maxPlayers: 8
        });
    });

    socket.on('spectate_room', (data) => {
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

        // Check if user is already a player in this room
        const isPlayer = room.players.some(p => p.id === user.id);
        if (isPlayer) {
            socket.emit('error', { message: 'Cannot spectate a game you are playing in' });
            return;
        }

        // Check if already spectating
        const alreadySpectating = room.spectators.some(s => s.id === user.id);
        if (alreadySpectating) {
            socket.emit('error', { message: 'Already spectating this room' });
            return;
        }

        // Add as spectator
        room.spectators.push({ ...user, socketId: socket.id });
        socket.join(roomId);
        socket.join(`${roomId}_spectators`);
        
        // Send current game state to spectator (public view only)
        if (room.gameState) {
            const spectatorState = room.gameState.getSpectatorState ? 
                room.gameState.getSpectatorState() : 
                room.gameState.getPublicState();
            socket.emit('spectating_started', { roomId, gameState: spectatorState });
        } else {
            socket.emit('spectating_started', { roomId, message: 'Waiting for game to start' });
        }
        
        // Notify room and lobby about spectator count update
        io.to(roomId).emit('spectator_joined', { 
            username: user.username, 
            spectatorCount: room.spectators.length 
        });
        
        io.to(`lobby_${room.gameType}`).emit('room_updated', {
            id: roomId,
            host: room.host.username,
            players: room.players.length,
            spectators: room.spectators.length,
            maxPlayers: 8
        });
    });

    socket.on('leave_spectating', (data) => {
        const { roomId } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room) return;

        const spectatorIndex = room.spectators.findIndex(s => s.id === user.id);
        if (spectatorIndex !== -1) {
            room.spectators.splice(spectatorIndex, 1);
            socket.leave(roomId);
            socket.leave(`${roomId}_spectators`);
            
            // Notify room about spectator leaving
            io.to(roomId).emit('spectator_left', { 
                username: user.username, 
                spectatorCount: room.spectators.length 
            });
            
            // Update lobby
            io.to(`lobby_${room.gameType}`).emit('room_updated', {
                id: roomId,
                host: room.host.username,
                players: room.players.length,
                spectators: room.spectators.length,
                maxPlayers: 8
            });
            
            socket.emit('spectating_ended', { roomId });
        }
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

    // Game action handlers
    socket.on('place_bet', async (data) => {
        const { roomId, amount, betType, value } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room || !room.gameState) {
            socket.emit('error', { message: 'Invalid game state' });
            return;
        }

        // Update user balance in database
        const dbUser = await db.getUserById(user.id);
        if (!dbUser || dbUser.balance < amount) {
            socket.emit('error', { message: 'Insufficient balance' });
            return;
        }

        let success = false;
        
        // Handle different game types
        if (room.gameType === 'blackjack') {
            success = room.gameState.placeBet(user.id, amount);
        } else if (room.gameType === 'roulette') {
            success = room.gameState.placeBet(user.id, betType, amount, value);
        } else if (room.gameType === 'poker') {
            // Poker betting is handled differently through poker actions
            success = false; // Use poker actions instead
        }

        if (success) {
            // Update balance
            const newBalance = dbUser.balance - amount;
            await db.updateUserBalance(user.id, newBalance);
            await db.recordTransaction(user.id, null, 'bet', -amount, dbUser.balance, newBalance, `${room.gameType} bet`);
            
            // Update connected user balance
            connectedUsers.get(socket.id).balance = newBalance;
            
            // Send updates to players and spectators
            const publicState = room.gameState.getPublicState();
            const spectatorState = room.gameState.getSpectatorState ? 
                room.gameState.getSpectatorState() : publicState;
            
            io.to(roomId).emit('game_updated', publicState);
            io.to(`${roomId}_spectators`).emit('game_updated', spectatorState);
            
            socket.emit('bet_placed', { amount, newBalance });
        } else {
            socket.emit('error', { message: 'Failed to place bet' });
        }
    });

    // Poker-specific actions
    socket.on('poker_action', async (data) => {
        const { roomId, action, amount } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room || !room.gameState || room.gameType !== 'poker') {
            socket.emit('error', { message: 'Invalid game state' });
            return;
        }

        let success = false;
        const dbUser = await db.getUserById(user.id);
        
        switch(action) {
            case 'fold':
                success = room.gameState.fold(user.id);
                break;
            case 'call':
                success = room.gameState.call(user.id);
                break;
            case 'raise':
                if (amount && amount <= dbUser.balance) {
                    success = room.gameState.raise(user.id, amount);
                    if (success) {
                        const newBalance = dbUser.balance - amount;
                        await db.updateUserBalance(user.id, newBalance);
                        connectedUsers.get(socket.id).balance = newBalance;
                    }
                }
                break;
            case 'check':
                success = room.gameState.check(user.id);
                break;
            case 'all-in':
                success = room.gameState.allIn(user.id);
                if (success) {
                    const newBalance = 0; // All-in means using all balance
                    await db.updateUserBalance(user.id, newBalance);
                    connectedUsers.get(socket.id).balance = newBalance;
                }
                break;
        }

        if (success) {
            const publicState = room.gameState.getPublicState();
            const spectatorState = room.gameState.getSpectatorState ? 
                room.gameState.getSpectatorState() : publicState;
            
            io.to(roomId).emit('game_updated', publicState);
            io.to(`${roomId}_spectators`).emit('game_updated', spectatorState);
            
            // Check if it's the next player's turn
            if (room.gameState.currentPlayer !== undefined) {
                const currentPlayerId = room.gameState.players[room.gameState.currentPlayer]?.id;
                if (currentPlayerId) {
                    io.to(roomId).emit('turn_updated', { 
                        currentPlayerId: currentPlayerId,
                        gameState: publicState 
                    });
                }
            }
        } else {
            socket.emit('error', { message: 'Invalid action' });
        }
    });

    socket.on('hit', (data) => {
        const { roomId } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room || !room.gameState) return;

        const success = room.gameState.hit(user.id);
        if (success) {
            const publicState = room.gameState.getPublicState();
            const spectatorState = room.gameState.getSpectatorState ? 
                room.gameState.getSpectatorState() : publicState;
            
            io.to(roomId).emit('game_updated', publicState);
            io.to(`${roomId}_spectators`).emit('game_updated', spectatorState);
        }
    });

    socket.on('stand', (data) => {
        const { roomId } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room || !room.gameState) return;

        const success = room.gameState.stand(user.id);
        if (success) {
            const publicState = room.gameState.getPublicState();
            const spectatorState = room.gameState.getSpectatorState ? 
                room.gameState.getSpectatorState() : publicState;
            
            io.to(roomId).emit('game_updated', publicState);
            io.to(`${roomId}_spectators`).emit('game_updated', spectatorState);
        }
    });

    socket.on('double_down', async (data) => {
        const { roomId } = data;
        const user = connectedUsers.get(socket.id);
        const room = gameRooms.get(roomId);

        if (!user || !room || !room.gameState) return;

        const dbUser = await db.getUserById(user.id);
        const success = room.gameState.doubleDown(user.id);
        
        if (success && dbUser) {
            // Handle additional bet for double down
            const additionalBet = room.gameState.bets[user.id] / 2; // Half of doubled bet
            const newBalance = dbUser.balance - additionalBet;
            await db.updateUserBalance(user.id, newBalance);
            await db.recordTransaction(user.id, null, 'bet', -additionalBet, dbUser.balance, newBalance, `${room.gameType} double down`);
            
            connectedUsers.get(socket.id).balance = newBalance;
            
            const publicState = room.gameState.getPublicState();
            const spectatorState = room.gameState.getSpectatorState ? 
                room.gameState.getSpectatorState() : publicState;
            
            io.to(roomId).emit('game_updated', publicState);
            io.to(`${roomId}_spectators`).emit('game_updated', spectatorState);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        connectedUsers.delete(socket.id);
        
        // Handle player leaving rooms
        for (const [roomId, room] of gameRooms.entries()) {
            const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
            const spectatorIndex = room.spectators.findIndex(s => s.socketId === socket.id);
            
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
                        spectators: room.spectators.length,
                        maxPlayers: 8
                    });
                }
                break;
            } else if (spectatorIndex !== -1) {
                const spectator = room.spectators[spectatorIndex];
                room.spectators.splice(spectatorIndex, 1);
                
                // Notify room about spectator leaving
                io.to(roomId).emit('spectator_left', { 
                    username: spectator.username, 
                    spectatorCount: room.spectators.length 
                });
                
                // Update lobby
                io.to(`lobby_${room.gameType}`).emit('room_updated', {
                    id: roomId,
                    host: room.host.username,
                    players: room.players.length,
                    spectators: room.spectators.length,
                    maxPlayers: 8
                });
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