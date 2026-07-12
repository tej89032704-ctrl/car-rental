const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
});

doc.pipe(fs.createWriteStream(path.join(__dirname, "git-collaboration-guide.pdf")));

const primary = "#1a56db";
const secondary = "#374151";
const codeBg = "#f3f4f6";

function title(text) {
  doc.font("Helvetica-Bold").fontSize(26).fillColor(primary).text(text, { align: "center" });
  doc.moveDown(0.3);
}

function section(text) {
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(primary).text(text);
  doc.moveDown(0.2);
  doc.moveTo(60, doc.y).lineTo(545, doc.y).strokeColor(primary).stroke();
  doc.moveDown(0.5);
}

function step(num, text) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(secondary).text(`Step ${num}: ${text}`);
  doc.moveDown(0.2);
}

function body(text) {
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(text, { align: "justify" });
  doc.moveDown(0.3);
}

function code(text) {
  const lines = text.split("\n");
  const boxTop = doc.y;
  let boxBottom = boxTop;
  doc.font("Courier").fontSize(9).fillColor("#1f2937");

  const x = 70;
  const padding = 8;
  let lineHeight = 14;
  let currentY = boxTop + padding;

  for (const line of lines) {
    doc.text(line, x + padding, currentY, { width: 460, lineBreak: false });
    currentY += lineHeight;
  }
  boxBottom = currentY + padding;

  doc.rect(x, boxTop, 480, boxBottom - boxTop).strokeColor("#d1d5db").stroke();
  doc.fillColor("#f9fafb").rect(x + 0.5, boxTop + 0.5, 479, boxBottom - boxTop - 1).fill();
  doc.fillColor("#1f2937");
  currentY = boxTop + padding;
  doc.font("Courier").fontSize(9);
  for (const line of lines) {
    doc.text(line, x + padding, currentY, { width: 460, lineBreak: false });
    currentY += lineHeight;
  }

  doc.y = currentY + 10;
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10);
}

function note(text) {
  doc.moveDown(0.2);
  doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6b7280").text(`  ${text}`);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10);
}

function tip(text) {
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#059669").text(`  TIP: ${text}`);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(secondary);
}

// ── Title Page ──
doc.moveDown(4);
title("Git Collaboration Guide");
doc.font("Helvetica").fontSize(14).fillColor(secondary).text("How 4 People Push Code to the Same Project", { align: "center" });
doc.moveDown(0.5);
doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Car Rental App – Team Workflow", { align: "center" });
doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, { align: "center" });

doc.addPage();

// ── Overview ──
section("Overview");
body("Each person on your team (you + 3 friends) will have their own copy of the code. Everyone works on different features using branches. Changes are reviewed and merged together on GitHub. No one overwrites anyone else's work.");
body(`Person 1 (You): tej89032704-ctrl`);
body(`Person 2: Friend A`);
body(`Person 3: Friend B`);
body(`Person 4: Friend C`);

doc.addPage();

// ── Section 1: First Time Setup ──
section("PHASE 1: First Time Setup (Do Once)");

step("1.1", "One person creates the GitHub repo (already done)");
body("You already created the repo at github.com/tej89032704-ctrl/car-rental and pushed the initial code. Now your 3 friends need to get their own copy.");

step("1.2", "Friends clone the repo");
body("Each friend opens terminal and runs:");
code(`git clone https://github.com/tej89032704-ctrl/car-rental.git
cd car-rental`);
note("This downloads the entire project to their computer. They can see all files and folders.");

step("1.3", "Verify the remote is set");
body("Check that your local repo is linked to GitHub:");
code(`git remote -v`);
body("You should see:");
doc.moveDown(0.1);
code(`origin  https://github.com/tej89032704-ctrl/car-rental.git (fetch)
origin  https://github.com/tej89032704-ctrl/car-rental.git (push)`);

doc.addPage();

// ── Section 2: Daily Workflow ──
section("PHASE 2: Daily Workflow (Every Time You Code)");

step("2.1", "Always pull latest code first");
body("Before starting any work, get the latest code from GitHub:");
code(`git pull origin main`);
tip("This ensures you're not working on an old version. Always do this before coding.");

step("2.2", "Create a new branch for your feature");
body("Never work directly on main. Create a branch named after what you're building:");
code(`git checkout -b feature/car-listing`);
body("Branch naming convention:");
doc.moveDown(0.1);
doc.font("Courier").fontSize(9).fillColor("#1f2937");
doc.text("  feature/car-listing    (adding a new feature)", { indent: 10 });
doc.text("  fix/search-bug        (fixing a bug)", { indent: 10 });
doc.text("  ui/homepage           (UI improvement)", { indent: 10 });
doc.moveDown(0.3);
doc.font("Helvetica").fontSize(10).fillColor(secondary).text("Each person works on their OWN branch. You can have feature/booking, feature/auth, etc. all at the same time.");

doc.addPage();

step("2.3", "Work on your code");
body("Make changes: edit files, create new files, delete old ones. You are working in complete isolation on your branch. Your changes won't affect anyone else.");

step("2.4", "Check what you changed");
code(`git status`);
body("Shows which files were modified, added, or deleted. Review before committing.");

step("2.5", "Stage your changes");
body("Add all changed files to the staging area:");
code(`git add .`);
note("The dot . means 'add everything'. Or add specific files: git add src/App.jsx");

step("2.6", "Commit your changes");
body("Take a snapshot of your work with a message describing what you did:");
code(`git commit -m "Add car listing page with search and filter"`);
tip("Write clear messages. Your friends should understand what changed without reading code.");

doc.addPage();

