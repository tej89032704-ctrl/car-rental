const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const fileName = "local-setup-guide.pdf";
const filePath = path.join(__dirname, fileName);
try { fs.unlinkSync(filePath); } catch (e) { }

const doc = new PDFDocument({ size: "A4", margins: { top: 55, bottom: 50, left: 55, right: 55 } });
const stream = fs.createWriteStream(filePath);
stream.on("error", (err) => { console.error("Write error:", err.message); process.exit(1); });
doc.pipe(stream);

const primary = "#1a56db";
const secondary = "#374151";
const accent = "#059669";

function title(text) {
  doc.font("Helvetica-Bold").fontSize(25).fillColor(primary).text(text, { align: "center" });
  doc.moveDown(1);
}

function section(text) {
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(15).fillColor(primary).text(text);
  doc.moveDown(0.2);
  doc.moveTo(55, doc.y).lineTo(540, doc.y).strokeColor(primary).stroke();
  doc.moveDown(0.5);
}

function step(num, text) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(secondary).text(`Step ${num}: ${text}`);
  doc.moveDown(0.2);
}

function subsection(text) {
  doc.font("Helvetica-Bold").fontSize(11).fillColor(secondary).text(text);
  doc.moveDown(0.2);
}

function body(text) {
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(text, { align: "justify" });
  doc.moveDown(0.3);
}

function item(text) {
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(`  • ${text}`);
  doc.moveDown(0.15);
}

function codeBlock(text) {
  const lines = text.split("\n");
  const x = 65;
  const padding = 8;
  const lineH = 13;
  const boxTop = doc.y;
  let currentY = boxTop + padding;
  const widths = lines.map(l => doc.font("Courier").fontSize(8.5).widthOfString(l));
  const maxW = Math.max(...widths) + padding * 2 + 20;

  doc.rect(x, boxTop, 485, lines.length * lineH + padding * 2).fill("#f9fafb").strokeColor("#d1d5db").stroke();
  doc.fillColor("#1f2937");
  doc.font("Courier").fontSize(8.5);
  for (const line of lines) {
    doc.text(line, x + padding, currentY, { width: 470, lineBreak: false });
    currentY += lineH;
  }
  doc.y = currentY + 8;
  doc.font("Helvetica").fontSize(10).fillColor(secondary);
}

function tip(text) {
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(accent).text(`  TIP: ${text}`);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(secondary);
}

function warn(text) {
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#dc2626").text(`  IMPORTANT: ${text}`);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10).fillColor(secondary);
}

// ── TITLE PAGE ──
doc.moveDown(5);
title("Local Development Setup Guide");
doc.font("Helvetica").fontSize(13).fillColor(secondary).text("How Every Team Member Sets Up Their Machine", { align: "center" });
doc.moveDown(0.3);
doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Car Rental App – Java + Spring Boot + React", { align: "center" });
doc.moveDown(2);

doc.font("Helvetica-Bold").fontSize(12).fillColor(secondary).text("Who is this for?", { align: "center" });
doc.font("Helvetica").fontSize(10).fillColor(secondary).text("You + 3 friends. Each person follows this guide once to set up their computer.", { align: "center" });
doc.moveDown(2);

doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Generated: " + new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), { align: "center" });

doc.addPage();

// ── TABLE OF CONTENTS ──
doc.moveDown(2);
title("Contents");
doc.moveDown(1);

const toc = [
  "1. Prerequisites — What everyone needs to install",
  "2. Option A — VS Code (Lightweight, recommended for frontend)",
  "3. Option B — IntelliJ IDEA (Best for Java/Spring Boot)",
  "4. Option C — Eclipse + Spring Tool Suite (Free, full-featured)",
  "5. Database Setup — H2 vs PostgreSQL",
  "6. Cloning & Running the Project",
  "7. Troubleshooting Common Issues",
];

for (const entry of toc) {
  doc.font("Helvetica").fontSize(11).fillColor(secondary).text(`  ${entry}`);
  doc.moveDown(0.4);
}

doc.addPage();

// ── SECTION 1: PREREQUISITES ──
section("1. Prerequisites — Everyone Must Install These");

step("1.1", "Java 21 (JDK)");
body("The backend runs on Java. Install the Long-Term Support (LTS) version 21.");
doc.moveDown(0.2);
doc.font("Helvetica-Bold").fontSize(10).fillColor(secondary).text("Download option 1 — Eclipse Temurin (recommended):", { indent: 5 });
codeBlock(`1. Go to https://adoptium.net/
2. Click "Latest LTS Release" (Temurin 21)
3. Choose Windows → .msi installer
4. Run installer — keep default options
5. Verify: open CMD/PowerShell and type:  java -version`);
doc.moveDown(0.2);
doc.font("Helvetica-Bold").fontSize(10).fillColor(secondary).text("Download option 2 — Oracle JDK:", { indent: 5 });
codeBlock(`1. Go to https://www.oracle.com/java/technologies/downloads/
2. Select Java 21 → Windows → x64 MSI Installer
3. Run installer, verify with:  java -version`);

