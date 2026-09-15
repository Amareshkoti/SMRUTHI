from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet

doc = SimpleDocTemplate("addendum.pdf", pagesize=letter)
styles = getSampleStyleSheet()
elements = []

elements.append(Paragraph("ADDENDUM: New Biomarkers and Scientific Validations", styles['Heading1']))
elements.append(Spacer(1, 12))

elements.append(Paragraph("The following biomarkers were added to the signal processing pipeline, along with their physiological grounding and peer-reviewed citations:", styles['Normal']))
elements.append(Spacer(1, 12))

data = [
    ["Biomarker / Formula", "Physiological Grounding", "Primary Literature Citation", "Validation Findings"],
    ["Blood Oxygen (SpO2)\nAC/DC Ratio", "Ratio of pulsatile to baseline light absorption (AC/DC) across Red/Green wavelengths isolates oxygenated hemoglobin.", "Karlen, W., et al. (2010). Mobile phone pulse oximeter. IEEE.", "Accurately estimates SpO2 with a root-mean-square error comparable to clinical oximeters."],
    ["LF/HF Ratio\nFrequency HRV", "Quantifies the sympathovagal balance, acting as a clinical surrogate for physical and mental stress states.", "Malliani, A., et al. (1991). Circulation, 84(2), 482-492.", "Confirms validity of LF/HF ratio as an index of sympathovagal balance."],
    ["Stroke Volume (SV)\n& Cardiac Output", "Pulse contour analysis models establish that arterial pulse pressure is proportionally related to SV.", "Wang, L., et al. (2018). Sensors, 18(1), 173.", "Validated continuous noninvasive SV and CO estimation using PPG morphological features."]
]

t = Table(data, colWidths=[100, 150, 140, 130])
t.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 10),
    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
    ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
    ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('FONTSIZE', (0, 1), (-1, -1), 9),
]))

elements.append(t)
doc.build(elements)
