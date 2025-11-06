/**
 * PATRIC Team Builder Script
 * * Verze 3.1 (Optimalizované rozdělení)
 * Používá Serpentine Draft pro základní rozdělení
 * a Hill Climbing algoritmus pro finální optimalizaci.
 */

// Počkáme, až se načte celá HTML struktura
document.addEventListener('DOMContentLoaded', () => {

    // --- Konstanty a globální proměnné ---
    const leaderboardURL = 'leaderboard.csv';
    
    // Výchozí skill pro hráče, kteří nejsou v žebříčku (nováčci, překlepy)
    const DEFAULT_TRUESKILL = 15.0; 

    // Počet iterací pro optimalizační algoritmus
    // (Větší číslo = lepší výsledek, ale delší výpočet)
    const OPTIMIZATION_ITERATIONS = 20000;

    // Zde si uložíme data z CSV: Map('jmeno_lowercase' -> { originalName, rank, skill })
    let leaderboardData = new Map();

    // Odkazy na HTML prvky (abychom je nemuseli hledat stále dokola)
    const listEl = document.getElementById('leaderboard-list');
    const loadingEl = document.getElementById('leaderboard-loading');
    const buildButton = document.getElementById('build-button');
    const playerNamesEl = document.getElementById('player-names');
    const teamCountEl = document.getElementById('team-count');
    const teamsOutputEl = document.getElementById('teams-output');

    
    // --- Hlavní funkce ---

    /**
     * 1. Načte CSV soubor ze serveru
     */
    async function loadLeaderboard() {
        try {
            const response = await fetch(leaderboardURL);
            if (!response.ok) {
                throw new Error(`Chyba při načítání souboru: ${response.statusText}`);
            }
            const csvText = await response.text();
            
            // Zpracujeme text z CSV
            parseCSV(csvText);
            
            // Zobrazíme Top 5 hráčů
            displayLeaderboard();

            // Skryjeme nápis "Načítám..."
            loadingEl.style.display = 'none'; 
        } catch (error) {
            console.error('Chyba při načítání žebříčku:', error);
            loadingEl.textContent = 'Nepodařilo se načíst žebříček.';
            loadingEl.style.color = 'red';
        }
    }

    /**
     * 2. Zpracuje text z CSV a uloží ho do `leaderboardData` Mapy
     */
    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');

        // Krok 1: Získáme hlavičku a najdeme indexy sloupců, které nás zajímají
        const headerLine = lines.shift().trim(); // Vezmeme první řádek (a odstraníme ho z pole)
        const headers = headerLine.split(',').map(h => h.trim());
        
        const nameIndex = headers.indexOf('name');
        const rankIndex = headers.indexOf('rank');
        const skillIndex = headers.indexOf('true_skill');

        // Krok 2: Zkontrolujeme, jestli soubor obsahuje vše, co potřebujeme
        if (nameIndex === -1 || rankIndex === -1 || skillIndex === -1) {
            const errorMsg = "Chyba: CSV soubor neobsahuje požadované sloupce 'name', 'rank' a 'true_skill'.";
            console.error(errorMsg);
            loadingEl.textContent = errorMsg;
            loadingEl.style.color = 'red';
            return; // Zastavíme další zpracování
        }

        // Krok 3: Projdeme zbylé řádky (data) a uložíme je do Mapy
        lines.forEach(line => {
            const parts = line.split(',');
            
            // Zajistíme, že máme dostatek dat na řádku
            if (parts.length > Math.max(nameIndex, rankIndex, skillIndex)) {
                const name = parts[nameIndex].trim();
                const ordinalRank = parseInt(parts[rankIndex], 10);
                const trueSkill = parseFloat(parts[skillIndex]);

                // Uložíme jen platná data
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
     * 3. Zobrazí Top 5 hráčů v HTML seznamu
     * (Seřadí podle `rank`, zobrazí `skill`)
     */
    function displayLeaderboard() {
        // Převedeme hodnoty z Mapy na pole
        const players = [...leaderboardData.values()];

        // Seřadíme podle `rank` (pořadí 1, 2, 3...)
        const sortedPlayers = players.sort((a, b) => a.rank - b.rank);
        
        // Vezmeme prvních 5
        const top5 = sortedPlayers.slice(0, 5);

        listEl.innerHTML = ''; // Vyčistíme starý seznam (pokud tam byl)
        top5.forEach(player => {
            const li = document.createElement('li');
            li.textContent = `${player.originalName} (TrueSkill: ${player.skill.toFixed(2)})`;
            listEl.appendChild(li);
        });
    }

    /**
     * 4. Hlavní funkce pro rozdělení týmů (volá se po kliknutí na tlačítko)
     */
    function handleBuildTeams() {
        // Krok 1: Získáme vstupy od uživatele
        const namesInput = playerNamesEl.value.trim();
        const teamCount = parseInt(teamCountEl.value, 10);

        // Krok 2: Validace vstupů
        if (!namesInput) {
            alert('Zadej prosím jména hráčů.');
            return;
        }
        if (isNaN(teamCount) || teamCount < 2) {
            alert('Počet týmů musí být alespoň 2.');
            return;
        }

        // Krok 3: Zpracujeme jména a najdeme jejich skill
        const attendingPlayers = namesInput.split('\n')
            .map(name => name.trim()) // Odstraníme bílé znaky
            .filter(name => name.length > 0) // Odstraníme prázdné řádky
            .map(name => {
                // Najdeme hráče v žebříčku (bez ohledu na velká/malá písmena)
                const playerData = leaderboardData.get(name.toLowerCase());
                
                if (playerData) {
                    // Hráč nalezen, vracíme jeho jméno a TrueSkill
                    return { name: playerData.originalName, skill: playerData.skill };
                } else {
                    // Hráč nenalezen (nováček/překlep), vracíme jméno a výchozí skill
                    return { name: name, skill: DEFAULT_TRUESKILL };
                }
            });
        
        // Krok 4: Další validace
        if (attendingPlayers.length < teamCount) {
             alert('Máš méně hráčů než požadovaný počet týmů.');
            return;
        }

        // Krok 5: Spustíme samotný algoritmus pro rozdělení
        const teams = balanceTeams(attendingPlayers, teamCount);
        
        // Krok 6: Zobrazíme výsledek
        displayTeams(teams);
    }

    // -----------------------------------------------------------------
    // --- 5. JÁDRO ALGORITMU: Optimalizované rozdělení týmů ---
    // (Nahrazuje původní funkci `balanceTeams`)
    // -----------------------------------------------------------------

    /**
     * Hlavní funkce: Seřadí, rozdělí a optimalizuje týmy.
     */
    function balanceTeams(players, teamCount) {
        // Krok 5.1: Seřadíme hráče od nejlepšího (nejvyšší skill) po nejhoršího
        players.sort((a, b) => b.skill - a.skill);

        // Krok 5.2: Vytvoříme prázdné týmy
        let teams = [];
        for (let i = 0; i < teamCount; i++) {
            teams.push({
                name: `Tým ${i + 1}`,
                // DŮLEŽITÉ: Ukládáme celý objekt hráče, nejen jméno!
                players: [], 
                totalSkill: 0
            });
        }

        // Krok 5.3: Provedeme základní rozdělení ("Hadicový výběr")
        seedTeams_Serpentine(players, teams);

        // Krok 5.4: Spustíme optimalizaci prohozením ("Hill Climbing")
        optimizeTeams_HillClimbing(teams, OPTIMIZATION_ITERATIONS);

        return teams;
    }

    /**
     * Vytvoří počáteční rozdělení pomocí "Hadicového výběru" (Serpentine Draft).
     * Modifikuje pole `teams` přímo (in-place).
     */
    function seedTeams_Serpentine(sortedPlayers, teams) {
        let teamIndex = 0;
        let direction = 1; // 1 = dopředu (T1 -> T2 -> T3), -1 = dozadu (T3 -> T2 -> T1)

        for (const player of sortedPlayers) {
            // Přidáme hráče (celý objekt) do aktuálního týmu
            teams[teamIndex].players.push(player);
            teams[teamIndex].totalSkill += player.skill;

            // Posuneme se na další tým
            teamIndex += direction;

            // Kontrola hranic (otočení směru na konci/začátku)
            if (teamIndex >= teams.length) {
                direction = -1; // Otočíme směr
                teamIndex = teams.length - 1; // Vrátíme se na poslední tým
            } else if (teamIndex < 0) {
                direction = 1; // Otočíme směr
                teamIndex = 0; // Vrátíme se na první tým
            }
        }
    }

    /**
     * Iterativně vylepšuje rozdělení týmů prohozením hráčů,
     * aby se minimalizovaly rozdíly průměrných skillů.
     */
    function optimizeTeams_HillClimbing(teams, iterations) {
        let currentCost = calculateCost(teams); // Jak "špatné" je rozdělení

        for (let i = 0; i < iterations; i++) {
            if (currentCost === 0) {
                break; // Už je to dokonalé
            }

            // 1. Vybereme náhodně dva RŮZNÉ týmy
            const teamIndex1 = Math.floor(Math.random() * teams.length);
            let teamIndex2 = Math.floor(Math.random() * teams.length);
            if (teamIndex1 === teamIndex2) {
                // Zajistíme, že jsou indexy různé
                teamIndex2 = (teamIndex1 + 1) % teams.length;
            }

            const team1 = teams[teamIndex1];
            const team2 = teams[teamIndex2];

            // 2. Vybereme náhodně hráče z každého týmu
            // (Přeskočíme, pokud je některý tým prázdný, což by se nemělo stát)
            if (team1.players.length === 0 || team2.players.length === 0) {
                continue;
            }

            const playerIndex1 = Math.floor(Math.random() * team1.players.length);
            const playerIndex2 = Math.floor(Math.random() * team2.players.length);

            const player1 = team1.players[playerIndex1];
            const player2 = team2.players[playerIndex2];

            // 3. Vypočítáme "cenu" po hypotetickém prohození
            const newCost = calculateHypotheticalCost(teams, teamIndex1, teamIndex2, player1, player2);

            // 4. Rozhodnutí: Pokud je nové rozdělení lepší, provedeme prohození
            if (newCost < currentCost) {
                // Provedeme skutečné prohození
                team1.players[playerIndex1] = player2;
                team2.players[playerIndex2] = player1;
                
                // Aktualizujeme celkové skilly týmů
                team1.totalSkill = team1.totalSkill - player1.skill + player2.skill;
                team2.totalSkill = team2.totalSkill - player2.skill + player1.skill;
                
                // Uložíme si novou, lepší cenu
                currentCost = newCost;
            }
        }
    }


    // --- Pomocné funkce pro optimalizaci ---

    /**
     * Vypočítá "cenu" (směrodatnou odchylku) pro *hypotetický* stav po prohození.
     * Je to rychlejší než klonovat celé pole týmů.
     */
    function calculateHypotheticalCost(teams, t1_idx, t2_idx, p1, p2) {
        const team1 = teams[t1_idx];
        const team2 = teams[t2_idx];

        // Získáme pole aktuálních průměrů
        const averages = teams.map(getAverageSkill);

        // Vypočítáme nové průměry JEN pro dva změněné týmy
        // (Počet hráčů se nemění, jen se mění totalSkill)
        const newAvg1 = (team1.totalSkill - p1.skill + p2.skill) / team1.players.length;
        const newAvg2 = (team2.totalSkill - p2.skill + p1.skill) / team2.players.length;

        // Nahradíme staré průměry novými
        averages[t1_idx] = newAvg1;
        averages[t2_idx] = newAvg2;

        // Vypočítáme směrodatnou odchylku z tohoto nového pole průměrů
        return calculateStdDev(averages);
    }

    /**
     * Vypočítá "Cenu" (Cost) - jak moc jsou týmy nevyvážené.
     * Používáme směrodatnou odchylku průměrů. Cíl je dostat ji k 0.
     */
    function calculateCost(teams) {
        const averages = teams.map(getAverageSkill);
        return calculateStdDev(averages);
    }

    /**
     * Pomocná funkce pro výpočet směrodatné odchylky.
     */
    function calculateStdDev(numbers) {
        if (numbers.length === 0) return 0;
        
        // 1. Průměr
        const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
        
        // 2. Rozptyl (Variance)
        const variance = numbers.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numbers.length;
        
        // 3. Směrodatná odchylka
        return Math.sqrt(variance);
    }

    /**
     * Pomocná funkce pro získání průměrného skillu týmu.
     */
    function getAverageSkill(team) {
        return (team.players.length > 0) ? (team.totalSkill / team.players.length) : 0;
    }


    // -----------------------------------------------------------------
    // --- 6. Zobrazení výsledků ---
    // (Upraveno, aby četlo objekty hráčů, ne jen jména)
    // -----------------------------------------------------------------

    /**
     * 6. Zobrazí vygenerované týmy na stránce
     * (Včetně průměrného skillu)
     */
    function displayTeams(teams) {
        teamsOutputEl.innerHTML = ''; // Vyčistíme předchozí výsledky
        
        const container = document.createElement('div');
        container.className = 'teams-container';

        // Pro jistotu seřadíme týmy podle jména (Tým 1, Tým 2...), aby byly vždy ve stejném pořadí
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
                li.textContent = "(Prázdný tým)";
                li.style.fontStyle = "italic";
                ul.appendChild(li);
            } else {
                // *** ZMĚNA ZDE ***
                // Seřadíme hráče v týmu podle skillu pro lepší přehlednost
                team.players.sort((a, b) => b.skill - a.skill);
                
                team.players.forEach(playerObj => {
                    const li = document.createElement('li');
                    // Zobrazíme jméno z objektu hráče
                    li.textContent = `${playerObj.name} (${playerObj.skill.toFixed(2)})`; 
                    ul.appendChild(li);
                });
            }
            card.appendChild(ul);
            
            // *** ZMĚNA ZDE ***
            // Použijeme pomocnou funkci
            const avgSkill = getAverageSkill(team);

            const rankInfo = document.createElement('p');
            rankInfo.className = 'total-rank';
            rankInfo.textContent = `Průměrný TrueSkill: ${avgSkill.toFixed(2)}`;
            card.appendChild(rankInfo);

            container.appendChild(card);
        });
        
        // Přidáme i celkovou statistiku
        const finalCost = calculateCost(teams);
        const statsEl = document.createElement('p');
        statsEl.style.textAlign = 'center';
        statsEl.style.width = '100%';
        statsEl.style.marginTop = '15px';
        statsEl.innerHTML = `Hotovo. Rozdíly optimalizovány po ${OPTIMIZATION_ITERATIONS} pokusech.<br>
                             <b>Finální "Cena" (Směrodatná odchylka průměrů): ${finalCost.toFixed(4)}</b> 
                             (Cíl je 0.0)`;
        teamsOutputEl.prepend(statsEl); // Přidáme ji na začátek

        teamsOutputEl.appendChild(container);
    }


    // --- Spuštění ---
    
    // 1. Načteme data hned po načtení stránky
    loadLeaderboard();
    
    // 2. Přidáme "posluchače" na kliknutí tlačítka
    buildButton.addEventListener('click', handleBuildTeams);

});