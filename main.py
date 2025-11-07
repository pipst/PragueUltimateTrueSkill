import csv
import os
import pandas as pd
from trueskillthroughtime import *
import random
import matplotlib.pyplot as plt
import numpy as np
import seaborn as sns

import PragueLionPlayer

DEFAULT_GAMES_DB_PATH = "ranking_files/games_db.csv"
DEFAULT_LEADERBOARD_FILE = "ranking_files/leaderboard.csv"
RANKING_FILE = "ranking_files/private_ranking.csv"

# TrueSkill default values
MU = 25
SIGMA = (25/3)
K = 3 # TrueSkill is computed as Mu - K*Sigma

def parse_team(team_string: str) -> list[str]:
    """Parse a team string into a list of player names as strings.

    The input format is: "[Alice|Bob|Charlie]", which would return: ["Alice", "Bob", "Charlie"].
    """
    if not team_string:
        return []

    stripped = team_string.strip()

    if stripped.startswith("[") and stripped.endswith("]"):
        cleared = stripped[1:-1].strip()

    if not cleared: # empty team
        return []

    # Split on | and trim whitespace from each name
    names = [part.strip() for part in cleared.split("|")]
    # Filter out accidental empty strings, return the names
    return [n for n in names if n]



def load_all_player_names(games_file: str = DEFAULT_GAMES_DB_PATH, allowed_names_file: str | None = None) -> list[str]:
    """Load all unique player names from the games database CSV file.
    The CSV is expected to have columns 'winning_team' and 'losing_team', and players do not appear elsewhere.
    
    If the allowed names file is specified, the loaded names will be checked against this file, which holds one name per line.
    If a name that is not found in this file is loaded, an error will be raised.
    The aim is simply to avoid making typos when entering the games.
    """
    df = pd.read_csv(games_file)

    player_names: set[str] = set()

    for team_col in ("winning_team", "losing_team"):
        for team_string in df[team_col]:
            for name in parse_team(team_string):
                player_names.add(name)

    if allowed_names_file:
        with open(allowed_names_file, "r") as f:
            allowed_names: set[str] = set(line.strip() for line in f)
        
        unknown_players = player_names - allowed_names
        if unknown_players:
            raise ValueError(f"Unknown players found in games file: {', '.join(unknown_players)}. Check for typos.")


    # Return a sorted list for reproducibility
    return sorted(player_names)

def calculate_players_attendance(games_df: pd.DataFrame) -> dict[str, dict[str, int]]:
    """Calculates the total number of games played and unique practice days attended for every player in the games DataFrame.
    
    return:
        A dictionary mapping player names to their statistics.
        Example:    
            {   'Alice': {'practices': 10, 'games': 25},
                'Bob': {'practices': 12, 'games': 30}
            }
    """
    winners_series = games_df['winning_team'].apply(parse_team)
    losers_series = games_df['losing_team'].apply(parse_team)
    all_players_series = winners_series + losers_series
    
    player_date_df = pd.DataFrame({
        'practice_date': pd.to_datetime(games_df['date']).dt.date,
        'players': all_players_series
    })
    
    exploded_df = player_date_df.explode('players')
    
    game_counts = exploded_df.groupby('players').size().rename('games')

    unique_attendances = exploded_df.drop_duplicates(subset=['practice_date', 'players'])
    practice_counts = unique_attendances.groupby('players').size().rename('practices')
    
    combined_stats_df = pd.concat([practice_counts, game_counts], axis=1)
    
    return combined_stats_df.to_dict('index')


def parse_game_row(row: dict) -> tuple[list[list[str]], list[int]]:
    """Parse a single row from the games database into TrueSkill Through Time's composition format.

    TTT History accepts a composition list where
    each element is a list of two or more teams, and the order implies
    the result: the first team beat the later team(s).

    Along with the teams, we check if a draw occured and return the appropriate results list.
    If the game ended in a draw, we return [0, 0], otherwise [1, 0] (signifying a win for the first team).

    return:
        [ winning_team_list, losing_team_list ], results_list

    """
    draw_flag: int = row["draw"]
    results = [0, 0] if draw_flag else [1, 0]
    winning: list[str] = parse_team(row["winning_team"])
    losing: list[str] = parse_team(row["losing_team"])
    return [winning, losing], results


def get_players_ratings(history: History, player_names: list) -> dict[str, tuple[float, float]]:
    """Fetch the final rating of players from the game history, consisting of mean and variance.
    The ratings are returned in a dict keyed by the player names."""
    history.convergence() # calculate final ratings by TrueSkill Through Time
    # TODO: check if default params for the method above should be adjusted
    ratings = dict()
    for player_name in player_names:
        player_curve = history.learning_curves()[player_name]
        final_rating = player_curve[-1][1] # get the last Gaussian object corresponding to the player's final rating
        ratings[player_name] = (final_rating.mu, final_rating.sigma) # get the mean and std deviation

    return ratings


