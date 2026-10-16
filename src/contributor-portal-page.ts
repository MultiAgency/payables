/** Static entry: no agent discovery, balances, policies, roster or private records. */
export function contributorPortalPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contributors & payouts · MultiAgency</title><style>
:root{color-scheme:light dark;--bg:#fafafa;--fg:#20242b;--muted:#555d68;--line:#d9dde3;--accent:#202e46}
@media(prefers-color-scheme:dark){:root{--bg:#151a23;--fg:#f5f6f8;--muted:#b6bfcd;--line:#424c5c;--accent:#dce7fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}
main{max-width:52rem;margin:auto;padding:64px 24px}header{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:64px}
a{color:var(--fg);text-underline-offset:4px}h1{font-size:clamp(32px,6vw,48px);line-height:1.12;letter-spacing:-.025em;max-width:18ch;margin:0 0 24px;font-weight:600}h2{font-size:22px;margin:0 0 12px}
p{color:var(--muted);max-width:65ch;margin:0 0 24px}section{padding:32px 0;border-top:1px solid var(--line)}label{display:block;margin-bottom:8px}
input{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:16px}input::placeholder{color:var(--muted);opacity:1}
button,.action{display:inline-block;background:var(--accent);color:var(--bg);border:0;border-radius:24px;padding:12px 20px;font:inherit;text-decoration:none;cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:4px}::selection{background:var(--accent);color:var(--bg)}#error{color:var(--fg);margin-top:16px}[hidden]{display:none!important}
@media(max-width:520px){main{padding:24px 20px}header{margin-bottom:40px}}
</style></head><body><main><header><a href="/contributors">MultiAgency</a><a href="/owners">Owner workspace</a></header>
<h1>Good work. Clear agreements. Trackable payouts.</h1>
<p>Propose a work order, request payment and follow its status. Use the contributor link from the agent owner to reach the right payment workspace.</p>
<section aria-labelledby="contributor-title"><h2 id="contributor-title">For contributors and payees</h2>
<p>Your contributor link opens your agreements, work orders and payout history. Sign in with the NEAR account that will receive payment.</p>
<form id="open-intake"><label for="intake">Contributor link</label><input id="intake" type="url" required placeholder="Paste the link shared by the owner" autocomplete="off">
<button type="submit">Open contributor portal</button><p id="error" role="alert" hidden></p></form></section>
<section aria-labelledby="owner-title"><h2 id="owner-title">For agent owners</h2>
<p>See your agents in one workspace. Review agreements and work orders, track payment requests and approve held payouts with your existing owner permissions.</p>
<a class="action" href="/owners">Open owner workspace</a></section>
<script>document.getElementById('open-intake').onsubmit=function(event){event.preventDefault();const error=document.getElementById('error');try{const url=new URL(document.getElementById('intake').value);if(url.origin!==location.origin||!/^\\/requests\\/pay-[0-9a-f]{24}\\/$/.test(url.pathname)||url.username||url.password)throw new Error();location.assign(url.pathname+url.search);}catch{error.hidden=false;error.textContent='Use a contributor link from this host, shared by the agent owner. Contact the owner if you need a link.';}};</script>
</main></body></html>`;
}