doc.moveDown(0.3);
step("1.2", "Node.js (for frontend)");
codeBlock(`1. Go to https://nodejs.org/
2. Download the LTS version (20.x or 22.x)
3. Run the installer (default options are fine)
4. Verify:  node --version  and  npm --version`);

doc.moveDown(0.3);
step("1.3", "Git");
codeBlock(`1. Go to https://git-scm.com/download/win
2. Download and install (default options are fine)
3. Verify:  git --version`);

doc.moveDown(0.3);
step("1.4", "Maven (or use Maven Wrapper)");
body("Maven builds the Java backend. The project includes a Maven Wrapper (mvnw), so you don't strictly need to install Maven globally — but it's recommended.");
codeBlock(`Option A — Use the Maven Wrapper (no install):
  cd backend
  ./mvnw spring-boot:run

Option B — Install Maven globally:
1. Go to https://maven.apache.org/download.cgi
2. Download "Binary zip archive" (apache-maven-3.9.x-bin.zip)
3. Extract to C:\\maven
4. Add to PATH:
   - Search "Environment Variables" in Windows
   - Add C:\\maven\\bin to Path
5. Verify:  mvn --version`);

doc.addPage();

step("1.5", "PostgreSQL (database) — Optional for now");
body("You can start with H2 (in-memory database, zero setup) and switch to PostgreSQL later. But if you want PostgreSQL from day one:");
codeBlock(`1. Go to https://www.postgresql.org/download/windows/
2. Download the installer for your version
3. Run installer:
   - Install dir: default (C:\\Program Files\\PostgreSQL\\17)
   - Set password (remember it!)
   - Port: 5432 (default)
4. Open pgAdmin (installed with PostgreSQL)
5. Create a database called:  car_rental
6. Verify connection:
   psql -U postgres -d car_rental`);

step("1.6", "Verify everything is installed");
body("Run these commands to confirm everything works:");
codeBlock(`java -version        →  should show "21.x.x"
node --version      →  should show "v20.x.x" or "v22.x.x"
npm --version       →  should show "10.x.x"
git --version       →  should show "2.x.x"
mvn --version       →  should show "Apache Maven 3.9.x"`);

doc.addPage();

// ── SECTION 2: VS CODE ──
section("2. Option A — VS Code (Lightweight, Good for Frontend)");

body("Best for: Frontend-focused work or if you want a lightweight editor for both frontend and backend.");

step("2.1", "Install VS Code");
codeBlock(`1. Go to https://code.visualstudio.com/
2. Download and install
3. Launch VS Code`);

step("2.2", "Install extensions (from the Extensions panel on the left)");
doc.moveDown(0.2);
doc.font("Helvetica-Bold").fontSize(10).fillColor(secondary).text("Essential extensions:", { indent: 5 });
item("Extension Pack for Java — Microsoft (includes Language Support, Debugger, Test Runner, Maven)");
item("Spring Boot Extension Pack — VMware (includes Spring Boot Tools, Boot Dashboard, Initializr)");
item("ES7+ React/Redux/React-Native snippets");
item("Tailwind CSS IntelliSense");
item("GitLens — See who changed what in-line");
doc.moveDown(0.3);

step("2.3", "Open project in VS Code");
codeBlock(`1. File → Open Folder → Select D:\\cr
2. VS Code will detect pom.xml and offer to import the Maven project
3. Click "Yes" — wait for dependencies to download
4. Open the Spring Boot dashboard (look for the Spring Boot icon in the sidebar)
5. You'll see the application — click "Run"`);

step("2.4", "Run the frontend (in VS Code terminal)");
codeBlock(`cd frontend
npm install
npm run dev`);

tip("Use split terminals: one for backend (mvn spring-boot:run), one for frontend (npm run dev).");

doc.addPage();

// ── SECTION 3: INTELLIJ ──
section("3. Option B — IntelliJ IDEA (Best for Java/Spring Boot)");

body("Best for: Java backend development. IntelliJ has the best Spring Boot support out of the box.");

step("3.1", "Download and install IntelliJ IDEA");
codeBlock(`1. Go to https://www.jetbrains.com/idea/download/
2. Download the Community Edition (free, open-source)
3. Run installer — keep default options`);

step("3.2", "Open the project");
codeBlock(`1. Launch IntelliJ
2. Click "Open" → select D:\\cr
3. IntelliJ auto-detects the Maven project (pom.xml)
4. Wait for indexing and dependency download (bottom-right shows progress)`);

step("3.3", "Configure Java SDK");
codeBlock(`1. File → Project Structure → Project
2. Under "SDK" click "Add SDK" → "Download JDK"
3. Select: Version 21, Vendor Eclipse Temurin
4. Click Download → Apply → OK
5. IntelliJ will re-index the project`);

step("3.4", "Run the backend");
codeBlock(`1. Find the main application class (src/main/java/...)
2. Look for a green triangle next to the class name
3. Click the triangle → "Run"
4. Or use the Maven panel on the right:
   - Expand Lifecycle → double-click "spring-boot:run"`);

step("3.5", "Run the frontend");
codeBlock(`1. Open the Terminal in IntelliJ (Alt+F12)
2. cd frontend
3. npm install
4. npm run dev`);

