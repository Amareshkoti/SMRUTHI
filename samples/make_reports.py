"""Generate realistic Indian lab-report images for the SMRUTI demo.

Five reports, five years, five different hospitals. Each value sits inside its
own reference range, so no single report looks abnormal -- the rising trend is
only visible across all five. This is the scenario from slide 7 of the pitch.
"""
from PIL import Image, ImageDraw, ImageFont
import os, sys

W, H = 1240, 1754  # A4 at 150 dpi

def font(sz, bold=False):
    for name in (("arialbd.ttf","seguisb.ttf") if bold else ("arial.ttf","segoeui.ttf")):
        p = os.path.join(r"C:\Windows\Fonts", name)
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default(sz)

REPORTS = [
    dict(f="2021_apollo.png", hosp="APOLLO DIAGNOSTICS", addr="Jubilee Hills, Hyderabad - 500033",
         date="11/03/2021", pid="APL-2021-88431", doc="Dr. K. Ramesh Rao, MD",
         hba1c="5.6", fbs="92", chol="176"),
    dict(f="2022_yashoda.png", hosp="YASHODA LABORATORY SERVICES", addr="Somajiguda, Hyderabad - 500082",
         date="02/04/2022", pid="YSH/22/10238", doc="Dr. S. Lakshmi Prasad, MD",
         hba1c="5.8", fbs="98", chol="184"),
    dict(f="2023_kims.png", hosp="KIMS HOSPITALS - CENTRAL LAB", addr="Minister Road, Secunderabad - 500003",
         date="19/05/2023", pid="KIMS23-447120", doc="Dr. P. Anand Kumar, MD",
         hba1c="6.0", fbs="104", chol="192"),
    dict(f="2024_care.png", hosp="CARE HOSPITALS DIAGNOSTICS", addr="Banjara Hills, Hyderabad - 500034",
         date="08/03/2024", pid="CHD-24-009917", doc="Dr. M. Sridevi, MD",
         hba1c="6.2", fbs="111", chol="198"),
    dict(f="2025_continental.png", hosp="CONTINENTAL LABS", addr="Gachibowli, Hyderabad - 500032",
         date="21/06/2025", pid="CNT/2025/57302", doc="Dr. A. Venkatesh, MD",
         hba1c="6.4", fbs="118", chol="205"),
]

def draw(r):
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    d.rectangle([0,0,W,150], fill="#0b3d61")
    d.text((60,38), r["hosp"], font=font(38,True), fill="white")
    d.text((60,92), r["addr"], font=font(22), fill="#c9dced")
    d.text((60,180), "LABORATORY INVESTIGATION REPORT", font=font(28,True), fill="#0b3d61")
    d.line([60,220,W-60,220], fill="#0b3d61", width=3)

    y = 250
    for lab, val in [("Patient Name","Mr. AMARESH K"),("Age / Sex","34 Years / Male"),
                     ("Patient ID",r["pid"]),("Sample Collected On",r["date"]),
                     ("Report Date",r["date"]),("Referred By",r["doc"])]:
        d.text((60,y), lab, font=font(21), fill="#555")
        d.text((360,y), ": " + val, font=font(21,True), fill="black")
        y += 36

    y += 30
    d.text((60,y), "BIOCHEMISTRY", font=font(25,True), fill="#0b3d61"); y += 45
    d.rectangle([60,y,W-60,y+42], fill="#e8eef4")
    for x,t in [(75,"INVESTIGATION"),(560,"RESULT"),(730,"UNIT"),(900,"BIOLOGICAL REF. RANGE")]:
        d.text((x,y+11), t, font=font(20,True), fill="#0b3d61")
    y += 42

    rows = [
        ("Glycated Haemoglobin (HbA1c)", r["hba1c"], "%",       "4.0 - 6.5"),
        ("Estimated Average Glucose",    str(round(28.7*float(r["hba1c"])-46.7)), "mg/dL", "-"),
        ("Fasting Blood Sugar (FBS)",    r["fbs"],   "mg/dL",   "70 - 110"),
        ("Total Cholesterol",            r["chol"],  "mg/dL",   "< 200"),
        ("Serum Creatinine",             "0.9",      "mg/dL",   "0.7 - 1.3"),
        ("Haemoglobin",                  "14.2",     "g/dL",    "13.0 - 17.0"),
    ]
    for i,(name,val,unit,ref) in enumerate(rows):
        if i % 2: d.rectangle([60,y,W-60,y+40], fill="#fafbfc")
        d.text((75,y+10), name, font=font(21), fill="black")
        d.text((560,y+10), val, font=font(21,True), fill="black")
        d.text((730,y+10), unit, font=font(21), fill="#444")
        d.text((900,y+10), ref, font=font(21), fill="#444")
        d.line([60,y+40,W-60,y+40], fill="#dde3e9", width=1)
        y += 40

    y += 50
    d.text((60,y), "Interpretation:", font=font(21,True), fill="black"); y += 32
    d.text((60,y), "All investigated parameters are WITHIN NORMAL LIMITS.", font=font(21), fill="black"); y += 30
    d.text((60,y), "Clinical correlation is advised.", font=font(21), fill="black")

    d.text((60,H-190), "Verified by", font=font(19), fill="#666")
    d.text((60,H-158), r["doc"], font=font(23,True), fill="black")
    d.text((60,H-126), "Consultant Pathologist", font=font(19), fill="#666")
    d.line([60,H-70,W-60,H-70], fill="#ccc", width=1)
    d.text((60,H-52), "This is a computer generated report. Synthetic data for demonstration purposes only.",
           font=font(17), fill="#999")
    return img

out = os.path.dirname(os.path.abspath(__file__))
for r in REPORTS:
    p = os.path.join(out, r["f"])
    draw(r).save(p, "PNG")
    print("wrote", r["f"])
