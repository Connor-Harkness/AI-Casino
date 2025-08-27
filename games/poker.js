class PokerGame {
    constructor(players, bots) {
        this.players = [...players, ...bots];
        this.deck = this.createDeck();
        this.communityCards = [];
        this.playerHands = {};
        this.playerBets = {};
        this.playerStatus = {}; // folded, active, all-in
        this.pot = 0;
        this.currentPlayer = 0;
        this.dealerPosition = 0;
        this.smallBlind = 10;
        this.bigBlind = 20;
        this.gamePhase = 'preflop'; // preflop, flop, turn, river, showdown, finished
        this.bettingRound = 0;
        this.lastBet = 0;
        this.results = {};
        
        // Initialize player data
        this.players.forEach((player, index) => {
            this.playerHands[player.id] = [];
            this.playerBets[player.id] = 0;
            this.playerStatus[player.id] = 'active';
        });
        
        this.postBlinds();
        this.dealInitialCards();
    }

    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const deck = [];
        
        suits.forEach(suit => {
            ranks.forEach(rank => {
                deck.push({ suit, rank, value: this.getCardValue(rank) });
            });
        });
        
        // Shuffle deck
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        
        return deck;
    }

    getCardValue(rank) {
        if (rank === 'A') return 14;
        if (rank === 'K') return 13;
        if (rank === 'Q') return 12;
        if (rank === 'J') return 11;
        return parseInt(rank);
    }

    postBlinds() {
        const smallBlindIndex = (this.dealerPosition + 1) % this.players.length;
        const bigBlindIndex = (this.dealerPosition + 2) % this.players.length;
        
        const smallBlindPlayer = this.players[smallBlindIndex];
        const bigBlindPlayer = this.players[bigBlindIndex];
        
        // Post small blind
        const smallBlindAmount = Math.min(smallBlindPlayer.balance, this.smallBlind);
        this.playerBets[smallBlindPlayer.id] = smallBlindAmount;
        this.pot += smallBlindAmount;
        
        // Post big blind
        const bigBlindAmount = Math.min(bigBlindPlayer.balance, this.bigBlind);
        this.playerBets[bigBlindPlayer.id] = bigBlindAmount;
        this.pot += bigBlindAmount;
        this.lastBet = bigBlindAmount;
        
        // Set current player to after big blind
        this.currentPlayer = (bigBlindIndex + 1) % this.players.length;
    }

    dealInitialCards() {
        // Deal 2 cards to each player
        for (let i = 0; i < 2; i++) {
            this.players.forEach(player => {
                if (this.playerStatus[player.id] === 'active') {
                    this.playerHands[player.id].push(this.deck.pop());
                }
            });
        }
    }

    dealCommunityCard() {
        if (this.communityCards.length < 5) {
            this.communityCards.push(this.deck.pop());
        }
    }

    call(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || this.playerStatus[playerId] !== 'active') return false;
        
        const currentBet = this.playerBets[playerId];
        const callAmount = this.lastBet - currentBet;
        const actualCall = Math.min(callAmount, player.balance - currentBet);
        
        this.playerBets[playerId] += actualCall;
        this.pot += actualCall;
        
        if (actualCall < callAmount) {
            this.playerStatus[playerId] = 'all-in';
        }
        
        return true;
    }

    raise(playerId, amount) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || this.playerStatus[playerId] !== 'active') return false;
        
        const currentBet = this.playerBets[playerId];
        const totalBet = currentBet + amount;
        
        if (totalBet <= this.lastBet || amount > player.balance - currentBet) {
            return false; // Invalid raise
        }
        
        this.playerBets[playerId] = totalBet;
        this.pot += amount;
        this.lastBet = totalBet;
        
        return true;
    }

    fold(playerId) {
        if (this.playerStatus[playerId] === 'active') {
            this.playerStatus[playerId] = 'folded';
            return true;
        }
        return false;
    }

    check(playerId) {
        const currentBet = this.playerBets[playerId];
        return currentBet === this.lastBet;
    }

    nextPlayer() {
        const activePlayers = this.players.filter(p => 
            this.playerStatus[p.id] === 'active' || this.playerStatus[p.id] === 'all-in'
        );
        
        if (activePlayers.length <= 1) {
            this.gamePhase = 'finished';
            this.calculateResults();
            return;
        }

        do {
            this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
        } while (
            this.playerStatus[this.players[this.currentPlayer].id] === 'folded'
        );

        // Check if betting round is complete
        if (this.isBettingRoundComplete()) {
            this.nextPhase();
        }
    }

    isBettingRoundComplete() {
        const activePlayers = this.players.filter(p => 
            this.playerStatus[p.id] === 'active'
        );
        
        return activePlayers.every(player => 
            this.playerBets[player.id] === this.lastBet
        );
    }

    nextPhase() {
        this.bettingRound++;
        
        switch (this.gamePhase) {
            case 'preflop':
                this.gamePhase = 'flop';
                // Deal 3 community cards
                this.dealCommunityCard();
                this.dealCommunityCard();
                this.dealCommunityCard();
                break;
            
            case 'flop':
                this.gamePhase = 'turn';
                this.dealCommunityCard();
                break;
            
            case 'turn':
                this.gamePhase = 'river';
                this.dealCommunityCard();
                break;
            
            case 'river':
                this.gamePhase = 'showdown';
                this.calculateResults();
                return;
        }
        
        // Reset betting
        this.lastBet = 0;
        this.players.forEach(player => {
            this.playerBets[player.id] = 0;
        });
        
        // Set current player to first active player after dealer
        this.currentPlayer = (this.dealerPosition + 1) % this.players.length;
        while (this.playerStatus[this.players[this.currentPlayer].id] === 'folded') {
            this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
        }
    }

    evaluateHand(playerId) {
        const playerCards = this.playerHands[playerId];
        const allCards = [...playerCards, ...this.communityCards];
        
        // Find best 5-card hand from 7 cards
        return this.getBestHand(allCards);
    }

    getBestHand(cards) {
        // Simplified hand evaluation - in a full implementation, this would be much more comprehensive
        const suits = {};
        const ranks = {};
        
        cards.forEach(card => {
            suits[card.suit] = (suits[card.suit] || 0) + 1;
            ranks[card.value] = (ranks[card.value] || 0) + 1;
        });
        
        const isFlush = Object.values(suits).some(count => count >= 5);
        const sortedRanks = Object.keys(ranks).map(Number).sort((a, b) => b - a);
        const isStraight = this.checkStraight(sortedRanks);
        
        // Determine hand ranking (simplified)
        if (isFlush && isStraight) {
            return { ranking: 8, name: 'Straight Flush', value: Math.max(...sortedRanks) };
        } else if (Object.values(ranks).includes(4)) {
            return { ranking: 7, name: 'Four of a Kind', value: this.getHighestCount(ranks, 4) };
        } else if (Object.values(ranks).includes(3) && Object.values(ranks).includes(2)) {
            return { ranking: 6, name: 'Full House', value: this.getHighestCount(ranks, 3) };
        } else if (isFlush) {
            return { ranking: 5, name: 'Flush', value: Math.max(...sortedRanks) };
        } else if (isStraight) {
            return { ranking: 4, name: 'Straight', value: Math.max(...sortedRanks) };
        } else if (Object.values(ranks).includes(3)) {
            return { ranking: 3, name: 'Three of a Kind', value: this.getHighestCount(ranks, 3) };
        } else if (Object.values(ranks).filter(count => count === 2).length >= 2) {
            return { ranking: 2, name: 'Two Pair', value: this.getHighestCount(ranks, 2) };
        } else if (Object.values(ranks).includes(2)) {
            return { ranking: 1, name: 'One Pair', value: this.getHighestCount(ranks, 2) };
        } else {
            return { ranking: 0, name: 'High Card', value: Math.max(...sortedRanks) };
        }
    }

    checkStraight(sortedRanks) {
        // Simplified straight check
        for (let i = 0; i < sortedRanks.length - 4; i++) {
            if (sortedRanks[i] - sortedRanks[i + 4] === 4) {
                return true;
            }
        }
        return false;
    }

    getHighestCount(ranks, count) {
        return Math.max(
            ...Object.entries(ranks)
                .filter(([rank, c]) => c === count)
                .map(([rank, c]) => parseInt(rank))
        );
    }

    calculateResults() {
        const activePlayers = this.players.filter(p => 
            this.playerStatus[p.id] !== 'folded'
        );
        
        if (activePlayers.length === 1) {
            // Only one player remaining - they win the pot
            const winner = activePlayers[0];
            this.results[winner.id] = {
                result: 'win',
                winnings: this.pot,
                hand: this.evaluateHand(winner.id)
            };
        } else {
            // Evaluate hands and determine winner(s)
            const handEvaluations = activePlayers.map(player => ({
                player: player,
                hand: this.evaluateHand(player.id)
            }));
            
            handEvaluations.sort((a, b) => {
                if (a.hand.ranking !== b.hand.ranking) {
                    return b.hand.ranking - a.hand.ranking;
                }
                return b.hand.value - a.hand.value;
            });
            
            const bestHand = handEvaluations[0];
            const winners = handEvaluations.filter(eval => 
                eval.hand.ranking === bestHand.hand.ranking && 
                eval.hand.value === bestHand.hand.value
            );
            
            const winningsPerPlayer = this.pot / winners.length;
            
            winners.forEach(winner => {
                this.results[winner.player.id] = {
                    result: 'win',
                    winnings: winningsPerPlayer,
                    hand: winner.hand
                };
            });
            
            activePlayers.forEach(player => {
                if (!this.results[player.id]) {
                    const evaluation = handEvaluations.find(e => e.player.id === player.id);
                    this.results[player.id] = {
                        result: 'lose',
                        winnings: 0,
                        hand: evaluation.hand
                    };
                }
            });
        }
        
        this.gamePhase = 'finished';
    }

    getPublicState() {
        return {
            gamePhase: this.gamePhase,
            pot: this.pot,
            communityCards: this.communityCards,
            currentPlayer: this.currentPlayer,
            lastBet: this.lastBet,
            players: this.players.map(player => ({
                id: player.id,
                username: player.username,
                hand: this.playerHands[player.id], // In a real game, only show to the player
                bet: this.playerBets[player.id],
                status: this.playerStatus[player.id],
                result: this.results[player.id]
            }))
        };
    }

    getSpectatorState() {
        // Spectators don't see player hands unless the game is finished
        return {
            gamePhase: this.gamePhase,
            pot: this.pot,
            communityCards: this.communityCards,
            currentPlayer: this.currentPlayer,
            lastBet: this.lastBet,
            players: this.players.map(player => ({
                id: player.id,
                username: player.username,
                hand: this.gamePhase === 'finished' ? this.playerHands[player.id] : null,
                bet: this.playerBets[player.id],
                status: this.playerStatus[player.id],
                result: this.results[player.id]
            }))
        };
    }

    // Bot AI
    makeBotAction(botId) {
        const bot = this.players.find(p => p.id === botId);
        if (!bot || this.playerStatus[botId] !== 'active') return null;
        
        const currentBet = this.playerBets[botId];
        const callAmount = this.lastBet - currentBet;
        const hand = this.evaluateHand(botId);
        
        // Simple bot strategy based on hand strength
        if (hand.ranking >= 6) {
            // Strong hand - raise or call
            if (Math.random() < 0.7 && callAmount < bot.balance * 0.3) {
                const raiseAmount = Math.min(this.lastBet, bot.balance * 0.2);
                return this.raise(botId, raiseAmount) ? 'raise' : 'call';
            } else {
                return this.call(botId) ? 'call' : 'fold';
            }
        } else if (hand.ranking >= 3) {
            // Medium hand - call or fold
            if (callAmount <= bot.balance * 0.1) {
                return this.call(botId) ? 'call' : 'fold';
            } else {
                return this.fold(botId) ? 'fold' : null;
            }
        } else {
            // Weak hand - fold or bluff
            if (Math.random() < 0.1) {
                // Occasional bluff
                return this.call(botId) ? 'call' : 'fold';
            } else {
                return this.fold(botId) ? 'fold' : null;
            }
        }
    }
}

module.exports = PokerGame;