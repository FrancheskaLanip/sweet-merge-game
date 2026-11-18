# 🍰 Sweets Merge

A cute physics merge game made with plain HTML, CSS, and JavaScript. Drop sweets into the jar, merge two matching ones to make the next sweet, and try to bake the Birthday Cake. No libraries and no build step, so it runs as a static site on GitHub Pages.

**Live demo:** https://YOUR-USERNAME.github.io/YOUR-REPO/

## How to Play
0. On the start screen, type your name and pick a level (**Easy**, **Normal**, or **Hard**), then press **Start Game**.
1. Move your mouse (or drag your finger) to aim.
2. Click (or release your finger) to drop the sweet.
3. When two identical sweets touch, they merge into the next one in the chain.
4. Don't let the pile stay above the dashed line, or the game is over.

**Keyboard:** `←` / `→` to move, `Space` to drop.

**Levels:**
- **Easy**: the pile may stay above the line for 3 seconds, and mostly small sweets drop.
- **Normal**: 2 seconds, the classic mix.
- **Hard**: only 1.2 seconds, and bigger sweets drop more often.

Each level has its own best score and its own leaderboard.

**Two Birthday Cakes:** there is no bigger sweet, so two Birthday Cakes that touch disappear and give a +100 bonus.

**Merge order:** Sprinkle Ball → Strawberry → Dango → Mochi → Macaron → Cupcake → Donut → Pudding → Cake Slice → Birthday Cake

## Features
- Custom circle physics (gravity, stacking, friction), no external library
- 10 sweet levels with a merge-order guide under the board
- Start screen with a player name and 3 difficulty levels, each with its own leaderboard
- Score, best score per level (saved in the browser), and a "next sweet" preview
- Animated faces: sweets blink, look happy after a merge, and look worried near the line
- Combo system: quick merges in a row give a x2 to x5 score multiplier
- Screen shake and flash on big merges, a pause button (or press `P`), and auto-pause when you leave the tab
- Daily Challenge: everyone gets the same sweets in the same order each day (the day is counted in UTC), with its own daily leaderboard and a day streak
- Power-ups earned by scoring (every 80 / 100 / 130 points on Easy / Normal / Hard): Swap (change your sweet), Shake (wiggle the jar), Pop (remove one sweet). Keys `1`, `2`, `3`
- Collection book: every sweet you make is unlocked in a book (saved on your device); locked sweets show as silhouettes
- A short How to play tutorial on the first game, and a help button to open it again
- Pop animation, sparkles, floating score text, and synthesized sound effects (mute button included)
- Works on desktop and phone (touch controls)
- If a picture is missing, a cute placeholder face is drawn instead

## Run Locally
- **Game only:** open `index.html` in any modern browser. No install needed. The online leaderboard is skipped and the game uses scores saved on your device.
- **With the online leaderboard:** browsers block JavaScript modules on `file://` pages, so serve the folder over http. In VS Code, install the **Live Server** extension, right-click `index.html`, and choose **Open with Live Server**. The deployed GitHub Pages site works without this step.

## Deploy to GitHub Pages
1. Create a new repository on GitHub.
2. Upload every file in this folder (keep `index.html` in the root and keep the `assets/` folder).
3. Go to **Settings → Pages**.
4. Under **Source**, choose **Deploy from a branch**, select `main` and `/ (root)`, then Save.
5. Wait 1-2 minutes. Your game will be live at the URL above.

File names on GitHub Pages are case-sensitive, so keep them lowercase (for example `sweet0.png`).

## Online Leaderboard (Firebase)
The Top 10 of each level is stored in Firebase Firestore (free Spark plan), in collections: `scores_easy`, `scores_normal`, `scores_hard`, and one new collection per day for the Daily Challenge (`daily_YYYYMMDD`). Scores are sent automatically when a game ends, using the name from the start screen. Each player has one entry per board (their best score): playing again only updates the entry if the new score is higher. Two players who type the same name share one entry.

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
game.js             game logic, physics, and leaderboard screens
leaderboard.js      Firebase Firestore leaderboard (ES module)
firebase-config.js  your Firebase web app settings
assets/             sweet0.png ... sweet9.png, plus _blink, _happy, and _worried versions of each
```

## Customize
Open `game.js` and edit the `CONFIG` section at the top:
- `SWEETS`: name, radius (`r`), points, and picture file for each level
- `GRAVITY`, `RESTITUTION`, `FRICTION`: how the sweets move and bounce
- `LEVELS`: for each difficulty, how long the pile may stay above the line (`gameOverTime`) and the chance of each small sweet (`weights`)

To change the art, replace the PNG files in `assets/` with your own (square, transparent background, any size). Keep the same file names. Each sweet needs 4 pictures: `sweet3.png`, `sweet3_blink.png`, `sweet3_happy.png`, `sweet3_worried.png` (if a face picture is missing, the normal one is used).

## Credits
- Game code written for a school project.
- Sweet pictures were generated with AI and edited for use in this game. Replace them with your own drawings if your course requires original art.
- Sound effects are created in the browser with the Web Audio API.