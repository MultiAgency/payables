import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { sessionToken } from "../src/signin.js";

test("Invoices entry keeps contributor sessions separate from the authenticated owner workspace", async () => {
  const dir = mkdtempSync(join(tmpdir(), "contributor-gateway-"));
  // A clean candidate has no web/dist. Build real assets in this fixture's own app tree.
  const root = process.cwd(), app = join(dir, "app");
  mkdirSync(app);
  for (const name of ["src", "web", "evidence", "package.json", "tsconfig.json"]) cpSync(join(root, name), join(app, name), {
    recursive: true, filter: file => !["node_modules", "dist"].includes(file.split("/").at(-1)!),
  });
  symlinkSync(join(root, "node_modules"), join(app, "node_modules"), "dir");
  const build = spawnSync(process.execPath, [join(root, "node_modules/@rsbuild/core/bin/rsbuild.js"), "build", "--root", "web"], { cwd: app, encoding: "utf8", timeout: 45000 });
  assert.equal(build.status, 0, `${build.error ?? ""}\n${build.stdout}\n${build.stderr}`);
  const config = join(dir, "dashboard.json");
  writeFileSync(config, JSON.stringify({host:"invoices.test",portal:"invoices",selfService:{maxAgents:2,firstPort:19000},agents:[]}));
  const probe = createServer();
  await new Promise<void>(done => probe.listen(0,"127.0.0.1",done));
  const port = (probe.address() as {port:number}).port;
  await new Promise<void>(done => probe.close(() => done()));
  const secret = "contributor-owner-gateway-test-secret-012345";
  const child = spawn(process.execPath,["--import",import.meta.resolve("tsx"),join(app,"src/gateway/server.ts")],{
    cwd:dir,env:{...process.env,PORT:String(port),DASHBOARD_FILE:config,SESSION_SECRET:secret},stdio:["ignore","pipe","pipe"]});
  let stderr="";child.stderr!.on("data",chunk=>stderr+=chunk);
  try {
    await new Promise<void>((done,fail)=>{
      const timer=setTimeout(()=>fail(new Error(stderr||"Gateway startup timed out")),10000);
      child.stdout!.on("data",chunk=>{if(String(chunk).includes("signing in to")){clearTimeout(timer);done();}});
      child.once("exit",code=>{clearTimeout(timer);fail(new Error(`Gateway exited ${code}: ${stderr}`));});
    });
    const base=`http://127.0.0.1:${port}`;
    const entry=await(await fetch(base)).text();
    assert.match(entry,/For contributors and payees/);
    assert.match(entry,/href="\/owners"/);
    assert.doesNotMatch(entry,/fetch\(|public_key|balance|dao_session/);
    const contributorCookie={cookie:`invoices_session=${sessionToken("payee.near",secret)}`};
    assert.match(await(await fetch(base,{headers:contributorCookie})).text(),/For contributors and payees/);
    const me=await(await fetch(base+"/gw/me",{headers:contributorCookie})).json();
    assert.equal(me.viewer,null);
    assert.deepEqual(me.agents,[]);
    assert.equal((await fetch(base+"/a/unknown/rpc/setup",{headers:contributorCookie})).status,404);
    const owner=await(await fetch(base+"/owners")).text();
    assert.match(owner,/id="root"/);
    assert.doesNotMatch(owner,/For contributors and payees/);
    const headers={cookie:`dao_session=${sessionToken("owner.near",secret)}`};
    assert.match(await(await fetch(base,{headers})).text(),/id="root"/);
    assert.match(await(await fetch(base+"/contributors",{headers})).text(),/For contributors and payees/);
  } finally { if(child.exitCode===null){const exited=new Promise(done=>child.once("exit",done));child.kill();await exited;} rmSync(dir, { recursive: true, force: true }); }
});
