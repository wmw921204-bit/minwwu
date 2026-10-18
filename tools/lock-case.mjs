// Locks a case study behind a password.
// Reads the readable page from private/<name>.html (git-ignored), encrypts it with
// AES-GCM (key from PBKDF2 of the password) and writes projects/<name>.html: a public
// password page that carries only the encrypted page.
//
//   CASE_PASSWORD=... node tools/lock-case.mjs finra
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const name = process.argv[2];
const password = process.env.CASE_PASSWORD;
if (!name || !password) { console.error("usage: CASE_PASSWORD=... node tools/lock-case.mjs <name>"); process.exit(1); }

const src = readFileSync(`private/${name}.html`, "utf8");
const gate = readFileSync(`tools/gate-${name}.html`, "utf8");

const ITER = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(src)));
const b64 = (u) => Buffer.from(u).toString("base64");

// The password page reuses the real page's head, top bar and footer
const head = src.slice(0, src.indexOf("<main id=\"main\">"));
// site scripts are loaded by the password page itself, and only while it stays locked
const scriptRe = /\s*<script src="([^"]+)" defer><\/script>/g;
let footer = src.slice(src.indexOf("  <footer class=\"footer\">"));
const scripts = [...footer.matchAll(scriptRe)].map((m) => m[1]);
footer = footer.replace(scriptRe, "");
const payload = JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) });

const out = head.replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="FINRA × SCADpro: an industry partnership case study. Password protected; contact Minwei Wu for access.">')
  + gate.replace("__PAYLOAD__", payload).replace("__SCRIPTS__", JSON.stringify(scripts))
  + footer;
writeFileSync(`projects/${name}.html`, out);
console.log(`projects/${name}.html written (${(out.length / 1024).toFixed(0)} KB, encrypted body ${(data.length / 1024).toFixed(0)} KB)`);
