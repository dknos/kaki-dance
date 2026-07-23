const MOVES = Object.freeze([
  ["BASIC ROCK", "Weight through the hips"],
  ["GO DOWN", "Controlled reach and compression"],
  ["6-STEP", "Circling support phases"],
  ["WINDMILL", "Shoulder roll and leg scissor"],
  ["BABY FREEZE", "Two-hand support triangle"],
  ["CLEAN GET-UP", "Push, place and rise"],
]);

for (const character of ["kitty", "soder"]) {
  const host = document.getElementById(`${character}-comparisons`);
  MOVES.forEach(([name, note], index) => {
    const article = document.createElement("article");
    article.className = "comparison-card";
    article.innerHTML = `
      <header>
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div><strong>${name}</strong><small>${note}</small></div>
      </header>
      <div class="frame-pair">
        <figure>
          <img src="./docs/images/hero-rescue/before/${character}-${index + 1}.png"
            width="384" height="216" alt="${character} ${name} before hero rig rescue">
          <figcaption>BEFORE · LIVE BASELINE</figcaption>
        </figure>
        <figure>
          <img src="./docs/images/hero-rescue/after/${character}-${index + 1}.png"
            width="384" height="216" alt="${character} ${name} after hero rig rescue">
          <figcaption>AFTER · SHARED BIPED</figcaption>
        </figure>
      </div>
    `;
    host.append(article);
  });
}

const silhouetteHost = document.getElementById("silhouette-grid");
for (const [name] of MOVES) {
  const moveId = {
    "BASIC ROCK": "basicRock",
    "GO DOWN": "basicGoDown",
    "6-STEP": "sixStep",
    "WINDMILL": "windmill",
    "BABY FREEZE": "babyFreeze",
    "CLEAN GET-UP": "cleanGetUp",
  }[name];
  const figure = document.createElement("figure");
  figure.innerHTML = `
    <img src="./docs/images/hero-rescue/after/silhouette-${moveId}.png"
      width="384" height="216" alt="KittyKaki and Soder ${name} silhouettes">
    <figcaption>${name}</figcaption>
  `;
  silhouetteHost.append(figure);
}
