"""Schneidet Karten/Diagramme aus den Buchseiten (SVG) als eigene SVG-Bilder aus.

Koordinaten sind in Pixeln der 724px-breiten Vorschau angegeben und werden
auf das 909x1286 viewBox-Format der Originalseiten umgerechnet.
"""
import os
import re
import sys

SRC = r"C:\Users\Darko\Downloads\Buch"
DST = os.path.join(os.path.dirname(__file__), "..", "img")
SCALE = 909 / 724

CROPS = {
    "energie_nutzung": (11, 45, 835, 680, 950),
    "kraftwerke_oesterreich": (13, 45, 625, 680, 952),
    "stromerzeugung": (14, 472, 590, 680, 945),
    "energieverbrauch_welt": (21, 45, 105, 680, 530),
    "mindmap_energie": (21, 330, 715, 680, 945),
    "treibhauseffekt": (23, 258, 135, 680, 372),
    "erdoel_karte": (25, 45, 562, 680, 950),
    "gradnetz_breitenkreise": (26, 472, 440, 680, 700),
    "gradnetz_laengenkreise": (26, 472, 712, 680, 960),
    "hoehe": (40, 472, 600, 680, 790),
    "traunkirchen_plan": (41, 368, 498, 680, 715),
    "shanghai_lage": (42, 472, 355, 680, 572),
    "lehrberufe": (55, 45, 600, 680, 870),
    "kinderarbeit": (61, 45, 105, 680, 532),
    "thermen": (72, 472, 268, 680, 870),
    "geld_bedeutung": (74, 472, 108, 680, 350),
    "vignette": (83, 45, 105, 258, 525),
    "alpen_verkehr": (83, 45, 535, 680, 970),
    "verkehrsmittel_vergleich": (85, 45, 585, 680, 945),
    "rhein_main_donau": (86, 472, 335, 680, 570),
}


def crop(name, page, x1, y1, x2, y2):
    with open(os.path.join(SRC, f"{page}.svg"), encoding="utf-8") as f:
        s = f.read()
    s = re.sub(r"<image\b[^>]*?/>", "", s, flags=re.S)
    x, y = x1 * SCALE, y1 * SCALE
    w, h = (x2 - x1) * SCALE, (y2 - y1) * SCALE
    s = re.sub(
        r'<svg x="0" y="0" width="909" height="1286" viewBox="0 0 909 1286"',
        f'<svg x="0" y="0" width="{w:.0f}" height="{h:.0f}" viewBox="{x:.1f} {y:.1f} {w:.1f} {h:.1f}"',
        s,
        count=1,
    )
    s = s.replace("display: block;margin-left: auto;margin-right: auto;", "display: block;")
    with open(os.path.join(DST, f"{name}.svg"), "w", encoding="utf-8") as f:
        f.write(s)


if __name__ == "__main__":
    os.makedirs(DST, exist_ok=True)
    for name, args in CROPS.items():
        if len(sys.argv) > 1 and name not in sys.argv[1:]:
            continue
        crop(name, *args)
        print("ok", name)
