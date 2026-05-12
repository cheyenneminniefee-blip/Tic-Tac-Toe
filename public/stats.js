document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Fetch the stats from our new backend route
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error("Failed to load stats");

        const data = await response.json();

        // 1. Render Leaderboard
        const leaderboardBody = document.getElementById('leaderboard-body');
        leaderboardBody.innerHTML = ''; // Clear loading text

        if (data.leaderboard.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="4">No games played yet!</td></tr>';
        } else {
            data.leaderboard.forEach((player, index) => {
                const row = `<tr>
                    <td>#${index + 1}</td>
                    <td>${player.name}</td>
                    <td>${player.wins}</td>
                    <td>${player.totalGames}</td>
                </tr>`;
                leaderboardBody.innerHTML += row;
            });
        }

        // 2. Render AI Difficulty Stats
        // Inside stats.js, within the Render AI Difficulty Stats section
        const diffBody = document.getElementById('ai-difficulty-body');
        diffBody.innerHTML = '';
        const diffs = ['easy', 'medium', 'hard', 'ultra']; // <-- ADD 'ultra' HERE

        diffs.forEach(level => {
            const stats = data.aiStats.byDifficulty[level];
            const capitalizedLevel = level.charAt(0).toUpperCase() + level.slice(1);
            diffBody.innerHTML += `<tr>
                <td>${capitalizedLevel}</td>
                <td>${stats.winRate}</td>
                <td>${stats.total}</td>
            </tr>`;
        });

        // 3. Render AI Personality Stats
        const persBody = document.getElementById('ai-personality-body');
        persBody.innerHTML = '';
        const personalities = ['friendly', 'funny', 'trash-talker'];

        personalities.forEach(trait => {
            const stats = data.aiStats.byPersonality[trait];
            const capitalizedTrait = trait.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            persBody.innerHTML += `<tr>
                <td>${capitalizedTrait}</td>
                <td>${stats.winRate}</td>
                <td>${stats.total}</td>
            </tr>`;
        });

    } catch (error) {
        console.error("Error fetching stats:", error);
        document.getElementById('leaderboard-body').innerHTML = '<tr><td colspan="4" style="color: red;">Error loading stats data.</td></tr>';
    }

    // --- 4. Render Global Game Feed ---
    const globalResponse = await fetch('/api/all-games');
    if (globalResponse.ok) {
        const allGames = await globalResponse.json();
        const globalBody = document.getElementById('global-games-body');
        globalBody.innerHTML = ''; // Clear loading text

        if (allGames.length === 0) {
            globalBody.innerHTML = '<tr><td colspan="3">No games played globally yet!</td></tr>';
        } else {
            // Show newest games first
            allGames.reverse().forEach(game => {
                const row = `<tr>
                    <td>${new Date(game.date).toLocaleString()}</td>
                    <td><strong>${game.username}</strong></td>
                    <td>${game.result}</td>
                </tr>`;
                globalBody.innerHTML += row;
            });
        }
    }
});