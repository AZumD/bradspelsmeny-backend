const fetch = require("node-fetch");
const fs = require("fs");

const games = JSON.parse(fs.readFileSync("games.json", "utf8"));

fetch("https://bradspelsmeny-backend.onrender.com/import", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(games),
})
  .then((res) => res.json())
  .then((data) => {
    console.log("✅ Import result:", data);
  })
  .catch((err) => {
    console.error("❌ Failed to import:", err);
  });
