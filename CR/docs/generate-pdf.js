const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const fileName = "tech-stack-v2.pdf";
const filePath = path.join(__dirname, fileName);

try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 60, left: 60, right: 60 },
});

const stream = fs.createWriteStream(filePath);
stream.on("error", (err) => {
  console.error("Write error:", err.message);
  process.exit(1);
});
doc.pipe(stream);

// Colors
const primary = "#1a56db";
const secondary = "#374151";
const accent = "#059669";

function title(text) {
  doc.font("Helvetica-Bold").fontSize(26).fillColor(primary).text(text, { align: "center" });
  doc.moveDown(0.5);
}

function section(text) {
  doc.moveDown(1);
  doc.font("Helvetica-Bold").fontSize(16).fillColor(primary).text(text);
  doc.moveDown(0.3);
  doc.moveTo(60, doc.y).lineTo(545, doc.y).strokeColor(primary).stroke();
  doc.moveDown(0.5);
}

function subsection(text) {
  doc.font("Helvetica-Bold").fontSize(12).fillColor(secondary).text(text);
  doc.moveDown(0.2);
}

function body(text) {
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(text, { align: "justify" });
  doc.moveDown(0.3);
}

function item(text) {
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(`  • ${text}`);
  doc.moveDown(0.1);
}

function recommendation(title, desc) {
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(accent).text(title);
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(desc, { align: "justify" });
  doc.moveDown(0.2);
}

// Title page
doc.moveDown(4);
title("Car Rental App");
doc.font("Helvetica").fontSize(14).fillColor(secondary).text("Technology Stack & Recommendations", { align: "center" });
doc.moveDown(0.5);
doc.font("Helvetica").fontSize(10).fillColor("#6b7280").text("Prepared for: tej89032704-ctrl & team", { align: "center" });
doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), { align: "center" });

doc.addPage();

// Section 1: Current Technologies
section("1. Current Technologies in Use");

subsection("Version Control");
item("Git – Distributed version control for collaborative development");
item("GitHub – Remote repository hosting for team collaboration");

subsection("Project Structure");
item("frontend/ – React app (Vite + Tailwind CSS)");
item("backend/ – Spring Boot Java application");
item("docs/ – Documentation and planning");

subsection("Planned Frontend");
item("React (Vite) – Fast, modern JavaScript framework for building UIs");
item("Tailwind CSS – Utility-first CSS framework for rapid styling");
item("Framer Motion – Animation library for smooth transitions & gestures");

subsection("Planned Backend");
item("Java 21 + Spring Boot 3 – Enterprise-grade REST API framework");
item("Spring Data JPA / Hibernate – Database ORM for PostgreSQL");
item("Spring Security – Authentication, authorization, and JWT tokens");
item("Maven – Build automation and dependency management");

subsection("Platform");
item("Windows – Development environment");
item("Java 21 (LTS) – JDK for backend development");
item("Node.js v22 – JavaScript runtime for frontend");

doc.addPage();

// Section 2: Recommended Technologies
section("2. Recommended Technologies");

subsection("Frontend");
recommendation("React Router", "Handles navigation between pages (car listing, booking, profile). Essential for a multi-page app.");
recommendation("Axios / React Query", "Axios for HTTP requests + React Query for caching, syncing, and managing server state. Much cleaner than raw fetch().");
recommendation("React Hook Form + Zod", "Form validation for booking forms, user registration, and car listings. Lightweight and performant.");
recommendation("Shadcn/ui or Headless UI", "Pre-built accessible components (modals, dropdowns, date pickers) that work with Tailwind CSS. Speeds up UI development.");

subsection("Backend");
recommendation("Java + Spring Boot", "Industry-standard backend framework. Spring Boot gives you REST APIs, dependency injection, security, and ORM integration out of the box. Strongly typed, highly scalable, and widely used in enterprise applications.");
recommendation("Spring Data JPA (Hibernate)", "ORM layer for database access. Map Java objects to database tables automatically. Supports PostgreSQL, MySQL, and more. No need to write raw SQL.");
recommendation("Spring Security + JWT", "Authentication and authorization. Spring Security handles login, roles, permissions. JWT for stateless token-based auth. Production-ready and battle-tested.");
recommendation("Maven / Gradle", "Build tools for Java projects. Maven (pom.xml) or Gradle (build.gradle) manage dependencies, build, and packaging. Run your app with a single command.");

