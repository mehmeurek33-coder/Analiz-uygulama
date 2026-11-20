#!/usr/bin/env python3
"""Blok aciklamalari uygulamadakine benzer koyu temada HTML'e dok + ekran goruntusu.
Kullanim: python3 -I onizleme.py <D> <id,id,...> <cikti.png>"""
import html, json, sys, subprocess, os
D, ids, cikti = sys.argv[1], sys.argv[2].split(","), sys.argv[3]
p = ["<html><body style='background:#0b1120;color:#e8edf7;font:15px/1.6 sans-serif;width:760px;margin:16px'>"]
for i in ids:
    d = json.load(open(f"{D}/blok/{i}.json", encoding="utf-8"))
    p.append(f"<div style='border:1px solid #243352;border-radius:12px;padding:12px;margin-bottom:24px;background:#121a2e'><div style='color:#93a3c0;font-size:12px'>{i[:8]}</div>")
    for b in d["bloklar"]:
        if b["t"] == "m":
            p.append(f"<div style='white-space:pre-wrap;margin:8px 0'>{html.escape(b['x'])}</div>")
        else:
            p.append(f"<div style='background:#fff;border-radius:8px;padding:6px;margin:8px 0;text-align:center'><img src='file://{D}/blok/img/{b['yol']}' style='max-width:100%;width:{min(b['w'],740)}px'></div>")
    p.append("</div>")
p.append("</body></html>")
open(f"{D}/onizleme.html", "w", encoding="utf-8").write("".join(p))
js = f"""const {{chromium}}=require('playwright');(async()=>{{const b=await chromium.launch();const pg=await b.newPage({{viewport:{{width:792,height:900}}}});
await pg.goto('file://{D}/onizleme.html');await pg.waitForTimeout(500);await pg.screenshot({{path:'{cikti}',fullPage:true}});await b.close();}})();"""
subprocess.run(["node", "-e", js], check=True)
