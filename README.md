# Sweets Merge

Sweets Merge is a physics-based merge puzzle game developed with plain HTML, CSS, and JavaScript as a school project. The player drops sweets into a jar, merges two matching sweets to create the next one, and works toward the Birthday Cake. The game uses no libraries and no build step, so it runs as a static site on GitHub Pages.

**Live demo:** https://francheskalanip.github.io/sweet-merge-game/

## About This Project
This project was built for a class requirement to develop a game or system and host it statically through GitHub. A merge puzzle was chosen because it combines physics, scoring, and progression in a single, complete experience. The core mechanic (dropping and merging matching items) follows the "Suika / watermelon game" style. To make the project original, the physics engine was written from scratch and additional gameplay systems were designed on top of it, such as **Bakery Orders**, **Fever mode**, special sweets, daily missions, and puzzle challenges (listed below).

## Game Preview
The images below were captured on a phone-sized screen. The game is designed for both phones and computers.

<p align="center">
  <img src="screenshots/1-start-screen.png" width="200" alt="Start screen with game modes" />
  <img src="screenshots/2-gameplay.png" width="200" alt="Gameplay with a bakery order" />
  <img src="screenshots/3-collection.png" width="200" alt="Collection book and achievements" />
</p>
<p align="center">
  <img src="screenshots/4-leaderboard.png" width="200" alt="Online leaderboard" />
  <img src="screenshots/5-game-over.png" width="200" alt="Game over with share score card" />
  <img src="screenshots/6-fever-mode.png" width="200" alt="Fever mode" />
</p>
<p align="center">
  <img src="screenshots/7-challenges.png" width="200" alt="Puzzle challenges" />
  <img src="screenshots/8-profile.png" width="200" alt="Profile with daily missions and XP" />
</p>

| Picture | What it shows |
|---|---|
| Start screen | Player name and the game modes (Easy, Normal, Hard, Daily, Time Attack, Zen, Mystery, Challenges) |
| Gameplay | Merging sweets while filling a Bakery Order |
| Collection | Collection book and achievements |
| Leaderboard | Online Top 10 for each level |
| Game over | Final score, XP, and the share score card |
| Fever mode | Double points while the Fever bar is active |
| Challenges | Puzzle challenges with star ratings |
| Profile | Daily missions, XP level, stats, and jar themes |

(The other names on the leaderboard in these pictures are sample names.)

## How to Play
1. On the start screen, type your name and pick a mode, then press **Play**.
2. Move your mouse (or drag your finger) to aim.
3. Click (or lift your finger) to drop the sweet.
4. When two identical sweets touch, they merge into the next one in the chain.
5. If a sweet stays above the dashed line, the game is over right away, so keep the jar from filling up.

**Keyboard:** `←` / `→` to move, `Space` to drop, `P` to pause, `1` `2` `3` for power-ups.

**Merge order:** Sprinkle Ball → Strawberry → Dango → Mochi → Macaron → Cupcake → Donut → Pudding → Cake Slice → Birthday Cake

**Two Birthday Cakes:** there is no bigger sweet, so two Birthday Cakes that touch disappear and give a +100 bonus.

## Game Modes
- **Easy / Normal / Hard:** the sweet mix and the number of orders change with the level. Each level has its own best score and its own online leaderboard.
- **Daily:** everyone gets the same sweets in the same order each day, with a daily leaderboard and a day streak.
- **Time Attack:** 90 seconds and no game over line. Score as much as you can.
- **Zen:** no game over. A relaxed mode where crowded sweets pop away on their own.
- **Mystery:** the next sweet is hidden, so you have to plan ahead.
- **Challenges:** 7 puzzle challenges with the same sweets on every try. Make the goal sweet before you run out of drops. Using fewer drops gives more stars (up to 3).

## Original Features
The following features were designed and implemented to extend the basic merge mechanic:
- **Bakery Orders:** customers post orders above the jar, for example "2x Dango". The player must create that sweet through merging before the timer runs out to earn bonus points. Every second completed order also grants a free power-up. Missed orders simply expire without a penalty.
- **Boss Orders:** occasionally, a larger order appears with a double reward and a free power-up.
- **Fever mode:** each merge fills the Fever bar at the top of the jar. When the bar is full, the player gets 8 seconds of **double points**, and the game-over line is disabled. When Fever ends, any sweets still above the line pop away so the player is not penalized unfairly.
- **Special sweets (rare):** the **Golden Mochi** counts double toward orders and gives bonus points. The **Bomb Candy** does not merge; it explodes after 2 seconds and removes nearby sweets.
- **Random events:** **Sugar Rush** (sweets fall slowly) and **Sweet Rain** (extra small sweets fall) add variety to each game.
- **Daily missions and XP:** 3 new missions every day (for example "Fill 3 orders" or "Reach a x3 combo"). Completing games and missions earns XP and raises the player level.
- **Achievements and titles:** 13 achievements (First Customer, Master Baker, Perfect Day, Fever Pitch, Boom!, Golden Touch, Combo King, Cake Boss, Sweet Tooth, Half Thousand, Boss Slayer, Puzzle Solver, Daily Grind). The player title grows from Apprentice to Grand Master.
- **Jar themes:** Mint Soda, Sunset, Ube Night, and Golden Hour are unlocked by earning achievements.
- **Profile and stats:** games played, play time, best score, best combo, orders filled, bombs used, and more.
- **Share score card:** on the Game Over screen, the player can share or download an image with their score and title.

