// AWS serverless web app — Well-Architected "Web application" reference architecture.
// Cognito → CloudFront (single entry) → S3 (static) + API Gateway → Lambda → DynamoDB.
// Layout: top-aligned spine so the main request flow is a straight horizontal line;
// Cognito / S3 / CloudWatch Logs drop straight down from their partner. NO hardcoded coords.
import { writeFileSync } from "node:fs";
import { Diagram } from "/opt/homebrew/lib/node_modules/drawio-ai-kit/src/builder.mjs";
import { group, frame, icon, box, phantom, renderTree } from "/opt/homebrew/lib/node_modules/drawio-ai-kit/src/layout-engine.mjs";

const d = new Diagram("sequence");

const COL = { dir: "col", gap: 50, header: 0, pad: 0 };

// Every spine node lives at the top of its own column (pad 0, header 0) so all five
// share the same Y → the Browser→CloudFront→API GW→Lambda→DynamoDB flow is one straight line.
// Cognito sits directly UNDER API Gateway (its authorizer partner) as a straight vertical drop,
// dropped LOWER than the S3/Logs row so the Browser→Cognito sign-in connector gets a clear
// horizontal lane BELOW S3 instead of cutting across its label.
const tree = phantom("root", "", { dir: "row", gap: 80, align: "top", header: 0, pad: 10 }, [
  phantom("c_browser", "", { ...COL, gap: 184 }, [
    // Height 48 matches the icon graphic so the browser centre lines up with the spine icons
    // (the icons' labels hang below their 48px glyph) → the Browser→CloudFront edge is dead straight.
    box("browser", "Browser (SPA)", { w: 140, h: 48, fill: "#DAE8FC", stroke: "#6C8EBF", bold: true }),
    icon("cognito", "cognito", "Cognito (User Pool)"),
  ]),
  phantom("c_cf", "", COL, [
    icon("cf", "cloudfront", "CloudFront (entry point)"),
    icon("s3", "s3", "S3 (static site, OAC)"),
  ]),
  phantom("c_api", "", COL, [
    icon("apigw", "api_gateway", "API Gateway"),
  ]),
  phantom("c_lambda", "", COL, [
    icon("lambda", "lambda", "Lambda (CRUD router)"),
    icon("logs", "cloudwatch_logs", "CloudWatch Logs"),
  ]),
  phantom("c_ddb", "", COL, [
    icon("ddb", "dynamodb", "DynamoDB (todos)"),
  ]),
]);

renderTree(d, tree, [40, 80]);
d.title("AWS serverless web app — Well-Architected \"Web application\" reference architecture");

// Solid (opaque) label background so the connector line never shows through the text.
// The theme default uses light-dark(), which the PNG rasterizer renders as transparent.
const LB = "labelBackgroundColor=#FFFFFF;";

// Straight spine (left → right).
d.link("browser", "cf", "1 · HTTPS (SPA + /api)", { dir: "LR", style: LB });
d.link("cf", "apigw", "3 · /api/* behavior", { dir: "LR", style: LB });
d.link("apigw", "lambda", "4 · invoke", { dir: "LR", style: LB });
d.link("lambda", "ddb", "5 · query by userId", { dir: "LR", style: LB });

// Straight vertical drops to the partner service directly below.
d.link("cf", "s3", "2 · default behavior · static", { dir: "TB", style: LB });
d.link("lambda", "logs", "logs", { dir: "TB", dash: true, style: LB });

// Sign-in — straight vertical drop from the browser to Cognito (same column, enters the top).
d.link("browser", "cognito", "sign in → JWT", { dir: "TB", dash: true, style: LB });

// Cross-cutting authorizer dependency — the one edge that cannot be a spine/drop. The auto-router
// insists on threading it across the spine (through CloudFront/S3), so route it deterministically:
// straight down from API Gateway, left along a clear lane BELOW the S3 label, into Cognito's right
// side (so it also clears Cognito's own label). Coordinates come from the computed layout — no
// magic numbers: the lane sits at Cognito's vertical centre, which the 150px drop places below S3.
{
  const EDGE = "light-dark(#2D6A9F,#5B9BD5)", FC = "light-dark(#1B2733,#CFE0F0)";
  const laneY = Math.round(d.R.cognito.y + d.R.cognito.h / 2);
  const apigwCx = Math.round(d.R.apigw.x + d.R.apigw.w / 2);
  const st = `edgeStyle=orthogonalEdgeStyle;html=1;rounded=0;jettySize=auto;orthogonalLoop=1;dashed=1;` +
    `fontSize=10;fontColor=${FC};strokeColor=${EDGE};strokeWidth=2;${LB}` +
    `exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;`;
  d.cells.push(
    `<mxCell id="edAuthorizer" value="validate JWT (authorizer)" style="${st}" edge="1" parent="1" ` +
    `source="apigw" target="cognito"><mxGeometry relative="1" as="geometry">` +
    `<Array as="points"><mxPoint x="${apigwCx}" y="${laneY}"/></Array></mxGeometry></mxCell>`
  );
}

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("./aws-architecture.drawio", import.meta.url), d.mxfile("AWS serverless web app"));

// Self-check tail (added by `drawio-ai scaffold`): one run = build + validate + render + issues.
import { execFileSync as __exec } from "node:child_process";
try {
  const __f = new URL("./aws-architecture.drawio", import.meta.url).pathname;
  console.log(__exec("drawio-ai", ["render", __f, "--check", "-o", __f + ".png"], { encoding: "utf8" }).trim());
} catch (e) { console.error("RENDER-SKIPPED:", String(e.message).split("\n")[0]); }