def initialize_players_and_fetch_their_ratings_and_attendance(player_names, games_df) -> list[PragueLionPlayer]:
    """Read the game data from the source file, initialize players as PragueLionPlayer objects,
    and fetch their ratings and attendance count."""
    collections = []
    results = []
    
    for _, row in games_df.iterrows():
        game, result = parse_game_row(row)
        collections.append(game)
        results.append(result)
    game_history = History(composition=collections, results=results, p_draw=(1/6), mu=MU, sigma=SIGMA)
    # It is not clear how to set the parameter p_draw.
    # A larger p_draw will mean less information is gained from a draw, as it is less rare, but more information is gained from a win.
    # For now, we opt for a value of 1/6 computed from the seen data. With more games play, we will update this.
    
    player_ratings: dict[str, tuple[float, float]] = get_players_ratings(game_history, player_names)

    attendance = calculate_players_attendance(games_df)
    
    prague_lion_players: list[PragueLionPlayer] = []

    for name in player_names:
        mu, sigma = player_ratings[name]
        current_learning_curve = game_history.learning_curves()[name]
        prague_lion_player = PragueLionPlayer.PragueLionPlayer(name, current_learning_curve, mu, sigma,attendance[name]['practices'],attendance[name]['games'])
        prague_lion_players.append(prague_lion_player)

    return prague_lion_players


def dump_leaderboard_and_rankings(prague_lion_players: list[PragueLionPlayer], leaderboard_file: str, ranking_file: str, leaderboards_practice_threshold: int = 3, leaderboards_game_threshold: int = 8) -> None:
    """
    Dump the players in TrueSkill order to csv files - the leaderboard holds top 10 players with enough data, the ranking holds all players.
    The leaderboards_practice_threshold specifies how many practices one has to attend to get into the leaderboad (rankings are computed nevertheless). The default is two.
    Columns: name, rank, true_skill, mu, sigma, game, practices
    """
    # Sort: by true_skill desc, then by name asc for stable ordering
    players_sorted = sorted(
        prague_lion_players,
        key=lambda p: (-p.true_skill, p.name.lower())
    )

    # only dump those players with at least 3 practices and 8 games
    players_filtered = [player for player in players_sorted if player.number_of_practices >= leaderboards_practice_threshold and player.number_of_games >= leaderboards_game_threshold] 
    # take top 10:
    top_10 = players_filtered[:10]

    # Write CSV - the top 10
    with open(leaderboard_file, "w", encoding="utf-8", newline="") as f:
        f.write("name,rank,true_skill,mu,sigma,practices,games\n")
        for idx, player in enumerate(top_10, start=1):
            f.write(f"{player.name},{idx},{player.true_skill:.6f},{player.mu:.6f},{player.sigma:.6f},{player.number_of_practices},{player.number_of_games}\n")

    # Now write the rankings - that is, all players' rankings
    with open(ranking_file, "w", encoding="utf-8", newline="") as f:
        f.write("name,rank,true_skill,mu,sigma,practices,games\n")
        for idx, player in enumerate(players_sorted, start=1):
            f.write(f"{player.name},{idx},{player.true_skill:.6f},{player.mu:.6f},{player.sigma:.6f},{player.number_of_practices},{player.number_of_games}\n")



def main(games_file: str = DEFAULT_GAMES_DB_PATH, leaderboard_file: str = DEFAULT_LEADERBOARD_FILE, ranking_file = RANKING_FILE, allowed_names_path: str|None = None) -> None:
    """1. Load all player names from the games database. If the database is not specified, use the default 'games_db.csv' path. Optionally, allow only players specified in a separate file.
       2. Read the games csv from the same file as in the previous step.
       3. Compute the player ratings from the game history. Store them in PragueLionPlayer objects.
       4. Dump the leaderboard to a CSV file. If not specified, dump into the default 'leaderboard.csv' path.
       5. Dump all the rankings to a (private by gitignore) file. If not specified, dump into the default 'private_ranking.csv' path.
    """
    player_names = load_all_player_names(games_file, allowed_names_path)

    # Load the games dataframe
    games_df = pd.read_csv(games_file)
    
    prague_lion_players_with_ratings = initialize_players_and_fetch_their_ratings_and_attendance(player_names, games_df)
    dump_leaderboard_and_rankings(prague_lion_players_with_ratings, leaderboard_file, ranking_file)


if __name__ == "__main__":
    main(allowed_names_path="ranking_files/allowed_player_names.txt")

