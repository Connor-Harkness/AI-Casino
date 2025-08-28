const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

class Database {
    constructor(dbPath = './database/casino.db') {
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
            } else {
                console.log('Connected to SQLite database');
                this.initTables();
            }
        });
    }

    initTables() {
        // Users table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT UNIQUE,
                balance REAL DEFAULT 1000.0,
                is_admin BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Games table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS games (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL CHECK(type IN ('poker', 'blackjack', 'roulette')),
                room_id TEXT NOT NULL,
                host_user_id INTEGER,
                started_at DATETIME,
                ended_at DATETIME,
                game_data TEXT, -- JSON data for game state
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (host_user_id) REFERENCES users (id)
            )
        `);

        // Game participants table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS game_participants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                user_id INTEGER,
                is_bot BOOLEAN DEFAULT FALSE,
                position INTEGER,
                final_balance REAL,
                winnings REAL DEFAULT 0,
                joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games (id),
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
        `);

        // Transactions table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_id INTEGER,
                type TEXT NOT NULL CHECK(type IN ('bet', 'win', 'loss', 'admin_adjustment')),
                amount REAL NOT NULL,
                balance_before REAL NOT NULL,
                balance_after REAL NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id),
                FOREIGN KEY (game_id) REFERENCES games (id)
            )
        `);

        // Game events table for auditing
        this.db.run(`
            CREATE TABLE IF NOT EXISTS game_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                event_data TEXT, -- JSON data
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (game_id) REFERENCES games (id)
            )
        `);

        console.log('Database tables initialized');
    }

    // User management methods
    async createUser(username, password, email = null, isAdmin = false) {
        return new Promise((resolve, reject) => {
            const hashedPassword = bcrypt.hashSync(password, 10);
            const stmt = this.db.prepare(`
                INSERT INTO users (username, password_hash, email, is_admin) 
                VALUES (?, ?, ?, ?)
            `);
            stmt.run([username, hashedPassword, email, isAdmin], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE username = ? AND is_active = TRUE',
                [username],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM users WHERE id = ? AND is_active = TRUE',
                [userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async updateUserBalance(userId, newBalance) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE users SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newBalance, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async getLeaderboard(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT username, balance FROM users WHERE is_active = TRUE ORDER BY balance DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getUserCount() {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT COUNT(*) as count FROM users',
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                }
            );
        });
    }

    async recordTransaction(userId, gameId, type, amount, balanceBefore, balanceAfter, description = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO transactions (user_id, game_id, type, amount, balance_before, balance_after, description) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run([userId, gameId, type, amount, balanceBefore, balanceAfter, description], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
            stmt.finalize();
        });
    }

    // Game management methods
    async createGameSession(roomId, gameType, hostUserId, gameData = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO games (room_id, type, host_user_id, started_at, game_data)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
            `);
            stmt.run([roomId, gameType, hostUserId, JSON.stringify(gameData)], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async endGameSession(gameId, finalGameData = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE games 
                SET ended_at = CURRENT_TIMESTAMP, game_data = ?
                WHERE id = ?
            `);
            stmt.run([JSON.stringify(finalGameData), gameId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.changes);
                }
            });
            stmt.finalize();
        });
    }

    async recordGameParticipant(gameId, userId, isBot = false, position = null, finalBalance = null, winnings = 0) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO game_participants (game_id, user_id, is_bot, position, final_balance, winnings)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            stmt.run([gameId, userId, isBot, position, finalBalance, winnings], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    async recordGameEvent(gameId, eventType, eventData = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO game_events (game_id, event_type, event_data)
                VALUES (?, ?, ?)
            `);
            stmt.run([gameId, eventType, JSON.stringify(eventData)], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
            stmt.finalize();
        });
    }

    close() {
        this.db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('Database connection closed');
            }
        });
    }
}

module.exports = Database;