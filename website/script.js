// Wait for the entire HTML structure to load
document.addEventListener('DOMContentLoaded', () => {

    // --- Constants and Global Variables ---
    const leaderboardURL = 'leaderboard.csv';
    const OPTIMIZATION_ITERATIONS = 20000;
    let leaderboardData = new Map();

    // References to HTML elements
    const listEl = document.getElementById('leaderboard-list');
    const loadingEl = document.getElementById('leaderboard-loading');
    const buildButton = document.getElementById('build-button');
    const playerNamesEl = document.getElementById('player-names');
    const teamCountEl = document.getElementById('team-count');
    const teamsOutputEl = document.getElementById('teams-output');

    
    // --- Main Functions ---

    /**
     * 1. Loads the CSV file from the server
     */
    async function loadLeaderboard() {
        try {
            const response = await fetch(leaderboardURL);
            if (!response.ok) {
                throw new Error(`Error loading file: ${response.statusText}`);
            }
            const csvText = await response.text();
            
            parseCSV(csvText);
            displayLeaderboard();
            loadingEl.style.display = 'none'; 
        } catch (error) {
            console.error('Error loading leaderboard:', error);
            loadingEl.textContent = 'Failed to load leaderboard.';
            loadingEl.style.color = 'red';
        }
    }

    /**
     * 2. Processes the CSV text and stores it in the `leaderboardData` Map
     */
    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const headerLine = lines.shift().trim();
        const headers = headerLine.split(',').map(h => h.trim());
        
        const nameIndex = headers.indexOf('name');
        const rankIndex = headers.indexOf('rank');
        const skillIndex = headers.indexOf('true_skill');

        if (nameIndex === -1 || rankIndex === -1 || skillIndex === -1) {
            const errorMsg = "Error: CSV file does not contain required columns 'name', 'rank', and 'true_skill'.";
            console.error(errorMsg);
            loadingEl.textContent = errorMsg;
            loadingEl.style.color = 'red';
            return;
        }

        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length > Math.max(nameIndex, rankIndex, skillIndex)) {
                const name = parts[nameIndex].trim();
                const ordinalRank = parseInt(parts[rankIndex], 10);
                const trueSkill = parseFloat(parts[skillIndex]);

                if (name && !isNaN(ordinalRank) && !isNaN(trueSkill)) {
                    leaderboardData.set(name.toLowerCase(), {
                        originalName: name,
                        rank: ordinalRank,
                        skill: trueSkill 
                    });
                }
            }
        });
    }

    /**
     * 3. Displays the Top 5 players in the HTML list
     */
    function displayLeaderboard() {
        const players = [...leaderboardData.values()];
        const sortedPlayers = players.sort((a, b) => a.rank - b.rank);
        const top5 = sortedPlayers.slice(0, 5);

        listEl.innerHTML = '';
        top5.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.originalName} (TrueSkill: ${player.skill.toFixed(2)})`;
            listEl.appendChild(li);
        });
    }

    /**
     * 4. Main function for building teams (called on button click)
     */
    function handleBuildTeams() {
        // Step 1: Get user inputs
        const namesInput = playerNamesEl.value.trim();
        const teamCount = parseInt(teamCountEl.value, 10);

        // Step 2: Validate inputs
        if (!namesInput) {
            alert('Please enter player names.');
            return;
        }
        if (isNaN(teamCount) || teamCount < 2) {
            alert('The number of teams must be at least 2.');
            return;
        }

        // Step 3: Process names, filter duplicates, and split into FOUND and NOT FOUND
        const allInputNames = namesInput.split('\n')
            .map(name => name.trim()) // Remove whitespace
            .filter(name => name.length > 0); // Remove empty lines
        
        let attendingPlayers = []; // Players who will be put into teams
        let notFoundPlayers = [];  // Players who will just be listed as not found
        
        // ** NEW PART: Set to track already processed names **
        const processedNames = new Set();

        allInputNames.forEach(originalName => {
            const nameLower = originalName.toLowerCase();

            // ** DUPLICATE CHECK **
            // If we have already processed this name (case-insensitive), skip it
            if (processedNames.has(nameLower)) {
                return; // Go to the next name in `allInputNames`
            }
            // If the name is new, add it to the Set
            processedNames.add(nameLower);

            // The rest of the logic is the same
            const playerData = leaderboardData.get(nameLower);
            
            if (playerData) {
                // Player found, add them to the balancing list
                attendingPlayers.push({ name: playerData.originalName, skill: playerData.skill });
            } else {
                // Player not found, add them to the "not found" list
                notFoundPlayers.push(originalName); // We use the original entered name
            }
        });

        // Step 4: Further validation (we only check the count of found players)
        if (attendingPlayers.length < teamCount) {
             alert('The number of unique players found in the leaderboard is less than the required number of teams.');
            return;
        }
        if (attendingPlayers.length === 0) {
            alert('No players were found to divide into teams.');
            // We only display the not-found players (if any)
            displayTeams([], notFoundPlayers);
            return;
        }

        // Step 5: Run the balancing algorithm (only with found players)
        const teams = balanceTeams(attendingPlayers, teamCount);
        
        // Step 6: Display the result (teams + not-found players)
        displayTeams(teams, notFoundPlayers);
    }

    // -----------------------------------------------------------------
    // --- 5. ALGORITHM CORE: Optimized Team Balancing ---
    // -----------------------------------------------------------------

    /**
     * Main function: Sorts, distributes, and optimizes teams.
     */
    function balanceTeams(players, teamCount) {
        // Step 5.1: Sort players from best (highest skill) to worst
        players.sort((a, b) => b.skill - a.skill);

        // Step 5.2: Create empty teams
        let teams = [];
        for (let i = 0; i < teamCount; i++) {
            teams.push({
                name: `Team ${i + 1}`, // Changed to "Team"
                players: [], 
                totalSkill: 0
            });
        }

        // Step 5.3: Perform initial distribution ("Serpentine Draft")
        seedTeams_Serpentine(players, teams);

        // Step 5.4: Run the swap-based optimization ("Hill Climbing")
        optimizeTeams_HillClimbing(teams, OPTIMIZATION_ITERATIONS);

        return teams;
    }

    /**
     * Creates the initial distribution using "Serpentine Draft".
     */
    function seedTeams_Serpentine(sortedPlayers, teams) {
        let teamIndex = 0;
        let direction = 1;

        for (const player of sortedPlayers) {
            teams[teamIndex].players.push(player);
            teams[teamIndex].totalSkill += player.skill;

            teamIndex += direction;

            if (teamIndex >= teams.length) {
                direction = -1;
                teamIndex = teams.length - 1;
            } else if (teamIndex < 0) {
                direction = 1;
                teamIndex = 0;
            }
        }
    }

    /**
     * Iteratively improves the team distribution by swapping players.
     */
    function optimizeTeams_HillClimbing(teams, iterations) {
        let currentCost = calculateCost(teams);

        for (let i = 0; i < iterations; i++) {
            if (currentCost === 0) break;

            const teamIndex1 = Math.floor(Math.random() * teams.length);
            let teamIndex2 = Math.floor(Math.random() * teams.length);
            if (teamIndex1 === teamIndex2) {
                teamIndex2 = (teamIndex1 + 1) % teams.length;
            }

            const team1 = teams[teamIndex1];
            const team2 = teams[teamIndex2];

            if (team1.players.length === 0 || team2.players.length === 0) {
                continue;
            }

            const playerIndex1 = Math.floor(Math.random() * team1.players.length);
            const playerIndex2 = Math.floor(Math.random() * team2.players.length);

            const player1 = team1.players[playerIndex1];
            const player2 = team2.players[playerIndex2];

            const newCost = calculateHypotheticalCost(teams, teamIndex1, teamIndex2, player1, player2);

            if (newCost < currentCost) {
                team1.players[playerIndex1] = player2;
                team2.players[playerIndex2] = player1;
                
                team1.totalSkill = team1.totalSkill - player1.skill + player2.skill;
                team2.totalSkill = team2.totalSkill - player2.skill + player1.skill;
                
                currentCost = newCost;
            }
        }
    }


    // --- Optimization Helper Functions ---

    function calculateHypotheticalCost(teams, t1_idx, t2_idx, p1, p2) {
        const team1 = teams[t1_idx];
        const team2 = teams[t2_idx];
        const averages = teams.map(getAverageSkill);
        const len1 = team1.players.length;
        const len2 = team2.players.length;
        const newAvg1 = (len1 > 0) ? (team1.totalSkill - p1.skill + p2.skill) / len1 : 0;
        const newAvg2 = (len2 > 0) ? (team2.totalSkill - p2.skill + p1.skill) / len2 : 0;
        averages[t1_idx] = newAvg1;
        averages[t2_idx] = newAvg2;
        return calculateStdDev(averages);
    }

    function calculateCost(teams) {
        const averages = teams.map(getAverageSkill);
        return calculateStdDev(averages);
    }

    function calculateStdDev(numbers) {
        if (numbers.length === 0) return 0;
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
        return Math.sqrt(variance);
    }

    function getAverageSkill(team) {
        return (team.players.length > 0) ? (team.totalSkill / team.players.length) : 0;
    }


    // -----------------------------------------------------------------
    // --- 6. Displaying Results ---
    // -----------------------------------------------------------------

    /**
     * 6. Displays the generated teams and the list of not-found players
     */
    function displayTeams(teams, notFoundPlayers) {
        teamsOutputEl.innerHTML = ''; 
        
        if(teams.length > 0) {
            const finalCost = calculateCost(teams);
            const statsEl = document.createElement('p');
            statsEl.style.textAlign = 'center';
            statsEl.style.width = '100%';
            statsEl.style.marginTop = '15px';
            teamsOutputEl.prepend(statsEl);
        }

        const container = document.createElement('div');
        container.className = 'teams-container';

        teams.sort((a, b) => a.name.localeCompare(b.name));

        teams.forEach(team => {
            const card = document.createElement('div');
            card.className = 'team-card';

            const title = document.createElement('h3');
            title.textContent = team.name;
            card.appendChild(title);

            const ul = document.createElement('ul');
            if (team.players.length === 0) {
                const li = document.createElement('li');
                li.textContent = "(Empty team)";
                li.style.fontStyle = "italic";
                ul.appendChild(li);
            } else {
                team.players.sort((a, b) => b.skill - a.skill);
                
                team.players.forEach(playerObj => {
                    const li = document.createElement('li');
                    li.textContent = `${playerObj.name} (${playerObj.skill.toFixed(2)})`; 
                    ul.appendChild(li);
                });
            }
            card.appendChild(ul);
            
            const avgSkill = getAverageSkill(team);

            const rankInfo = document.createElement('p');
            rankInfo.className = 'total-rank';
            rankInfo.textContent = `Average TrueSkill: ${avgSkill.toFixed(2)}`;
            card.appendChild(rankInfo);

            container.appendChild(card);
        });

        teamsOutputEl.appendChild(container);

        if (notFoundPlayers.length > 0) {
            const notFoundContainer = document.createElement('div');
            notFoundContainer.className = 'not-found-container';
            notFoundContainer.style.marginTop = '30px';
            notFoundContainer.style.padding = '15px';
            notFoundContainer.style.border = '1px solid #ccc';
            notFoundContainer.style.borderRadius = '8px';
            notFoundContainer.style.backgroundColor = '#f9f9f9';

            const title = document.createElement('h4');
            title.textContent = 'Hráči nenalezeni v žebříčku (nebyli zařazeni do týmů):';
            title.style.color = '#c0392b';
            title.style.marginTop = '0';
            notFoundContainer.appendChild(title);

            const ul = document.createElement('ul');
            ul.style.paddingLeft = '20px';
            
            // Sort not-found players alphabetically for clarity
            notFoundPlayers.sort((a, b) => a.localeCompare(b));
            
            notFoundPlayers.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                li.style.color = '#333';
                ul.appendChild(li);
            });
            
            notFoundContainer.appendChild(ul);
            teamsOutputEl.appendChild(notFoundContainer);
        }
    }


    // --- Execution ---
    
    // 1. Load data as soon as the page loads
    loadLeaderboard();
    
    // 2. Add listener for the button click
    buildButton.addEventListener('click', handleBuildTeams);

});