subsection("Database");
recommendation("PostgreSQL", "Reliable, feature-rich relational DB. Perfect for car listings, users, bookings. Works great with Spring Data JPA. Free hosting on Supabase, Railway, or AWS RDS.");
recommendation("H2 Database (Development)", "In-memory database for local development and testing. Zero setup. Spring Boot auto-configures it. Switch to PostgreSQL in production with one config change.");

subsection("Mobile (Future)");
recommendation("React Native (Expo)", "If you want a mobile app later, reuse your React knowledge. Expo simplifies deployment to iOS and Android.");
recommendation("Kotlin Multiplatform (KMP)", "If your team knows Java/Kotlin, share business logic between Android, iOS, and web. Works naturally with your Java backend.");

doc.addPage();

subsection("DevOps & Deployment");
recommendation("Vercel / Netlify", "Free frontend hosting. Auto-deploys from GitHub. Handles SSL, CDN, custom domains.");
recommendation("Railway / Render / AWS Elastic Beanstalk", "Backend hosting for Spring Boot. Railway/Render are simple. AWS Elastic Beanstalk auto-scales and is industry standard for Java apps.");
recommendation("Docker", "Containerize your Spring Boot app. Ensures it runs the same on every machine. Simple Dockerfile: FROM eclipse-temurin:21, COPY jar, ENTRYPOINT java -jar.");
recommendation("GitHub Actions", "CI/CD pipeline. Run tests, build with Maven/Gradle, deploy on every push. Built into GitHub.");

subsection("Testing");
recommendation("Vitest + React Testing Library", "Unit & component testing for the frontend. Fast, Vite-native test runner.");
recommendation("JUnit 5 + Mockito", "Unit testing for Java backend. JUnit is the standard test framework. Mockito mocks dependencies. Spring Boot has first-class support for both.");
recommendation("Spring Boot Test + TestContainers", "Integration testing. TestContainers spins up real PostgreSQL in Docker for tests. Ensures your JPA queries work correctly against a real database.");

subsection("API Documentation");
recommendation("SpringDoc OpenAPI (Swagger)", "Auto-generates API documentation from your Spring Boot controllers. Interactive Swagger UI at /swagger-ui.html. Your frontend team can see all endpoints and test them.");

subsection("UI/UX & Design");
recommendation("Figma", "Free collaborative design tool. You and your friends can design pages together and export CSS.");
recommendation("Lucide Icons", "Open-source icon library. Clean, consistent icons for your car rental UI.");

doc.addPage();

// Section 3: Full Stack Recommendation
section("3. Recommended Full Stack");

doc.font("Helvetica-Bold").fontSize(12).fillColor(secondary).text("If you want to start building today:");
doc.moveDown(0.5);

const stack = [
  ["Frontend", "React + Vite + Tailwind CSS + Framer Motion + React Router"],
  ["Backend", "Java 21 + Spring Boot + Spring Data JPA + PostgreSQL"],
  ["Build", "Maven or Gradle"],
  ["Auth", "Spring Security + JWT"],
  ["API Docs", "SpringDoc OpenAPI (Swagger UI)"],
  ["Hosting", "Vercel (frontend) + Railway / AWS (backend)"],
  ["Design", "Figma + Lucide Icons"],
  ["CI/CD", "GitHub Actions + Docker"],
];

const startY = doc.y;
for (const [layer, tech] of stack) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(primary).text(`${layer}:`, { continued: true });
  doc.font("Helvetica").fontSize(10).fillColor(secondary).text(`  ${tech}`);
  doc.moveDown(0.3);
}

doc.moveDown(1);
section("4. Git Collaboration Best Practices");

doc.font("Helvetica-Bold").fontSize(11).fillColor(secondary).text("Branch Strategy");
doc.moveDown(0.2);
item("main – Stable, production-ready code. Protect this branch.");
item("feature/* – One branch per feature (e.g., feature/car-listing, feature/booking)");
item("Always create Pull Requests and review before merging to main.");

doc.moveDown(0.5);
doc.font("Helvetica-Bold").fontSize(11).fillColor(secondary).text("Workflow");
doc.moveDown(0.2);
item("git pull origin main  →  git checkout -b feature/your-feature");
item("Work & commit: git add .  →  git commit -m 'message'");
item("Push: git push origin feature/your-feature");
item("Create a PR on GitHub → assign a teammate to review");
item("Merge → delete the branch → repeat");

doc.moveDown(1);
doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text("Generated by opencode", { align: "center" });

doc.end();

stream.on("finish", () => {
  console.log("PDF generated: docs/" + fileName);
});