tip("IntelliJ remembers run configurations. You only set this up once.");

doc.addPage();

// ── SECTION 4: ECLIPSE ──
section("4. Option C — Eclipse + Spring Tool Suite (Free, Full-Featured)");

body("Best for: Anyone who wants a free, full-featured Java IDE with built-in Spring support.");

step("4.1", "Download Spring Tool Suite (STS)");
codeBlock(`1. Go to https://spring.io/tools
2. Download "Spring Tools 4 for Eclipse"
3. Choose Windows x86-64
4. Extract the ZIP to C:\\sts
5. Run SpringToolSuite4.exe`);

step("4.2", "Import the project");
codeBlock(`1. File → Import → Maven → Existing Maven Projects
2. Browse to D:\\cr
3. Select pom.xml → Finish
4. Wait: Eclipse downloads dependencies and builds the project`);

step("4.3", "Run the backend");
codeBlock(`1. Right-click the project in the Package Explorer
2. Run As → Maven build...
3. In Goals type: spring-boot:run
4. Click Run`);

step("4.4", "Run the frontend");
codeBlock(`1. Window → Show View → Terminal
2. cd frontend
3. npm install
4. npm run dev`);

tip("You can also right-click the main application class → Run As → Java Application.");

doc.addPage();

// ── SECTION 5: DATABASE ──
section("5. Database Setup — H2 vs PostgreSQL");

subsection("Option 1: H2 (In-Memory) — For Development Only");
body("Zero setup. Spring Boot auto-configures H2 when it detects it in the classpath. Data is lost when the app stops — perfect for testing.");
codeBlock(`// In backend/src/main/resources/application.properties:
spring.datasource.url=jdbc:h2:mem:carrental
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=
spring.h2.console.enabled=true
# H2 Console available at: http://localhost:8080/h2-console`);
body("H2 is already included as a dependency in pom.xml for development.");

doc.moveDown(0.5);
subsection("Option 2: PostgreSQL — Persistent Database");
body("For when you want to keep data between restarts. Everyone can run PostgreSQL locally.");
codeBlock(`// In backend/src/main/resources/application.properties:
spring.datasource.url=jdbc:postgresql://localhost:5432/car_rental
spring.datasource.username=postgres
spring.datasource.password=your_password
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect
spring.jpa.hibernate.ddl-auto=update`);
body("Switch between H2 and PostgreSQL by changing application.properties. No code changes needed.");

doc.addPage();

// ── SECTION 6: CLONE & RUN ──
section("6. Cloning & Running the Project");

step("6.1", "Clone the repository (each person does this once)");
codeBlock(`git clone https://github.com/tej89032704-ctrl/car-rental.git
cd car-rental`);

step("6.2", "Set up the backend");
codeBlock(`cd backend
# On first run, Maven downloads all dependencies:
./mvnw spring-boot:run
# Or if Maven is installed globally:
mvn spring-boot:run`);
body("The backend starts at http://localhost:8080. Swagger UI at http://localhost:8080/swagger-ui.html");

step("6.3", "Set up the frontend (in a new terminal)");
codeBlock(`cd frontend
npm install
npm run dev`);
body("The frontend starts at http://localhost:5173 (Vite default).");

step("6.4", "Open in browser");
codeBlock(`Frontend:  http://localhost:5173
Backend:   http://localhost:8080
Swagger:   http://localhost:8080/swagger-ui.html
H2 DB:     http://localhost:8080/h2-console`);

tip("The frontend dev server proxies API calls to localhost:8080 automatically via Vite config.");

doc.addPage();

// ── SECTION 7: TROUBLESHOOTING ──
section("7. Troubleshooting Common Issues");

subsection("Java not found after installation");
codeBlock(`Problem: java -version gives "not recognized"
Fix: Restart your terminal/CMD after installing JDK
     Or search "Environment Variables" → add JAVA_HOME pointing
     to C:\\Program Files\\Eclipse Adoptium\\jdk-21.x.x-hotspot`);

subsection("Port already in use (8080)");
codeBlock(`Problem: "Web server failed to start. Port 8080 was already in use."
Fix: Find what's using port 8080:
       netstat -ano | findstr :8080
     Kill the process:
       taskkill /PID <number> /F
     Or change port in application.properties:
       server.port=8081`);

subsection("npm install fails");
codeBlock(`Problem: npm ERR! code ENOENT or ECONNRESET
Fix: Try clearing cache and retrying:
       npm cache clean --force
       npm install
     Or use a different network (sometimes corporate firewalls block npm).`);

subsection("Maven download is slow");
codeBlock(`Fix: Add a faster mirror in backend/pom.xml:
<repositories>
  <repository>
    <id>aliyun</id>
    <url>https://maven.aliyun.com/repository/public</url>
  </repository>
</repositories>`);

subsection("Git push rejected");
codeBlock(`Problem: "Updates were rejected because the remote contains work"
Fix: Pull first, then push:
       git pull origin main --rebase
       git push origin main`);

doc.moveDown(2);
doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Generated by opencode", { align: "center" });

doc.end();

stream.on("finish", () => {
  console.log("PDF generated: docs/" + fileName);
});
