# PATRIC
### Player Assessment via TrueSkill: Rating of Impact & Consistency
Application of the TrueSkill Through Time algorithm to Ultimate Frisbee practices.

---
#### Overview 
PATRIC estimates individual player skill from weekly practice games of Ultimate Frisbee using Microsoft's TrueSkill algorithm in its TrueSkill Through Time (TTT) variant. Unlike the Elo ranking algorithm, TrueSkill supports team-based games of any team size and takes into account uncertainty about a player's skill.

##### TrueSkill

Each player's performance is modelled as a Gaussian distribution with mean μ (skill) and standard deviation σ (uncertainty). The TrueSkill value is a conservative rating of a player's skill calculated typically as μ − 3σ, meaning a player's true skill is very likely above that value (see the [3 sigma rule](https://en.wikipedia.org/wiki/68%E2%80%9395%E2%80%9399.7_rule)).

A team performance is a sum of the player's performances (a sum of Gaussian distributions also is one). Outcomes of games move players' μ up or down, larger upsets move it more. Playing games also gradually reduces the uncertainty σ. New players start with high uncertainty and calibrate as they play games, which by itself improves their TrueSkill rating.

##### TrueSkill Through Time (TTT)
The TrueSkill Through Time variant focuses on propagating the results through time via a Baysian Network. 
TODO: why is it better.

[See the TTT docs for more information about the Through Time variant.](https://trueskillthroughtime.readthedocs.io/en/latest/)

Applying the TTT algorithm for Ultimate Frisbee was inspired by Jake Smart, who has done this for the College team Brownian Motion.

#### Usage
- Store the game results in the csv file ```games_db.csv``` (in the `ranking_files` folder). The expected dataframe has 4 columns: ```date,draw,winning_team,losing_team```. If the game ended in a draw, let the ```draw``` column be 1, otherwise, let it be zero. If the game was not a draw, the winning team comes first (in the `winning_team` column), the losing team second (in the ```losing_team``` column). Teams are stored in a list and players are separated via the ```|``` sign, e.g.: ```[Freny|Jezek|MP|Karlos|B|FilaH]```. An examplary column thus looks like this: 

```csv
2025-10-29,0,[Freny|MP|B|FilaH],[Jazz|Dejv|VojtaR|Vilda]
```

- Run the ```main.py``` module, which will run the TTT algorithm from the stored games, will compute the player rankings and dump them into the ```leaderboard.csv``` file (in the `ranking_files` folder). If you want to use other input and output files than the default ones, pass them as params ```games_file``` and ```leaderoard_file``` to main. Only players passing the attendence threshold (the default is three practices, configure in the `dump_leaderboard` function) are eligible to appear in the leaderboard. Only the top 10 players will appear in the public leaderboard, the rest is in a (private by gitignore) ranking file (in the `ranking_files` folder).
- Optionally, use the `allowed_names_file` param to specify a file that holds all allowed player names, and if there is an unrecognized player name loaded when computing the ratings, an error will be raised (as a safeguard against typos).


#### Requirements
Install the following Python packages:
- numpy
- pandas
- matplotlib
- seaborn
- trueskillthroughtime

via 

```bash
pip install numpy pandas matplotlib seaborn trueskillthroughtime
```
or, once you cloned the repo,

```bash
pip install -r requirements.txt
```


#### Future Ideas
- add a flag for each game: mini or standard or a special game (e.g. with a shotclock, limited number of passes, etc.). Then, create a filter that filters out only selected game modes.
- discuss p_draw
- discuss the beta param and the dynamic tau param
- plotting: TODO
- player curves: TODO
- team creator: TODO

#### Literature
- Microsoft's Article about TrueSkill: https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/
- A more informal primer: https://www.moserware.com/2010/03/computing-your-skill.html
- Jake Smart about using TrueSkill Through Time for Ultimate: https://creators.spotify.com/pod/profile/pod-practice/episodes/Jake-Smart--Brown-BMo--Boston-DiG--Boston-Glory--Ep-78-e2tv5dm, minutes 0:42 - 0:55.
- TrueSkill original paper: https://www.microsoft.com/en-us/research/wp-content/uploads/2006/01/TR-2006-80.pdf
- TrueSkill Through Time paper: https://www.jstatsoft.org/article/view/v112i06

