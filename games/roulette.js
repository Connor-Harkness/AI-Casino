class RouletteGame {
    constructor(players, bots) {
        this.players = [...players, ...bots];
        this.gamePhase = 'betting'; // betting, spinning, finished
        this.bets = {};
        this.results = {};
        this.winningNumber = null;
        this.winningColor = null;
        this.spinStartTime = null;
        this.spinDuration = 5000; // 5 seconds
        
        // Initialize player bets
        this.players.forEach(player => {
            this.bets[player.id] = [];
        });
        
        // Roulette wheel numbers and colors (European Roulette)
        this.wheelNumbers = [
            {number: 0, color: 'green'},
            {number: 32, color: 'red'}, {number: 15, color: 'black'}, {number: 19, color: 'red'}, {number: 4, color: 'black'},
            {number: 21, color: 'red'}, {number: 2, color: 'black'}, {number: 25, color: 'red'}, {number: 17, color: 'black'},
            {number: 34, color: 'red'}, {number: 6, color: 'black'}, {number: 27, color: 'red'}, {number: 13, color: 'black'},
            {number: 36, color: 'red'}, {number: 11, color: 'black'}, {number: 30, color: 'red'}, {number: 8, color: 'black'},
            {number: 23, color: 'red'}, {number: 10, color: 'black'}, {number: 5, color: 'red'}, {number: 24, color: 'black'},
            {number: 16, color: 'red'}, {number: 33, color: 'black'}, {number: 1, color: 'red'}, {number: 20, color: 'black'},
            {number: 14, color: 'red'}, {number: 31, color: 'black'}, {number: 9, color: 'red'}, {number: 22, color: 'black'},
            {number: 18, color: 'red'}, {number: 29, color: 'black'}, {number: 7, color: 'red'}, {number: 28, color: 'black'},
            {number: 12, color: 'red'}, {number: 35, color: 'black'}, {number: 3, color: 'red'}, {number: 26, color: 'black'}
        ];
    }

    getNumberColor(number) {
        if (number === 0) return 'green';
        const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        return redNumbers.includes(number) ? 'red' : 'black';
    }

    placeBet(playerId, betType, amount, value = null) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || amount > player.balance || amount <= 0) {
            return false;
        }
        
        if (this.gamePhase !== 'betting') {
            return false;
        }

        // Validate bet type
        const validBetTypes = [
            'straight', 'red', 'black', 'odd', 'even', 'low', 'high',
            'dozen1', 'dozen2', 'dozen3', 'column1', 'column2', 'column3'
        ];
        
        if (!validBetTypes.includes(betType)) {
            return false;
        }

        const bet = {
            type: betType,
            amount: amount,
            value: value, // For straight bets (specific number)
            timestamp: new Date()
        };

        this.bets[playerId].push(bet);
        return true;
    }

    removeBet(playerId, betIndex) {
        if (this.gamePhase !== 'betting') return false;
        
        const playerBets = this.bets[playerId];
        if (betIndex >= 0 && betIndex < playerBets.length) {
            playerBets.splice(betIndex, 1);
            return true;
        }
        return false;
    }

    spin() {
        if (this.gamePhase !== 'betting') return false;
        
        // Check if at least one player has placed a bet
        const totalBets = Object.values(this.bets).reduce((sum, playerBets) => sum + playerBets.length, 0);
        if (totalBets === 0) return false;

        this.gamePhase = 'spinning';
        this.spinStartTime = new Date();
        
        // Generate random winning number
        this.winningNumber = Math.floor(Math.random() * 37); // 0-36
        this.winningColor = this.getNumberColor(this.winningNumber);
        
        // Set timer to finish the game after spin duration
        setTimeout(() => {
            this.finishSpin();
        }, this.spinDuration);
        
        return true;
    }

    finishSpin() {
        this.gamePhase = 'finished';
        this.calculateResults();
    }

    calculateResults() {
        this.players.forEach(player => {
            const playerId = player.id;
            const playerBets = this.bets[playerId];
            let totalWinnings = 0;
            let betResults = [];

            playerBets.forEach(bet => {
                let payout = 0;
                let won = false;

                switch (bet.type) {
                    case 'straight':
                        // Single number bet (35:1 payout)
                        if (this.winningNumber === bet.value) {
                            payout = bet.amount * 35;
                            won = true;
                        }
                        break;
                    
                    case 'red':
                        if (this.winningColor === 'red') {
                            payout = bet.amount;
                            won = true;
                        }
                        break;
                    
                    case 'black':
                        if (this.winningColor === 'black') {
                            payout = bet.amount;
                            won = true;
                        }
                        break;
                    
                    case 'odd':
                        if (this.winningNumber > 0 && this.winningNumber % 2 === 1) {
                            payout = bet.amount;
                            won = true;
                        }
                        break;
                    
                    case 'even':
                        if (this.winningNumber > 0 && this.winningNumber % 2 === 0) {
                            payout = bet.amount;
                            won = true;
                        }
                        break;
                    
                    case 'low':
                        // 1-18
                        if (this.winningNumber >= 1 && this.winningNumber <= 18) {
                            payout = bet.amount;
                            won = true;
                        }
                        break;
                    
                    case 'high':
                        // 19-36
                        if (this.winningNumber >= 19 && this.winningNumber <= 36) {
                            payout = bet.amount;
                            won = true;
                        }
                        break;
                    
                    case 'dozen1':
                        // 1-12 (2:1 payout)
                        if (this.winningNumber >= 1 && this.winningNumber <= 12) {
                            payout = bet.amount * 2;
                            won = true;
                        }
                        break;
                    
                    case 'dozen2':
                        // 13-24 (2:1 payout)
                        if (this.winningNumber >= 13 && this.winningNumber <= 24) {
                            payout = bet.amount * 2;
                            won = true;
                        }
                        break;
                    
                    case 'dozen3':
                        // 25-36 (2:1 payout)
                        if (this.winningNumber >= 25 && this.winningNumber <= 36) {
                            payout = bet.amount * 2;
                            won = true;
                        }
                        break;
                    
                    case 'column1':
                        // Column 1: 1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34 (2:1 payout)
                        if (this.winningNumber > 0 && (this.winningNumber - 1) % 3 === 0) {
                            payout = bet.amount * 2;
                            won = true;
                        }
                        break;
                    
                    case 'column2':
                        // Column 2: 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35 (2:1 payout)
                        if (this.winningNumber > 0 && (this.winningNumber - 2) % 3 === 0) {
                            payout = bet.amount * 2;
                            won = true;
                        }
                        break;
                    
                    case 'column3':
                        // Column 3: 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36 (2:1 payout)
                        if (this.winningNumber > 0 && this.winningNumber % 3 === 0) {
                            payout = bet.amount * 2;
                            won = true;
                        }
                        break;
                }

                const result = {
                    bet: bet,
                    won: won,
                    payout: payout,
                    netWin: won ? payout : -bet.amount
                };

                betResults.push(result);
                totalWinnings += result.netWin;
            });

            this.results[playerId] = {
                bets: betResults,
                totalWinnings: totalWinnings
            };
        });
    }

    getPublicState() {
        return {
            gamePhase: this.gamePhase,
            players: this.players.map(player => ({
                id: player.id,
                username: player.username,
                bets: this.bets[player.id].map(bet => ({
                    type: bet.type,
                    amount: bet.amount,
                    value: bet.value
                })),
                totalBet: this.bets[player.id].reduce((sum, bet) => sum + bet.amount, 0),
                result: this.results[player.id]
            })),
            winningNumber: this.gamePhase === 'finished' ? this.winningNumber : null,
            winningColor: this.gamePhase === 'finished' ? this.winningColor : null,
            spinStartTime: this.spinStartTime,
            spinDuration: this.spinDuration,
            timeRemaining: this.gamePhase === 'spinning' 
                ? Math.max(0, this.spinDuration - (Date.now() - this.spinStartTime)) 
                : null
        };
    }

    getSpectatorState() {
        // Spectators see the same as public state - no hidden information in roulette
        return this.getPublicState();
    }

    // Bot AI for placing bets
    makeBotBets(botId) {
        const bot = this.players.find(p => p.id === botId);
        if (!bot || this.gamePhase !== 'betting') return;

        // Bots place 1-3 random bets
        const numBets = Math.floor(Math.random() * 3) + 1;
        const betAmount = Math.floor(bot.balance * 0.1); // Bet 10% of balance

        for (let i = 0; i < numBets && betAmount > 0; i++) {
            const betTypes = ['red', 'black', 'odd', 'even', 'low', 'high'];
            const randomBetType = betTypes[Math.floor(Math.random() * betTypes.length)];
            
            // Sometimes place straight number bet
            if (Math.random() < 0.3) {
                const randomNumber = Math.floor(Math.random() * 37);
                this.placeBet(botId, 'straight', Math.min(betAmount, 50), randomNumber);
            } else {
                this.placeBet(botId, randomBetType, betAmount);
            }
        }
    }

    // Get betting time remaining (e.g., 30 seconds)
    getBettingTimeRemaining() {
        if (this.gamePhase !== 'betting') return 0;
        // This would be implemented with a betting timer in the full game
        return 30000; // 30 seconds
    }
}

module.exports = RouletteGame;