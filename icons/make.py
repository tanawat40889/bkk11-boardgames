# Renders app icons via headless Chrome. Run: python3 icons/make.py
import subprocess, os, pathlib
here = pathlib.Path(__file__).parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
GLYPH = "M232 120L232 160L153.9 160C139.6 160 128 171.6 128 185.9C128 189.9 128.9 193.9 130.7 197.5L164.1 264.3C152.7 266.1 143.9 276 143.9 288C143.9 301.3 154.6 312 167.9 312L173.5 312L159.9 448L103.7 518.3C98.7 524.6 95.9 532.4 95.9 540.5C95.9 560.1 111.8 576 131.4 576L380.3 576C399.9 576 415.8 560.1 415.8 540.5C415.8 532.4 413.1 524.6 408 518.3L352 448L338.4 312L344 312C357.3 312 368 301.3 368 288C368 276.1 359.3 266.1 347.8 264.3L381.2 197.5C383 193.9 383.9 189.9 383.9 185.9C383.9 171.6 372.3 160 358 160L279.9 160L279.9 120L295.9 120C309.2 120 319.9 109.3 319.9 96C319.9 82.7 309.3 72 296 72L280 72L280 56C280 42.7 269.3 32 256 32C242.7 32 232 42.7 232 56L232 72L216 72C202.7 72 192 82.7 192 96C192 109.3 202.7 120 216 120L232 120zM389.8 343.6L398.3 429.1L445.7 488.3L449.9 494C459.1 507.7 464 523.9 464 540.5C464 553.2 461.2 565.3 456.1 576L539.2 576C559.5 576 576 559.5 576 539.2C576 531.9 573.8 524.8 569.8 518.8L544 480.1L544 416.1L557.3 402.8C569.3 390.8 576 374.5 576 357.5L576 256C576 238.3 561.7 224 544 224C526.3 224 512 238.3 512 256L512 272L480 272L480 256C480 238.3 465.7 224 448 224C430.3 224 416 238.3 416 256L416 288C416 310.4 405.8 330.4 389.8 343.6z"

def svg(rounded=True, k=1.0):
    s = 0.54
    g = f"translate({256 - 336*s:.1f},{64 - 32*s:.1f}) scale({s})"
    bg = f'<rect width="512" height="512" rx="{112 if rounded else 0}" fill="url(#bg)"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa9ff"/><stop offset="1" stop-color="#1d4fd6"/></linearGradient>
 <linearGradient id="or" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffcf7a"/><stop offset="1" stop-color="#ff7438"/></linearGradient>
 <radialGradient id="gl" cx=".5" cy=".3" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
{bg}
<rect width="512" height="512" rx="{112 if rounded else 0}" fill="url(#gl)"/>
<g transform="translate(256 256) scale({k}) translate(-256 -256)">
 <g transform="{g}">
  <path d="{GLYPH}" transform="translate(26 26)" fill="#0a2a8c"/>
  <path d="{GLYPH}" fill="#fff" stroke="#8cc6ff" stroke-width="22" stroke-linejoin="round" paint-order="stroke"/>
 </g>
 <g transform="rotate(-4 256 405)">
  <rect x="62" y="356" width="400" height="104" fill="#0a2a8c" transform="translate(12 12)"/>
  <rect x="62" y="356" width="400" height="104" fill="url(#or)"/>
  <text x="262" y="440" text-anchor="middle" font-family="Kanit" font-weight="800" font-style="italic" font-size="92" fill="#0a2a8c" letter-spacing="2">BKK11</text>
  <text x="257" y="435" text-anchor="middle" font-family="Kanit" font-weight="800" font-style="italic" font-size="92" fill="#fff" letter-spacing="2">BKK11</text>
 </g>
</g>
</svg>'''

def render(name, size, **kw):
    html = here / "_tmp.html"
    html.write_text(f'''<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Kanit:ital,wght@1,800&display=block" rel="stylesheet">
<style>html,body{{margin:0;background:transparent}}svg{{display:block;width:{size}px;height:{size}px}}</style></head><body>{svg(**kw)}</body></html>''')
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
        f"--window-size={size},{size}", "--virtual-time-budget=4000", f"--screenshot={here/name}", str(html)], check=True, capture_output=True)
    html.unlink()


render("icon-512.png", 512)
render("icon-192.png", 192)
render("apple-touch-icon.png", 180, rounded=False)
render("maskable-512.png", 512, rounded=False, k=0.8)
render("favicon-64.png", 64)
print("done")