## Other Features
- Custom circle physics (gravity, stacking, rolling) written from scratch, with no external library
- 10 sweet levels, with a merge-order guide under the board
- Animated faces: sweets blink, look happy after a merge, and look worried near the line
- Combo system: quick merges in a row give a x2 to x5 score multiplier
- Power-ups earned by scoring: Swap (change your sweet), Shake (wiggle the jar), Pop (remove one sweet)
- Collection book: every sweet you make is unlocked in a book, and locked sweets show as silhouettes
- Screen shake, flash, sparkles, floating score text, pause button, and auto-pause when leaving the tab
- A short How to Play tutorial on the first game, and a help button to open it again
- Sound effects and background music made in the browser with the Web Audio API (with a mute button), plus phone vibration
- Works on desktop and phone (touch controls)

## Technologies Used
- HTML, CSS, and JavaScript (no frameworks or libraries)
- HTML Canvas for the game, with a custom physics engine
- Firebase Firestore for the online leaderboard
- LocalStorage for saved scores, missions, achievements, and settings
- GitHub Pages for hosting

## Run Locally
- **Game only:** open `index.html` in any modern browser. The online leaderboard is skipped and the game uses scores saved on your device.
- **With the online leaderboard:** browsers block JavaScript modules on `file://` pages, so serve the folder over http. In VS Code, install the **Live Server** extension, right-click `index.html`, and choose **Open with Live Server**. The GitHub Pages site works without this step.

## Deploy to GitHub Pages
1. Create a new repository on GitHub.
2. Upload every file in this folder (keep `index.html` in the root and keep the `assets/` folder).
3. Go to **Settings → Pages**.
4. Under **Source**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait 1-2 minutes for the site to go live.

File names on GitHub Pages are case-sensitive, so all file names are lowercase (for example `sweet0.png`).

## Online Leaderboard (Firebase)
The online leaderboard uses Firebase Firestore (free Spark plan). The Top 10 of each level is stored in these collections: `scores_easy`, `scores_normal`, `scores_hard`, and one new collection per day for the Daily Challenge (`daily_YYYYMMDD`). Scores are sent automatically when a game ends, using the name from the start screen. Each player has one entry per board (their best score): playing again only updates the entry if the new score is higher. Two players who type the same name share one entry.

1. Create a Firebase project and add a **web app** (the `</>` icon).
2. Put your `firebaseConfig` values in `firebase-config.js`.
3. Create a **Firestore Database** (production mode, location `asia-southeast1`).
4. Open the **Rules** tab, paste the rules below, and click **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // A score entry. createdAt must be the server time.
    function validScore() {
      return request.resource.data.keys().hasOnly(['name', 'score', 'createdAt'])
        && request.resource.data.name is string
        && request.resource.data.name.size() >= 1
        && request.resource.data.name.size() <= 12
        && request.resource.data.score is int
        && request.resource.data.score >= 0
        && request.resource.data.score <= 100000
        && request.resource.data.createdAt == request.time;
    }

    // One entry per player: the document id is the lowercase name.
    function ownId(id) {
      return id == request.resource.data.name.lower();
    }

    // An existing entry can only be replaced by a higher score for the same name.
    function isImprovement() {
      return request.resource.data.name == resource.data.name
        && request.resource.data.score > resource.data.score;
    }

    match /scores_easy/{id} {
      allow read: if true;
      allow create: if validScore() && ownId(id);
      allow update: if validScore() && ownId(id) && isImprovement();
      allow delete: if false;
    }
    match /scores_normal/{id} {
      allow read: if true;
      allow create: if validScore() && ownId(id);
      allow update: if validScore() && ownId(id) && isImprovement();
      allow delete: if false;
    }
    match /scores_hard/{id} {
      allow read: if true;
      allow create: if validScore() && ownId(id);
      allow update: if validScore() && ownId(id) && isImprovement();
      allow delete: if false;
    }

    // Daily Challenge: one collection per day, named daily_YYYYMMDD (for example daily_20261118)
    match /{board}/{id} {
      allow read: if board.matches('daily_20[0-9]{6}');
      allow create: if board.matches('daily_20[0-9]{6}') && validScore() && ownId(id);
      allow update: if board.matches('daily_20[0-9]{6}') && validScore() && ownId(id) && isImprovement();
      allow delete: if false;
    }
  }
}
```

Notes:
- The values in `firebase-config.js` are not secret. The security rules protect the data: anyone can read scores and add a valid score, but nobody can edit or delete scores from the game.
- A static site cannot fully prevent fake scores. The rules only limit names and score size.
- If the leaderboard can't be reached (offline or Firebase down), the game keeps working and shows the best scores saved on the device.
- Names are filtered for a short list of blocked words in `leaderboard.js`. Add more words to `BLOCKED_WORDS` if needed.

## Project Structure
```
index.html          page layout
style.css           styles
game.js             game logic, physics, and screens
leaderboard.js      Firebase Firestore leaderboard (ES module)
firebase-config.js  Firebase web app settings
assets/             sweet0.png ... sweet9.png, plus _blink, _happy, and _worried versions of each
screenshots/        pictures used in this README
```

## Customize
Open `game.js` and edit the settings at the top:
- `SWEETS`: name, radius (`r`), points, and picture file for each level
- `GRAVITY`, `RESTITUTION`, `FRICTION`: how the sweets move and bounce
- `LEVELS`: for each mode, the chance of each small sweet (`weights`), how often power-ups come (`powerEvery`), and the order settings (`orders`)
- `PUZZLES`: the challenge goals and drop limits

To change the art, replace the PNG files in `assets/` with your own (square, transparent background). Keep the same file names. Each sweet has 4 pictures: `sweet3.png`, `sweet3_blink.png`, `sweet3_happy.png`, `sweet3_worried.png` (if a face picture is missing, the normal one is used).

## Credits
- The core idea is inspired by the "Suika / watermelon game" style of merge games. The code, physics, and additional features were developed for this school project.
- The sweet pictures were generated with AI and edited for use in this game.
- Sound effects and music are created in the browser with the Web Audio API.