step("2.7", "Pull latest main again (safety check)");
body("Before pushing, check if anyone merged new code since you started:");
code(`git checkout main
git pull origin main
git checkout feature/car-listing
git merge main`);
tip("This catches any conflicts early. Fix conflicts locally, not on GitHub.");

step("2.8", "Push your branch to GitHub");
body("Upload your branch so everyone can see it:");
code(`git push origin feature/car-listing`);
body("Now your branch is on GitHub. Your friends can see it under the repo's Branches tab.");

step("2.9", "Create a Pull Request (PR) on GitHub");
body("A PR asks to merge your branch into main. Let someone else review: ");
body("1. Go to github.com/tej89032704-ctrl/car-rental");
body("2. Click the 'Compare & pull request' button (yellow banner)");
body("3. Add a description of what you changed");
body("4. Click 'Create pull request'");
body("5. Assign a teammate as reviewer");

doc.addPage();

step("2.10", "Review & merge (by someone else)");
body("Another team member reviews the code:");
body("1. They open your PR on GitHub");
body("2. They read your code changes in the 'Files changed' tab");
body("3. They leave comments or approve");
body("4. Click 'Merge pull request' then 'Confirm merge'");
body("5. Click 'Delete branch' (cleanup)");

step("2.11", "Everyone pulls main after merge");
body("After a PR is merged, all team members update their local main:");
code(`git checkout main
git pull origin main`);
tip("Do this every time someone merges, so you always have the latest code.");

doc.addPage();

// ── Section 3: Example Scenario ──
section("PHASE 3: Real Example – 4 People Working Together");

body("Each person builds a different feature at the same time. Here's how it works:");

doc.moveDown(0.3);
doc.font("Helvetica-Bold").fontSize(10).fillColor(primary);
doc.text("Person 1 (You)     →  Car listing page", { indent: 10 });
doc.text("Person 2 (Friend A) →  Booking system", { indent: 10 });
doc.text("Person 3 (Friend B) →  User authentication", { indent: 10 });
doc.text("Person 4 (Friend C) →  Search & filters", { indent: 10 });
doc.moveDown(0.5);

body("All 4 work simultaneously without interfering because they're on different branches editing different files.");

doc.addPage();

body("Timeline of events:");
doc.moveDown(0.2);

const events = [
  ["9:00 AM", "All 4 pull main"],
  ["9:15 AM", "Each creates their branch"],
  ["10:00 AM", "Person 4 finishes search, pushes, creates PR"],
  ["10:15 AM", "Person 2 reviews Person 4's PR and merges it"],
  ["10:20 AM", "All 3 others pull main (now have Person 4's search code)"],
  ["11:30 AM", "Person 1 finishes car listing, pushes, creates PR"],
  ["11:45 AM", "Person 3 reviews & merges Person 1's PR"],
  ["12:00 PM", "All pull main again"],
];

for (const [time, event] of events) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(primary).text(`  ${time}`, { continued: true });
  doc.font("Helvetica").fontSize(9).fillColor(secondary).text(`  ${event}`);
}
doc.moveDown(1);

tip("No one is blocked waiting for someone else. Everyone works in parallel.");

doc.addPage();

// ── Section 4: Handling Merge Conflicts ──
section("PHASE 4: Handling Merge Conflicts");

body("If two people edit the same file at the same time, Git may show a conflict. Don't panic — it's normal.");
doc.moveDown(0.5);

step("4.1", "When does a conflict happen?");
body("When you try to merge and two branches changed the same lines in the same file.");

step("4.2", "What conflict looks like");
doc.font("Courier").fontSize(9).fillColor("#1f2937");
const conflictExample = `<<<<<<< HEAD
const price = 50;
=======
const price = 75;
>>>>>>> feature/discount`;
doc.text(`  ${conflictExample}`, { indent: 10, lineBreak: false });
doc.moveDown(0.3);
doc.font("Helvetica").fontSize(10).fillColor(secondary);
body("HEAD = your current version. The other section = incoming changes. Keep what's correct.");

step("4.3", "Fix the conflict");
body("Edit the file, remove conflict markers, keep the right code:");
code(`const price = 75;`);
step("4.4", "Mark as resolved and commit");
code(`git add .
git commit -m "Resolve merge conflict in pricing"`);

tip("Communicate with your teammate to decide which version to keep. Conflicts are just decisions, not errors.");

doc.addPage();

// ── Section 5: Quick Reference ──
section("QUICK REFERENCE");

const commands = [
  ["Clone repo (first time)", "git clone https://github.com/tej89032704-ctrl/car-rental.git"],
  ["Get latest code", "git pull origin main"],
  ["Create a new branch", "git checkout -b feature/your-feature"],
  ["Check changes", "git status"],
  ["Stage all changes", "git add ."],
  ["Commit", 'git commit -m "Your message"'],
  ["Push branch", "git push origin feature/your-feature"],
  ["Switch to main", "git checkout main"],
  ["Pull and update", "git pull origin main"],
  ["Update your branch", "git checkout feature/x && git merge main"],
  ["See all branches", "git branch -a"],
  ["Delete local branch", "git branch -d feature/x"],
];

doc.moveDown(0.5);
for (const [desc, cmd] of commands) {
  doc.font("Helvetica-Bold").fontSize(9).fillColor(secondary).text(`  ${desc}:`, { continued: true });
  doc.font("Courier").fontSize(8).fillColor("#1f2937").text(`  ${cmd}`);
  doc.moveDown(0.2);
}

doc.moveDown(1);
doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Generated by opencode", { align: "center" });

doc.end();

console.log("PDF generated: docs/git-collaboration-guide.pdf");