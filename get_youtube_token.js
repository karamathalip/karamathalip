// setup/get_youtube_token.js
// One-time script to generate your YouTube OAuth refresh token.
// Run: node setup/get_youtube_token.js
// Then paste the token into your .env file.
import "dotenv/config";
import { google } from "googleapis";
import readline from "readline";

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob"
);

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent",
});

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("  YouTube OAuth Setup");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
console.log("1. Open this URL in your browser:\n");
console.log(`   ${authUrl}\n`);
console.log("2. Sign in and click Allow.");
console.log("3. Copy the authorisation code shown and paste it below.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Paste authorisation code here: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oauth2Client.getToken(code.trim());
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  ✅ SUCCESS! Add this to your .env file:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    console.log("Then run:  node pipeline/run_daily_batch.js\n");
  } catch (err) {
    console.error("\n❌ Error getting token:", err.message);
    process.exit(1);
  }
});
