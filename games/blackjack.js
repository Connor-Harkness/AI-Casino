class BlackjackGame {
    constructor(players, bots) {
        this.players = [...players, ...bots];
        this.deck = this.createDeck();
        this.dealerHand = [];
        this.playerHands = {};
        this.currentPlayer = 0;
        this.gamePhase = 'betting'; // betting, dealing, playing, dealer, finished
        this.bets = {};
        this.results = {};
        
        // Initialize player hands
        this.players.forEach(player => {
            this.playerHands[player.id] = [];
            this.bets[player.id] = 0;
        });
    }

    createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
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
        if (rank === 'A') return 11;
        if (['J', 'Q', 'K'].includes(rank)) return 10;
        return parseInt(rank);
    }

    calculateHandValue(hand) {
        let value = 0;
        let aces = 0;
        
        hand.forEach(card => {
            if (card.rank === 'A') {
                aces++;
                value += 11;
            } else {
                value += card.value;
            }
        });
        
        // Adjust for aces
        while (value > 21 && aces > 0) {
            value -= 10;
            aces--;
        }
        
        return value;
    }

    dealCard() {
        return this.deck.pop();
    }

    placeBet(playerId, amount) {
        const player = this.players.find(p => p.id === playerId);
        if (!player || amount > player.balance || amount <= 0) {
            return false;
        }
        
        this.bets[playerId] = amount;
        return true;
    }

    dealInitialCards() {
        // Deal 2 cards to each player
        this.players.forEach(player => {
            this.playerHands[player.id].push(this.dealCard());
            this.playerHands[player.id].push(this.dealCard());
        });
        
        // Deal 2 cards to dealer (one face down)
        this.dealerHand.push(this.dealCard());
        this.dealerHand.push(this.dealCard());
        
        this.gamePhase = 'playing';
    }

    hit(playerId) {
        if (this.gamePhase !== 'playing') return false;
        
        const hand = this.playerHands[playerId];
        if (!hand) return false;
        
        hand.push(this.dealCard());
        
        // Check if busted
        if (this.calculateHandValue(hand) > 21) {
            this.results[playerId] = 'bust';
            return true;
        }
        
        return true;
    }

    stand(playerId) {
        if (this.gamePhase !== 'playing') return false;
        
        this.results[playerId] = 'stand';
        return true;
    }

    doubleDown(playerId) {
        if (this.gamePhase !== 'playing') return false;
        
        const player = this.players.find(p => p.id === playerId);
        const currentBet = this.bets[playerId];
        
        if (player.balance < currentBet) return false;
        
        this.bets[playerId] *= 2;
        this.hit(playerId);
        this.results[playerId] = 'stand'; // Auto stand after double down
        return true;
    }

    playDealer() {
        this.gamePhase = 'dealer';
        
        // Dealer plays according to standard rules
        while (this.calculateHandValue(this.dealerHand) < 17) {
            this.dealerHand.push(this.dealCard());
        }
        
        this.gamePhase = 'finished';
        this.calculateResults();
    }

    calculateResults() {
        const dealerValue = this.calculateHandValue(this.dealerHand);
        const dealerBusted = dealerValue > 21;
        
        this.players.forEach(player => {
            const playerId = player.id;
            const playerValue = this.calculateHandValue(this.playerHands[playerId]);
            const bet = this.bets[playerId];
            
            if (this.results[playerId] === 'bust') {
                // Player busted - lose bet
                this.results[playerId] = { result: 'lose', winnings: -bet };
            } else if (dealerBusted) {
                // Dealer busted - player wins
                if (playerValue === 21 && this.playerHands[playerId].length === 2) {
                    // Blackjack pays 3:2
                    this.results[playerId] = { result: 'blackjack', winnings: bet * 1.5 };
                } else {
                    this.results[playerId] = { result: 'win', winnings: bet };
                }
            } else if (playerValue > dealerValue) {
                // Player wins
                if (playerValue === 21 && this.playerHands[playerId].length === 2) {
                    this.results[playerId] = { result: 'blackjack', winnings: bet * 1.5 };
                } else {
                    this.results[playerId] = { result: 'win', winnings: bet };
                }
            } else if (playerValue === dealerValue) {
                // Push (tie)
                this.results[playerId] = { result: 'push', winnings: 0 };
            } else {
                // Player loses
                this.results[playerId] = { result: 'lose', winnings: -bet };
            }
        });
    }

    getPublicState() {
        return {
            gamePhase: this.gamePhase,
            players: this.players.map(player => ({
                id: player.id,
                username: player.username,
                hand: this.playerHands[player.id],
                handValue: this.calculateHandValue(this.playerHands[player.id]),
                bet: this.bets[player.id],
                result: this.results[player.id]
            })),
            dealerHand: this.gamePhase === 'finished' 
                ? this.dealerHand 
                : [this.dealerHand[0], { hidden: true }], // Hide dealer's second card until end
            dealerValue: this.gamePhase === 'finished' 
                ? this.calculateHandValue(this.dealerHand) 
                : null,
            currentPlayer: this.currentPlayer
        };
    }

    // Bot AI
    makeBotMove(botId) {
        const hand = this.playerHands[botId];
        const handValue = this.calculateHandValue(hand);
        const dealerUpCard = this.dealerHand[0];
        const dealerUpValue = dealerUpCard.value;
        
        // Simple basic strategy
        if (handValue < 12) {
            return this.hit(botId);
        } else if (handValue >= 17) {
            return this.stand(botId);
        } else {
            // Hit on 12-16 if dealer shows 7-A, otherwise stand
            if (dealerUpValue >= 7 || dealerUpValue === 11) {
                return this.hit(botId);
            } else {
                return this.stand(botId);
            }
        }
    }
}

module.exports = BlackjackGame;